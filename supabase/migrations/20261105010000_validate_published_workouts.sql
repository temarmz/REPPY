-- Drafts belong to the composer; an assignment is a published snapshot.
create function private.assert_published_workout(p_snapshot jsonb, p_trainer_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  exercise jsonb;
  planned_set jsonb;
  seen_ids uuid[] := '{}';
  instance_id uuid;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or nullif(btrim(p_snapshot ->> 'name'), '') is null
    or jsonb_typeof(p_snapshot -> 'exercises') is distinct from 'array' then
    raise exception 'Добавь название и упражнения тренировки.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_snapshot -> 'exercises') = 0 then
    raise exception 'Добавь хотя бы одно упражнение.' using errcode = '22023';
  end if;
  for exercise in select value from jsonb_array_elements(p_snapshot -> 'exercises') loop
    instance_id := private.try_uuid(exercise ->> 'id');
    if instance_id is null or instance_id = any(seen_ids)
      or private.try_uuid(exercise ->> 'exerciseId') is null
      or jsonb_typeof(exercise -> 'plannedSets') is distinct from 'array' then
      raise exception 'Проверь упражнения тренировки.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.exercise_definitions d
      where d.id = private.try_uuid(exercise ->> 'exerciseId') and (d.owner_id is null or d.owner_id = p_trainer_id)) then
      raise exception 'Workout contains an unavailable exercise' using errcode = '22023';
    end if;
    seen_ids := array_append(seen_ids, instance_id);
    for planned_set in select value from jsonb_array_elements(exercise -> 'plannedSets') loop
      if jsonb_typeof(planned_set -> 'targetReps') is distinct from 'number'
        or jsonb_typeof(planned_set -> 'targetWeight') is distinct from 'number' then
        raise exception 'Заполни повторы и вес подходов.' using errcode = '22023';
      end if;
      if (planned_set ->> 'targetReps')::numeric <= 0
        or trunc((planned_set ->> 'targetReps')::numeric) <> (planned_set ->> 'targetReps')::numeric
        or (planned_set ->> 'targetWeight')::numeric < 0 then
        raise exception 'Количество должно быть больше нуля, вес — неотрицательным.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return;
end;
$$;

create function private.validate_published_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare trainer_id uuid;
begin
  if tg_table_name = 'assignments' then
    select r.trainer_id into trainer_id from public.trainer_student_relationships r where r.id = new.relationship_id;
  else
    select r.trainer_id into trainer_id from public.assignments a
      join public.trainer_student_relationships r on r.id = a.relationship_id where a.id = new.assignment_id;
  end if;
  perform private.assert_published_workout(new.workout_snapshot, trainer_id);
  return new;
end;
$$;

create trigger assignments_validate_published_workout
before insert or update of workout_snapshot on public.assignments
for each row execute function private.validate_published_workout();

-- Both start RPCs are protected before INSERT, so an invalid legacy assignment
-- cannot leave a session behind even when the following progress request fails.
create trigger workout_sessions_validate_initial_workout
before insert on public.workout_sessions
for each row execute function private.validate_published_workout();

revoke all on function private.validate_published_workout() from public, anon, authenticated;

-- Creation and initial results are one transaction. Joining an existing session
-- never rewrites its snapshot or recorded results.
create function private.start_published_workout(p_assignment_id uuid, p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.assignments%rowtype;
  saved public.workout_sessions%rowtype;
  trainer_id uuid;
  actor_role public.app_role;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_session_id is null then raise exception 'Session id is required' using errcode = '22023'; end if;
  select a.* into assignment from public.assignments a
    where a.id = p_assignment_id and a.status = 'assigned' and a.deleted_at is null for update;
  if not found then raise exception 'Assignment is not available' using errcode = 'P0002'; end if;
  if private.is_relationship_trainer(assignment.relationship_id) then actor_role := 'trainer';
  elsif private.is_relationship_student(assignment.relationship_id) then actor_role := 'student';
  else raise exception 'Assignment access denied' using errcode = '42501'; end if;
  select r.trainer_id into trainer_id from public.trainer_student_relationships r where r.id = assignment.relationship_id;
  select s.* into saved from public.workout_sessions s where s.assignment_id = assignment.id for update;
  if found then
    if saved.deleted_at is not null or saved.status <> 'active' then
      raise exception 'Assignment already has an archived session' using errcode = '23505';
    end if;
    if jsonb_array_length(saved.workout_snapshot->'exercises') = 0 then
      if exists(select 1 from public.set_results where session_id = saved.id) then
        raise exception 'Empty session contains results and requires recovery' using errcode = '22023';
      end if;
      perform private.assert_published_workout(assignment.workout_snapshot, trainer_id);
      update public.workout_sessions set workout_snapshot = assignment.workout_snapshot where id = saved.id returning * into saved;
    end if;
  else
    perform private.assert_published_workout(assignment.workout_snapshot, trainer_id);
    insert into public.workout_sessions(id,assignment_id,workout_snapshot,recorded_by_user_id,recorded_by_role)
      values(p_session_id,assignment.id,assignment.workout_snapshot,(select auth.uid()),actor_role) returning * into saved;
  end if;
  insert into public.set_results(session_id,exercise_definition_id,exercise_instance_id,set_number,actual_reps,actual_weight,completed)
    select saved.id, private.try_uuid(e->>'exerciseId'), private.try_uuid(e->>'id'), n::smallint,
      (plan->>'targetReps')::integer, case when e->>'loadMode'='bodyweight' then 0 else (plan->>'targetWeight')::numeric end, false
    from jsonb_array_elements(saved.workout_snapshot->'exercises') e
    cross join lateral jsonb_array_elements(e->'plannedSets') with ordinality as sets(plan,n)
    on conflict(session_id,exercise_instance_id,set_number) do nothing;
  return saved;
end;
$$;

create or replace function public.start_workout_session_with_id(p_assignment_id uuid,p_session_id uuid)
returns public.workout_sessions language sql security definer set search_path = ''
as $$ select private.start_published_workout(p_assignment_id,p_session_id); $$;
create or replace function public.start_workout_session(p_assignment_id uuid)
returns public.workout_sessions language sql security definer set search_path = ''
as $$ select private.start_published_workout(p_assignment_id,pg_catalog.gen_random_uuid()); $$;

revoke all on function private.assert_published_workout(jsonb,uuid) from public,anon,authenticated;
revoke all on function private.start_published_workout(uuid,uuid) from public,anon,authenticated;
