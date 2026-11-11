begin;

select plan(12);

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


insert into public.assignments(id, relationship_id, scheduled_for, scheduled_time, workout_snapshot)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', current_date, '18:00',
'{"name":"Zero default","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":0,"targetWeight":0}]}]}');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.start_workout_session_with_id('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001')$$,'zero set starts');
select is((select actual_reps from public.set_results),0,'default has no invented repetitions');
select public.complete_workout_session('60000000-0000-4000-8000-000000000001',true);
select is((select completed from public.set_results where session_id='60000000-0000-4000-8000-000000000001'),false,'completion never invents repetitions in an empty set');
select lives_ok($$select public.save_session_progress('60000000-0000-4000-8000-000000000001',
(select revision from public.workout_sessions where id='60000000-0000-4000-8000-000000000001'),
(select workout_snapshot from public.workout_sessions where id='60000000-0000-4000-8000-000000000001'),
'[{"exerciseInstanceId":"50000000-0000-4000-8000-000000000001","setNumber":1,"actualReps":12,"actualWeight":20,"completed":true}]')$$,'trainer corrects completed facts');
select is((select actual_reps from public.set_results),12,'corrected facts saved');
select is((select status::text from public.workout_sessions),'completed','correction never reopens session');
select is((select count(*)::int from public.subscription_entries where kind='session-charge'),1,'correction never double charges');
select is((select count(*)::int from public.workout_session_corrections),1,'previous version retained');
select is((select previous_results->0->>'actual_reps' from public.workout_session_corrections),'0','audit retains previous facts');
select throws_ok($$select public.save_session_progress('60000000-0000-4000-8000-000000000001',1,'{}','[]')$$,'PT409','Session revision conflict','stale correction rejected');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.save_session_progress('60000000-0000-4000-8000-000000000001',1,'{}','[]')$$,'42501','Only the trainer may correct completed workouts','student cannot rewrite history');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.save_session_progress('60000000-0000-4000-8000-000000000001',1,'{}','[]')$$,'42501','Workout session access denied','unrelated trainer denied');
select * from finish();
rollback;
