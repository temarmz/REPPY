begin;

select plan(36);

insert into auth.users (id)
values
  ('11000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000002'),
  ('11000000-0000-4000-8000-000000000003'),
  ('11000000-0000-4000-8000-000000000004');

insert into public.profiles (id, role, display_name)
values
  ('11000000-0000-4000-8000-000000000001', 'trainer', 'Trainer A'),
  ('11000000-0000-4000-8000-000000000002', 'student', 'Student A'),
  ('11000000-0000-4000-8000-000000000003', 'trainer', 'Trainer B'),
  ('11000000-0000-4000-8000-000000000004', 'student', 'Student B');

insert into public.students (id, account_id, created_by, name)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000001',
    'Student A'
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000004',
    '11000000-0000-4000-8000-000000000003',
    'Student B'
  );

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'active'
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000002',
    'active'
  );

insert into public.exercise_definitions (
  id,
  owner_id,
  name,
  primary_muscle,
  equipment
)
values
  (
    '01000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'Custom exercise A',
    'Core',
    'Mat'
  ),
  (
    '01000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000003',
    'Custom exercise B',
    'Core',
    'Mat'
  );

insert into public.assignments (
  id,
  relationship_id,
  scheduled_for,
  scheduled_time,
  status,
  workout_snapshot
)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    current_date,
    '18:00',
    'completed',
    '{"name":"Workout A","exercises":[{"id":"61000000-0000-4000-8000-000000000001","exerciseId":"01000000-0000-4000-8000-000000000001","plannedSets":[{}]}]}'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    current_date,
    '19:00',
    'completed',
    '{"name":"Workout B","exercises":[{"id":"61000000-0000-4000-8000-000000000002","exerciseId":"01000000-0000-4000-8000-000000000002","plannedSets":[{}]}]}'
  );

insert into public.workout_sessions (
  id,
  assignment_id,
  workout_snapshot,
  status,
  recorded_by_user_id,
  recorded_by_role,
  completed_at,
  completed_by_user_id,
  charge_status
)
values
  (
    '51000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '{"name":"Workout A","exercises":[{"id":"61000000-0000-4000-8000-000000000001","exerciseId":"01000000-0000-4000-8000-000000000001","plannedSets":[{}]}]}',
    'completed',
    '11000000-0000-4000-8000-000000000002',
    'student',
    now(),
    '11000000-0000-4000-8000-000000000002',
    'waived'
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000002',
    '{"name":"Workout B","exercises":[{"id":"61000000-0000-4000-8000-000000000002","exerciseId":"01000000-0000-4000-8000-000000000002","plannedSets":[{}]}]}',
    'completed',
    '11000000-0000-4000-8000-000000000004',
    'student',
    now(),
    '11000000-0000-4000-8000-000000000004',
    'waived'
  );

insert into public.set_results (
  id,
  session_id,
  exercise_definition_id,
  exercise_instance_id,
  set_number,
  actual_reps,
  actual_weight,
  completed
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    1,
    10,
    20,
    true
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    '01000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    1,
    10,
    20,
    true
  );

insert into public.subscription_entries (
  id,
  relationship_id,
  kind,
  lesson_delta,
  occurred_at,
  amount_rub,
  payment_method
)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'payment',
    8,
    now(),
    8000,
    'transfer'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    'payment',
    8,
    now(),
    8000,
    'transfer'
  );

insert into public.instruction_videos (
  id,
  relationship_id,
  uploaded_by,
  object_path,
  file_name,
  mime_type,
  byte_size
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000001/demo.mp4',
    'demo-a.mp4',
    'video/mp4',
    1024
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000002/91000000-0000-4000-8000-000000000002/demo.mp4',
    'demo-b.mp4',
    'video/mp4',
    1024
  );

insert into public.student_invitations (id, relationship_id, token_hash, target_email, expires_at)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    'student-a@example.com',
    now() + interval '1 day'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    decode(repeat('22', 32), 'hex'),
    'student-b@example.com',
    now() + interval '1 day'
  );

select ok(
  not exists (
    select 1
    from unnest(array[
      'profiles',
      'students',
      'trainer_student_relationships',
      'exercise_definitions',
      'assignments',
      'workout_sessions',
      'set_results',
      'subscription_entries',
      'instruction_videos',
      'student_invitations'
    ]) table_name
    where has_table_privilege('anon', format('public.%I', table_name), 'select')
  ),
  'anonymous users have no direct access to API tables'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 2, 'student sees only their own profile and trainer');
select is((select count(*)::integer from public.students), 1, 'student sees only their own student record');
select is((select count(*)::integer from public.trainer_student_relationships), 1, 'student sees only their own relationship');
select is((select count(*)::integer from public.exercise_definitions), 66, 'student sees only the system exercise library');
select is((select count(*)::integer from public.assignments), 1, 'student sees only their own assignments');
select is((select count(*)::integer from public.workout_sessions), 1, 'student sees only their own sessions');
select is((select count(*)::integer from public.set_results), 1, 'student sees only their own set results');
select is((select count(*)::integer from public.subscription_entries), 1, 'student sees only their own subscription ledger');
select is((select count(*)::integer from public.instruction_videos), 1, 'student sees only videos for their relationship');
select is((select count(*)::integer from public.student_invitations), 0, 'student cannot read invitation secrets');

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 2, 'trainer sees only their own profile and student account');
select is((select count(*)::integer from public.students), 1, 'trainer sees only their own student');
select is((select count(*)::integer from public.trainer_student_relationships), 1, 'trainer sees only their own relationship');
select is((select count(*)::integer from public.exercise_definitions), 67, 'trainer sees the system library and only their own custom exercise');
select is((select count(*)::integer from public.assignments), 1, 'trainer sees only their own assignments');
select is((select count(*)::integer from public.workout_sessions), 1, 'trainer sees only their own sessions');
select is((select count(*)::integer from public.set_results), 1, 'trainer sees only set results for their relationship');
select is((select count(*)::integer from public.subscription_entries), 1, 'trainer sees only their own subscription ledger');
select is((select count(*)::integer from public.instruction_videos), 1, 'trainer sees only their own video metadata');
select is((select count(*)::integer from public.student_invitations), 1, 'trainer sees only their own invitations');

insert into public.students (id, created_by, name)
values (
  '21000000-0000-4000-8000-000000000099',
  '11000000-0000-4000-8000-000000000001',
  'Pending Student'
);

select is(
  (select count(*)::integer from public.students where id = '21000000-0000-4000-8000-000000000099'),
  1,
  'trainer can read a student they created before creating the relationship'
);

select lives_ok(
  $$
    insert into public.students (id, created_by, name)
    values (
      '21000000-0000-4000-8000-000000000098',
      '11000000-0000-4000-8000-000000000001',
      'Returning Student'
    )
    returning id
  $$,
  'trainer can create a student through Data API insert returning'
);

select is_empty(
  $$
    with updated as (
      update public.assignments
      set scheduled_for = scheduled_for + 1
      where id = '41000000-0000-4000-8000-000000000001'
      returning id
    )
    select id from updated
  $$,
  'completed assignments cannot be changed through the Data API'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles where id = '11000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another trainer profile');
select is((select count(*)::integer from public.students where id = '21000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another student');
select is((select count(*)::integer from public.trainer_student_relationships where id = '31000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another relationship');
select is((select count(*)::integer from public.exercise_definitions where id = '01000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another custom exercise');
select is((select count(*)::integer from public.assignments where id = '41000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another assignment');
select is((select count(*)::integer from public.workout_sessions where id = '51000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another session');
select is((select count(*)::integer from public.set_results where id = '71000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another set result');
select is((select count(*)::integer from public.subscription_entries where id = '81000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another ledger');
select is((select count(*)::integer from public.instruction_videos where id = '91000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another video');
select is((select count(*)::integer from public.student_invitations where id = 'a1000000-0000-4000-8000-000000000001'), 0, 'unrelated trainer cannot see another invitation');

reset role;

select throws_ok(
  $$insert into public.assignments (
    id,
    relationship_id,
    scheduled_for,
    scheduled_time,
    workout_snapshot,
    repeated_from_assignment_id
  ) values (
    '41000000-0000-4000-8000-000000000099',
    '31000000-0000-4000-8000-000000000001',
    current_date,
    '20:00',
    '{"name":"Invalid repeat","exercises":[]}',
    '41000000-0000-4000-8000-000000000002'
  )$$,
  '23514',
  'Repeated assignment must belong to the same active relationship',
  'an assignment cannot repeat one from another relationship'
);

select throws_like(
  $$insert into public.instruction_videos (
    relationship_id,
    uploaded_by,
    object_path,
    file_name,
    mime_type,
    byte_size
  ) values (
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000002/wrong/video.mp4',
    'wrong.mp4',
    'video/mp4',
    1024
  )$$,
  '%instruction_videos_path_matches_relationship%',
  'video metadata must use the same relationship id in its storage path'
);

select * from finish();
rollback;
