create function public.start_workout_session_with_id(
  p_assignment_id uuid,
  p_session_id uuid
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_assignment public.assignments%rowtype;
  v_session public.workout_sessions%rowtype;
  v_recorded_by_role public.app_role;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_session_id is null then
    raise exception 'Session id is required' using errcode = '22023';
  end if;

  select assignment.*
  into v_assignment
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and assignment.status = 'assigned'
    and assignment.deleted_at is null
  for update;

  if not found then
    raise exception 'Assignment is not available' using errcode = 'P0002';
  end if;

  if private.is_relationship_trainer(v_assignment.relationship_id) then
    v_recorded_by_role := 'trainer';
  elsif private.is_relationship_student(v_assignment.relationship_id) then
    v_recorded_by_role := 'student';
  else
    raise exception 'Assignment access denied' using errcode = '42501';
  end if;

  insert into public.workout_sessions (
    id,
    assignment_id,
    workout_snapshot,
    recorded_by_user_id,
    recorded_by_role
  )
  values (
    p_session_id,
    v_assignment.id,
    v_assignment.workout_snapshot,
    v_user_id,
    v_recorded_by_role
  )
  on conflict (assignment_id) do nothing;

  select session.*
  into v_session
  from public.workout_sessions session
  where session.assignment_id = v_assignment.id
    and session.deleted_at is null;

  if not found then
    raise exception 'Assignment already has an archived session' using errcode = '23505';
  end if;

  if v_session.id <> p_session_id then
    raise exception 'Assignment already has another session' using errcode = '23505';
  end if;

  return v_session;
end;
$$;

create function public.request_assignment_reschedule(
  p_assignment_id uuid,
  p_scheduled_for date,
  p_scheduled_time time
)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select assignment.*
  into v_assignment
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and assignment.status = 'assigned'
    and assignment.format = 'in-person'
    and assignment.deleted_at is null
  for update;

  if not found then
    raise exception 'Assignment is not available for rescheduling' using errcode = 'P0002';
  end if;

  if not private.is_relationship_student(v_assignment.relationship_id) then
    raise exception 'Only the assigned student can request rescheduling' using errcode = '42501';
  end if;

  if p_scheduled_for is null or p_scheduled_time is null then
    raise exception 'Requested date and time are required' using errcode = '22023';
  end if;

  update public.assignments assignment
  set reschedule_scheduled_for = p_scheduled_for,
      reschedule_scheduled_time = p_scheduled_time,
      reschedule_requested_at = clock_timestamp()
  where assignment.id = p_assignment_id
  returning assignment.* into v_assignment;

  return v_assignment;
end;
$$;

create function public.save_session_feedback(
  p_session_id uuid,
  p_mood public.mood_rating,
  p_comment text
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
    and session.status = 'completed'
    and session.deleted_at is null
    and assignment.deleted_at is null
  for update of session;

  if not found then
    raise exception 'Completed workout session not found' using errcode = 'P0002';
  end if;

  select assignment.relationship_id
  into v_relationship_id
  from public.assignments assignment
  where assignment.id = v_session.assignment_id;

  if not private.can_read_relationship(v_relationship_id) then
    raise exception 'Workout session access denied' using errcode = '42501';
  end if;

  update public.workout_sessions session
  set mood = p_mood,
      comment = nullif(btrim(p_comment), '')
  where session.id = p_session_id
  returning session.* into v_session;

  return v_session;
end;
$$;

revoke all on function public.start_workout_session_with_id(uuid, uuid) from public, anon;
revoke all on function public.request_assignment_reschedule(uuid, date, time) from public, anon;
revoke all on function public.save_session_feedback(uuid, public.mood_rating, text) from public, anon;
grant execute on function public.start_workout_session_with_id(uuid, uuid) to authenticated;
grant execute on function public.request_assignment_reschedule(uuid, date, time) to authenticated;
grant execute on function public.save_session_feedback(uuid, public.mood_rating, text) to authenticated;
