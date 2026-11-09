-- Append-only previous versions allow a trainer correction to be investigated or restored.
create table public.workout_session_corrections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id),
  corrected_by uuid not null references public.profiles(id),
  corrected_at timestamptz not null default clock_timestamp(),
  previous_revision bigint not null,
  previous_workout jsonb not null,
  previous_results jsonb not null
);
alter table public.workout_session_corrections enable row level security;
grant select on public.workout_session_corrections to authenticated;
create policy corrections_read on public.workout_session_corrections for select to authenticated using (
  exists (select 1 from public.workout_sessions s join public.assignments a on a.id=s.assignment_id
    where s.id=session_id and private.can_read_relationship(a.relationship_id))
);

-- Drafts belong to the composer; an assignment is a published snapshot.
create or replace function private.assert_published_workout(p_snapshot jsonb, p_trainer_id uuid)
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
      if ((planned_set ->> 'targetReps')::numeric < 0 or ((planned_set ->> 'targetReps')::numeric = 0 and (planned_set ->> 'targetWeight')::numeric <> 0))
        or trunc((planned_set ->> 'targetReps')::numeric) <> (planned_set ->> 'targetReps')::numeric
        or (planned_set ->> 'targetWeight')::numeric < 0 then
        raise exception 'Количество должно быть больше нуля, вес — неотрицательным.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return;
end;
$$;


create or replace function public.save_session_progress(
  p_session_id uuid,
  p_expected_revision bigint,
  p_workout_snapshot jsonb,
  p_results jsonb
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_trainer_id uuid;
  v_exercise_count integer;
  v_expected_result_count integer;
  v_result_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision must be a positive integer' using errcode = '22023';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
    and session.status in ('active', 'completed')
    and session.deleted_at is null
    and assignment.deleted_at is null
  for update of session, assignment;

  if not found then
    raise exception 'Active workout session not found' using errcode = 'P0002';
  end if;

  select relationship.id, relationship.trainer_id
  into v_relationship_id, v_trainer_id
  from public.assignments assignment
  join public.trainer_student_relationships relationship
    on relationship.id = assignment.relationship_id
  where assignment.id = v_session.assignment_id;

  if not private.can_read_relationship(v_relationship_id) then
    raise exception 'Workout session access denied' using errcode = '42501';
  end if;

  -- Corrections never reopen the session or touch the subscription ledger.
  if v_session.status = 'completed' and v_trainer_id is distinct from (select auth.uid()) then
    raise exception 'Only the trainer may correct completed workouts' using errcode = '42501';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Session revision conflict' using errcode = 'PT409';
  end if;

  if jsonb_typeof(p_workout_snapshot) is distinct from 'object' then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  if nullif(btrim(p_workout_snapshot ->> 'name'), '') is null
    or jsonb_typeof(p_workout_snapshot -> 'exercises') is distinct from 'array'
  then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(p_workout_snapshot -> 'exercises') = 0 then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_exercise_count
  from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where jsonb_typeof(exercise) is distinct from 'object'
      or private.try_uuid(exercise ->> 'id') is null
      or private.try_uuid(exercise ->> 'exerciseId') is null
      or jsonb_typeof(exercise -> 'plannedSets') is distinct from 'array'
  ) then
    raise exception 'Workout snapshot exercises are invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where exists (
      select 1
      from jsonb_array_elements(exercise -> 'plannedSets') planned_set
      where jsonb_typeof(planned_set) is distinct from 'object'
    )
  ) then
    raise exception 'Workout snapshot exercises are invalid' using errcode = '22023';
  end if;

  if (
    select count(distinct private.try_uuid(exercise ->> 'id'))::integer
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
  ) <> v_exercise_count then
    raise exception 'Workout exercise instance ids must be unique' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    left join public.exercise_definitions definition
      on definition.id = private.try_uuid(exercise ->> 'exerciseId')
     and (definition.owner_id is null or definition.owner_id = v_trainer_id)
    where definition.id is null
  ) then
    raise exception 'Workout contains an unavailable exercise' using errcode = '22023';
  end if;

  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Set results must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_results) result
    where jsonb_typeof(result) is distinct from 'object'
  ) then
    raise exception 'Set results are invalid' using errcode = '22023';
  end if;

  select coalesce(sum(jsonb_array_length(exercise -> 'plannedSets')), 0)::integer
  into v_expected_result_count
  from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise;

  select count(*)::integer
  into v_result_count
  from jsonb_to_recordset(p_results) as result(
    "exerciseInstanceId" text,
    "setNumber" integer,
    "actualReps" integer,
    "actualWeight" numeric,
    "completed" boolean
  );

  if v_result_count <> v_expected_result_count then
    raise exception 'Set results must cover every planned set exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(
      "exerciseInstanceId" text,
      "setNumber" integer,
      "actualReps" integer,
      "actualWeight" numeric,
      "completed" boolean
    )
    left join lateral (
      select exercise
      from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
      where private.try_uuid(exercise ->> 'id') = private.try_uuid(result."exerciseInstanceId")
    ) snapshot_exercise on true
    where private.try_uuid(result."exerciseInstanceId") is null
      or result."setNumber" is null
      or result."setNumber" < 1
      or result."actualReps" is null
      or result."actualReps" < 0
      or result."actualWeight" is null
      or result."actualWeight" < 0
      or result."completed" is null
      or snapshot_exercise.exercise is null
      or result."setNumber" > jsonb_array_length(snapshot_exercise.exercise -> 'plannedSets')
  ) then
    raise exception 'Set results are invalid' using errcode = '22023';
  end if;

  if (
    select count(distinct (private.try_uuid(result."exerciseInstanceId"), result."setNumber"))::integer
    from jsonb_to_recordset(p_results) as result(
      "exerciseInstanceId" text,
      "setNumber" integer,
      "actualReps" integer,
      "actualWeight" numeric,
      "completed" boolean
    )
  ) <> v_result_count then
    raise exception 'Set results must cover every planned set exactly once' using errcode = '22023';
  end if;

  if v_session.status = 'completed' then
    insert into public.workout_session_corrections(session_id, corrected_by, previous_revision, previous_workout, previous_results)
    values (p_session_id, (select auth.uid()), v_session.revision, v_session.workout_snapshot,
      coalesce((select jsonb_agg(to_jsonb(r)) from public.set_results r where r.session_id=p_session_id), '[]'::jsonb));
  end if;

  update public.workout_sessions session
  set workout_snapshot = p_workout_snapshot
  where session.id = p_session_id
  returning session.* into v_session;

  delete from public.set_results result
  where result.session_id = p_session_id;

  insert into public.set_results (
    session_id,
    exercise_definition_id,
    exercise_instance_id,
    set_number,
    actual_reps,
    actual_weight,
    completed
  )
  select
    p_session_id,
    private.try_uuid(snapshot_exercise.exercise ->> 'exerciseId'),
    private.try_uuid(result."exerciseInstanceId"),
    result."setNumber",
    result."actualReps",
    result."actualWeight",
    result."completed"
  from jsonb_to_recordset(p_results) as result(
    "exerciseInstanceId" text,
    "setNumber" integer,
    "actualReps" integer,
    "actualWeight" numeric,
    "completed" boolean
  )
  join lateral (
    select exercise
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where private.try_uuid(exercise ->> 'id') = private.try_uuid(result."exerciseInstanceId")
  ) snapshot_exercise on true;

  return v_session;
end;
$$;
