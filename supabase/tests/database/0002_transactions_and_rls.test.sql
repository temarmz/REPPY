begin;

select plan(21);

insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

insert into public.profiles (id, role, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'trainer', 'Trainer'),
  ('10000000-0000-4000-8000-000000000002', 'student', 'Student'),
  ('10000000-0000-4000-8000-000000000003', 'trainer', 'Outsider');

insert into public.students (id, account_id, created_by, name)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Student'
);

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.assignments (id, relationship_id, scheduled_for, scheduled_time, workout_snapshot)
values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  current_date,
  '18:00',
  '{"name":"Test workout","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":50}]}]}'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$select public.request_assignment_reschedule(
    '40000000-0000-4000-8000-000000000001',
    current_date + 1,
    '20:30'
  )$$,
  'student can request a new date and time'
);

select is(
  (
    select reschedule_scheduled_for::text || ' ' || to_char(reschedule_scheduled_time, 'HH24:MI')
    from public.assignments
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  (current_date + 1)::text || ' 20:30',
  'reschedule request is stored without changing the assignment schedule'
);

select lives_ok(
  $$select public.start_workout_session_with_id(
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000099'
  )$$,
  'student can start an assigned workout with a client-generated id'
);

select is(
  (select count(*)::integer from public.workout_sessions),
  1,
  'starting a workout creates one visible session'
);

select is(
  (select id from public.workout_sessions),
  '50000000-0000-4000-8000-000000000099'::uuid,
  'session keeps the client-generated id'
);

select lives_ok(
  $$select public.save_session_progress(
    (select id from public.workout_sessions where assignment_id = '40000000-0000-4000-8000-000000000001'),
    1,
    '{"name":"Test workout","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":50}]}]}',
    '[{"exerciseInstanceId":"50000000-0000-4000-8000-000000000001","setNumber":1,"actualReps":8,"actualWeight":50,"completed":true}]'
  )$$,
  'student can atomically save valid workout progress'
);

select is(
  (select revision from public.workout_sessions),
  2::bigint,
  'saving progress increments the session revision'
);

select is(
  (select count(*)::integer from public.set_results),
  1,
  'saving progress replaces the complete set result collection'
);

select throws_ok(
  $$select public.save_session_progress(
    (select id from public.workout_sessions where assignment_id = '40000000-0000-4000-8000-000000000001'),
    1,
    '{"name":"Test workout","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":50}]}]}',
    '[{"exerciseInstanceId":"50000000-0000-4000-8000-000000000001","setNumber":1,"actualReps":8,"actualWeight":50,"completed":true}]'
  )$$,
  '40001',
  'Session revision conflict',
  'stale progress writes are rejected'
);

select throws_ok(
  $$select public.save_session_progress(
    (select id from public.workout_sessions where assignment_id = '40000000-0000-4000-8000-000000000001'),
    2,
    '{"name":"Test workout","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":50}]}]}',
    '[{"exerciseInstanceId":"50000000-0000-4000-8000-000000000099","setNumber":1,"actualReps":8,"actualWeight":50,"completed":true}]'
  )$$,
  '22023',
  'Set results are invalid',
  'results for unknown exercise instances are rejected'
);

select lives_ok(
  $$select public.complete_workout_session(
    (select id from public.workout_sessions where assignment_id = '40000000-0000-4000-8000-000000000001'),
    false
  )$$,
  'student can complete a workout'
);

select lives_ok(
  $$select public.save_session_feedback(
    '50000000-0000-4000-8000-000000000099',
    'great',
    'Strong session'
  )$$,
  'student can save feedback for a completed workout'
);

select is(
  (select mood::text || ': ' || comment from public.workout_sessions),
  'great: Strong session',
  'completed workout feedback is persisted'
);

select is(
  (public.get_subscription_summary('30000000-0000-4000-8000-000000000001') ->> 'balance')::integer,
  -1,
  'student completion always charges one lesson'
);

select is(
  (select count(*)::integer from public.subscription_entries),
  1,
  'student can read the subscription ledger for their own relationship'
);

select lives_ok(
  $$select public.complete_workout_session(
    (select id from public.workout_sessions where assignment_id = '40000000-0000-4000-8000-000000000001'),
    false
  )$$,
  'repeated completion is accepted idempotently'
);

select is(
  (public.get_subscription_summary('30000000-0000-4000-8000-000000000001') ->> 'balance')::integer,
  -1,
  'repeated completion does not charge twice'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.assignments),
  0,
  'unrelated trainer cannot read the assignment'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$select public.archive_workout_session(
    (select session.id
     from public.workout_sessions session
     where session.assignment_id = '40000000-0000-4000-8000-000000000001')
  )$$,
  'trainer can archive a charged workout'
);

select lives_ok(
  $$select public.archive_workout_session(
    (select entry.session_id
     from public.subscription_entries entry
     where entry.kind = 'session-charge'
       and entry.relationship_id = '30000000-0000-4000-8000-000000000001')
  )$$,
  'repeated archive is accepted idempotently'
);

select is(
  (
    select count(*)::integer
    from public.subscription_entries
    where kind = 'session-refund'
      and relationship_id = '30000000-0000-4000-8000-000000000001'
  ),
  1,
  'archiving creates exactly one refund'
);

select * from finish();
rollback;
