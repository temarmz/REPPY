-- Preserve every new charge/refund transition. Existing balances stay unchanged.
-- Old deleted refund events cannot be reconstructed from the effective ledger.
alter table public.subscription_entries drop constraint subscription_entries_session_id_kind_key;
create index subscription_entries_session_kind_idx on public.subscription_entries(session_id, kind);

create or replace function public.set_session_charge(p_session_id uuid, p_charged boolean)
returns public.workout_sessions language plpgsql security definer set search_path = '' as $$
declare s public.workout_sessions%rowtype; relationship uuid; balance integer;
begin
  select w.* into s from public.workout_sessions w where w.id = p_session_id and w.deleted_at is null for update;
  if not found or s.status <> 'completed' then raise exception 'Completed workout not found'; end if;
  select a.relationship_id into relationship from public.assignments a where a.id = s.assignment_id and a.deleted_at is null;
  if not private.is_relationship_trainer(relationship) then raise exception 'Trainer access required' using errcode = '42501'; end if;
  if p_charged is null then raise exception 'Charge choice required'; end if;
  select coalesce(sum(e.lesson_delta), 0) into balance from public.subscription_entries e where e.session_id = s.id;
  -- The session lock serializes choices. A retry of the effective choice is a no-op.
  if (p_charged and balance = 0) or (not p_charged and balance < 0) then
    insert into public.subscription_entries(relationship_id, kind, lesson_delta, occurred_at, session_id, workout_name)
    values (relationship,
      case when p_charged then 'session-charge'::public.subscription_entry_kind else 'session-refund'::public.subscription_entry_kind end,
      case when p_charged then -1 else 1 end, clock_timestamp(), s.id, s.workout_snapshot ->> 'name');
  end if;
  update public.workout_sessions set charge_status = case when p_charged then 'charged'::public.session_charge_status else 'waived'::public.session_charge_status end where id = s.id returning * into s;
  return s;
end;
$$;

create or replace function public.complete_workout_session(
  p_session_id uuid,
  p_charge_subscription boolean default true
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_is_trainer boolean;
  v_is_student boolean;
  v_charge_subscription boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
    and session.deleted_at is null
    and assignment.deleted_at is null
  for update of session, assignment;

  if not found then
    raise exception 'Workout session not found' using errcode = 'P0002';
  end if;

  select assignment.relationship_id
  into v_relationship_id
  from public.assignments assignment
  where assignment.id = v_session.assignment_id;

  v_is_trainer := private.is_relationship_trainer(v_relationship_id);
  v_is_student := private.is_relationship_student(v_relationship_id);
  if not v_is_trainer and not v_is_student then
    raise exception 'Workout session access denied' using errcode = '42501';
  end if;

  if v_session.status = 'completed' then
    return v_session;
  end if;

  v_charge_subscription := case
    when v_is_student then true
    else p_charge_subscription
  end;

  update public.workout_sessions session
  set status = 'completed',
      completed_at = clock_timestamp(),
      completed_by_user_id = v_user_id,
      charge_status = case
        when v_charge_subscription then 'charged'::public.session_charge_status
        else 'waived'::public.session_charge_status
      end
  where session.id = p_session_id
  returning session.* into v_session;

  update public.assignments assignment
  set status = 'completed'
  where assignment.id = v_session.assignment_id;

  if v_charge_subscription then
    insert into public.subscription_entries (
      relationship_id,
      kind,
      lesson_delta,
      occurred_at,
      session_id,
      workout_name
    )
    values (
      v_relationship_id,
      'session-charge',
      -1,
      v_session.completed_at,
      v_session.id,
      coalesce(v_session.workout_snapshot ->> 'name', 'Тренировка')
    )
    on conflict (id) do nothing;
  end if;

  return v_session;
end;
$$;


create or replace function public.archive_workout_session(p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_archived_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
  for update of session, assignment;

  if not found then
    raise exception 'Workout session not found' using errcode = 'P0002';
  end if;

  select assignment.relationship_id
  into v_relationship_id
  from public.assignments assignment
  where assignment.id = v_session.assignment_id;

  if not private.is_relationship_trainer(v_relationship_id) then
    raise exception 'Only the trainer can archive a workout session' using errcode = '42501';
  end if;

  if v_session.deleted_at is not null then
    return v_session;
  end if;

  if (select coalesce(sum(entry.lesson_delta), 0) from public.subscription_entries entry
      where entry.session_id = v_session.id) < 0 then
    insert into public.subscription_entries (
      relationship_id,
      kind,
      lesson_delta,
      occurred_at,
      session_id,
      workout_name
    )
    values (
      v_relationship_id,
      'session-refund',
      1,
      v_archived_at,
      v_session.id,
      coalesce(v_session.workout_snapshot ->> 'name', 'Тренировка')
    )
    on conflict (id) do nothing;
  end if;

  update public.workout_sessions session
  set deleted_at = v_archived_at
  where session.id = p_session_id
  returning session.* into v_session;

  update public.assignments assignment
  set deleted_at = v_archived_at
  where assignment.id = v_session.assignment_id;

  return v_session;
end;
$$;
create or replace function private.auto_complete_workouts() returns void language plpgsql security definer set search_path = '' as $$
declare s record; cutoff timestamptz;
begin
  for s in select w.*, a.relationship_id, coalesce(a.timezone, r.timezone, 'UTC') as zone
    from public.workout_sessions w join public.assignments a on a.id = w.assignment_id
    join public.trainer_student_relationships r on r.id = a.relationship_id
    where w.status = 'active' and w.deleted_at is null and a.deleted_at is null
    for update of w, a skip locked
  loop
    cutoff := ((s.started_at at time zone s.zone)::date + interval '1 day 12 hours') at time zone s.zone;
    if clock_timestamp() < cutoff then continue; end if;
    update public.workout_sessions set status = 'completed', completed_at = cutoff,
      completed_by_user_id = s.recorded_by_user_id, charge_status = 'charged', auto_completed = true where id = s.id;
    update public.assignments set status = 'completed' where id = s.assignment_id;
    insert into public.subscription_entries(relationship_id, kind, lesson_delta, occurred_at, session_id, workout_name)
    values(s.relationship_id, 'session-charge', -1, cutoff, s.id, s.workout_snapshot ->> 'name') on conflict(id) do nothing;
  end loop;
end;
$$;
