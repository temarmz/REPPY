-- Keep the effective charge reversible while preserving the workout itself.
create function public.set_session_charge(p_session_id uuid, p_charged boolean)
returns public.workout_sessions language plpgsql security definer set search_path = '' as $$
declare s public.workout_sessions%rowtype; relationship uuid;
begin
  select w.* into s from public.workout_sessions w where w.id = p_session_id and w.deleted_at is null for update;
  if not found or s.status <> 'completed' then raise exception 'Completed workout not found'; end if;
  select a.relationship_id into relationship from public.assignments a where a.id = s.assignment_id and a.deleted_at is null;
  if not private.is_relationship_trainer(relationship) then raise exception 'Trainer access required' using errcode = '42501'; end if;
  if p_charged is null then raise exception 'Charge choice required'; end if;
  if p_charged then
    delete from public.subscription_entries where session_id = s.id and kind = 'session-refund';
    insert into public.subscription_entries(relationship_id, kind, lesson_delta, occurred_at, session_id, workout_name)
    values (relationship, 'session-charge', -1, s.completed_at, s.id, s.workout_snapshot ->> 'name')
    on conflict (session_id, kind) do nothing;
  elsif exists(select 1 from public.subscription_entries where session_id = s.id and kind = 'session-charge') then
    insert into public.subscription_entries(relationship_id, kind, lesson_delta, occurred_at, session_id, workout_name)
    values (relationship, 'session-refund', 1, clock_timestamp(), s.id, s.workout_snapshot ->> 'name')
    on conflict (session_id, kind) do nothing;
  end if;
  update public.workout_sessions set charge_status = case when p_charged then 'charged'::public.session_charge_status else 'waived'::public.session_charge_status end where id = s.id returning * into s;
  return s;
end;
$$;
revoke all on function public.set_session_charge(uuid, boolean) from public, anon;
grant execute on function public.set_session_charge(uuid, boolean) to authenticated;

alter table public.workout_sessions add column auto_completed boolean not null default false;
create function private.auto_complete_workouts() returns void language plpgsql security definer set search_path = '' as $$
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
    values(s.relationship_id, 'session-charge', -1, cutoff, s.id, s.workout_snapshot ->> 'name') on conflict(session_id, kind) do nothing;
  end loop;
end;
$$;
revoke all on function private.auto_complete_workouts() from public, anon, authenticated;
select cron.schedule('reppy-auto-complete-workouts', '*/5 * * * *', 'select private.auto_complete_workouts()');
