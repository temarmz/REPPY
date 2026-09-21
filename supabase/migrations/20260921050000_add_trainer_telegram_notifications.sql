create type public.telegram_notification_kind as enum (
  'assignment-reschedule-requested',
  'workout-completed'
);

create table public.telegram_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.telegram_notification_kind not null,
  event_key text not null unique check (length(event_key) between 8 and 300),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index telegram_notification_outbox_pending_idx
  on public.telegram_notification_outbox (available_at, created_at)
  where status = 'pending';

alter table public.telegram_notification_outbox enable row level security;

create trigger telegram_notification_outbox_touch_updated_at
before update on public.telegram_notification_outbox
for each row execute function private.touch_updated_at();

create function private.enqueue_assignment_reschedule_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_student_name text;
begin
  if new.reschedule_requested_at is null
    or new.reschedule_requested_at is not distinct from old.reschedule_requested_at then
    return new;
  end if;

  select relationship.trainer_id, student.name
  into v_trainer_id, v_student_name
  from public.trainer_student_relationships relationship
  join public.students student on student.id = relationship.student_id
  where relationship.id = new.relationship_id;

  insert into public.telegram_notification_outbox (
    recipient_profile_id,
    actor_profile_id,
    kind,
    event_key,
    payload
  ) values (
    v_trainer_id,
    (select auth.uid()),
    'assignment-reschedule-requested',
    format('assignment-reschedule:%s:%s', new.id, new.reschedule_requested_at),
    jsonb_build_object(
      'studentName', v_student_name,
      'workoutName', coalesce(new.workout_snapshot ->> 'name', 'Тренировка'),
      'scheduledFor', new.reschedule_scheduled_for,
      'scheduledTime', new.reschedule_scheduled_time
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;

create trigger assignments_enqueue_reschedule_notification
after update of reschedule_requested_at on public.assignments
for each row execute function private.enqueue_assignment_reschedule_notification();

create function private.enqueue_workout_completed_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_student_account_id uuid;
  v_student_name text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select relationship.trainer_id, student.account_id, student.name
  into v_trainer_id, v_student_account_id, v_student_name
  from public.assignments assignment
  join public.trainer_student_relationships relationship on relationship.id = assignment.relationship_id
  join public.students student on student.id = relationship.student_id
  where assignment.id = new.assignment_id;

  if new.completed_by_user_id is distinct from v_student_account_id then
    return new;
  end if;

  insert into public.telegram_notification_outbox (
    recipient_profile_id,
    actor_profile_id,
    kind,
    event_key,
    payload
  ) values (
    v_trainer_id,
    new.completed_by_user_id,
    'workout-completed',
    format('workout-completed:%s', new.id),
    jsonb_build_object(
      'studentName', v_student_name,
      'workoutName', coalesce(new.workout_snapshot ->> 'name', 'Тренировка'),
      'completedAt', new.completed_at
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;

create trigger workout_sessions_enqueue_completed_notification
after update of status on public.workout_sessions
for each row execute function private.enqueue_workout_completed_notification();

create function public.claim_telegram_notifications(
  p_actor_profile_id uuid,
  p_limit integer default 10
)
returns table (
  notification_id uuid,
  notification_kind public.telegram_notification_kind,
  notification_payload jsonb,
  telegram_chat_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_profile_id is null then
    raise exception 'Actor is required' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.telegram_notification_outbox outbox
    join public.telegram_accounts account on account.profile_id = outbox.recipient_profile_id
    where (
      outbox.status = 'pending'
      or (outbox.status = 'processing' and outbox.processing_started_at < clock_timestamp() - interval '5 minutes')
    )
      and outbox.actor_profile_id = p_actor_profile_id
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < 20
    order by outbox.created_at
    for update of outbox skip locked
    limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.telegram_notification_outbox outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        processing_started_at = clock_timestamp(),
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_profile_id, outbox.kind, outbox.payload
  )
  select claimed.id, claimed.kind, claimed.payload, account.chat_id
  from claimed
  join public.telegram_accounts account on account.profile_id = claimed.recipient_profile_id;
end;
$$;

create function public.finish_telegram_notification(
  p_notification_id uuid,
  p_actor_profile_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_profile_id is null then
    raise exception 'Actor is required' using errcode = '22023';
  end if;

  update public.telegram_notification_outbox outbox
  set status = case when p_success then 'sent' else 'pending' end,
      sent_at = case when p_success then clock_timestamp() else null end,
      available_at = case
        when p_success then outbox.available_at
        else clock_timestamp() + make_interval(secs => least(900, 15 * greatest(outbox.attempts, 1)))
      end,
      processing_started_at = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Unknown delivery error'), 500) end
  where outbox.id = p_notification_id
    and outbox.actor_profile_id = p_actor_profile_id
    and outbox.status = 'processing';
end;
$$;

revoke all on table public.telegram_notification_outbox from public, anon, authenticated;
revoke all on function public.claim_telegram_notifications(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_telegram_notification(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_telegram_notifications(uuid, integer) to service_role;
grant execute on function public.finish_telegram_notification(uuid, uuid, boolean, text) to service_role;
