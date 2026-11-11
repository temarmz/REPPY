begin;

select plan(18);

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

select throws_ok($$insert into public.assignments(relationship_id, scheduled_for, scheduled_time, workout_snapshot)
values ('30000000-0000-4000-8000-000000000001', current_date, '18:00', '{"name":"Draft","exercises":[]}')$$,
'22023', 'Добавь хотя бы одно упражнение.', 'an empty composer draft cannot be published');
select is((select count(*)::int from public.assignments where relationship_id='30000000-0000-4000-8000-000000000001'), 0, 'invalid publication creates no calendar entry');

select throws_ok($$insert into public.assignments(relationship_id, scheduled_for, scheduled_time, workout_snapshot)
values ('30000000-0000-4000-8000-000000000001', current_date, '18:00',
'{"name":"Draft","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":0,"targetWeight":10}]}]}')$$,
'22023', 'Количество должно быть больше нуля, вес — неотрицательным.', 'zero reps with nonzero weight cannot publish a half-filled set');

insert into public.assignments(id, relationship_id, scheduled_for, scheduled_time, workout_snapshot)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', current_date, '18:00',
'{"name":"Ready","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":0}]}]}');
select is((select count(*)::int from public.assignments where relationship_id='30000000-0000-4000-8000-000000000001'), 1, 'corrected submission publishes once and zero weight is valid');

-- Simulate a legacy empty assignment without modifying production records.
alter table public.assignments disable trigger assignments_validate_published_workout;
update public.assignments set workout_snapshot = '{"name":"Legacy draft","exercises":[]}';
alter table public.assignments enable trigger assignments_validate_published_workout;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.start_workout_session_with_id('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000099')$$,
'22023', 'Добавь хотя бы одно упражнение.', 'identified start rejects a legacy empty plan');
select is((select count(*)::int from public.workout_sessions), 0, 'failed start leaves no resumable empty session');
select throws_ok($$select public.start_workout_session('40000000-0000-4000-8000-000000000001')$$,
'22023', 'Добавь хотя бы одно упражнение.', 'legacy start RPC is protected too');
select is((select count(*)::int from public.workout_sessions), 0, 'neither RPC leaves a partial session');
reset role;
update public.assignments set workout_snapshot = '{"name":"Repaired","exercises":[{"id":"50000000-0000-4000-8000-000000000001","exerciseId":"00000000-0000-4000-8000-000000000001","plannedSets":[{"targetReps":8,"targetWeight":0}]}]}';
set local role authenticated;
select lives_ok($$select public.start_workout_session_with_id('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000099')$$,
'correcting the plan makes the same start attempt available');
select is((select count(*)::int from public.set_results), 1, 'starting atomically initializes results');
select is((select id from public.start_workout_session_with_id('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000098')),
'50000000-0000-4000-8000-000000000099'::uuid, 'a second device joins the canonical session');
select is((select count(*)::int from public.workout_sessions), 1, 'two devices create only one session');
reset role;
update public.set_results set completed=true, actual_reps=12;
set local role authenticated;
select lives_ok($$select public.start_workout_session('40000000-0000-4000-8000-000000000001')$$, 'legacy start also joins the same session');
select is((select actual_reps from public.set_results where completed), 12, 'joining does not overwrite completed work');
reset role;
update public.workout_sessions set workout_snapshot='{"name":"Legacy empty session","exercises":[]}';
set local role authenticated;
select throws_ok($$select public.start_workout_session('40000000-0000-4000-8000-000000000001')$$,
'22023', 'Empty session contains results and requires recovery', 'a corrupt empty snapshot cannot discard recorded results');
reset role;
delete from public.set_results;
set local role authenticated;
select lives_ok($$select public.start_workout_session('40000000-0000-4000-8000-000000000001')$$, 'a legacy empty active session is repaired on explicit start');
select is((select jsonb_array_length(workout_snapshot->'exercises') from public.workout_sessions),1,'recovery copies the published plan');
select is((select actual_reps from public.set_results),8,'recovery initializes the published sets');
select * from finish();
rollback;
