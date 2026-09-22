create function private.enqueue_assignment_change_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
  v_trainer_id uuid;
  v_student_account_id uuid;
  v_kind public.telegram_notification_kind;
  v_event_key text;
begin
  if tg_op = 'DELETE' then
    v_assignment := old;
  else
    v_assignment := new;
  end if;

  select relationship.trainer_id, student.account_id
  into v_trainer_id, v_student_account_id
  from public.trainer_student_relationships relationship
  join public.students student on student.id = relationship.student_id
  where relationship.id = v_assignment.relationship_id;

  if v_student_account_id is null
    or (select auth.uid()) is distinct from v_trainer_id
    or not exists (
      select 1
      from public.telegram_accounts account
      where account.profile_id = v_student_account_id
    ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_kind := 'assignment-created';
    v_event_key := format('assignment-created:%s', new.id);
  elsif tg_op = 'DELETE' then
    v_kind := 'assignment-canceled';
    v_event_key := format('assignment-canceled:%s', old.id);
  else
    if old.reschedule_requested_at is not null
      and new.reschedule_requested_at is null then
      return new;
    end if;

    if new.scheduled_for is not distinct from old.scheduled_for
      and new.scheduled_time is not distinct from old.scheduled_time
      and new.format is not distinct from old.format
      and new.workout_snapshot is not distinct from old.workout_snapshot then
      return new;
    end if;

    v_kind := 'assignment-updated';
    v_event_key := format('assignment-updated:%s:%s', new.id, new.revision);
  end if;

  insert into public.telegram_notification_outbox (
    recipient_profile_id,
    actor_profile_id,
    kind,
    event_key,
    payload
  ) values (
    v_student_account_id,
    v_trainer_id,
    v_kind,
    v_event_key,
    jsonb_build_object(
      'workoutName', coalesce(v_assignment.workout_snapshot ->> 'name', 'Тренировка'),
      'scheduledFor', v_assignment.scheduled_for,
      'scheduledTime', v_assignment.scheduled_time,
      'format', v_assignment.format
    )
  ) on conflict (event_key) do nothing;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger assignments_enqueue_change_notification
after insert or update or delete on public.assignments
for each row execute function private.enqueue_assignment_change_notification();
