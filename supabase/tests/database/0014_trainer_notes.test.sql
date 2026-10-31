begin;
select plan(14);
select has_table('public', 'trainer_notes', 'private diary table exists');
select ok(not has_table_privilege('anon', 'public.trainer_notes', 'select'), 'anonymous users cannot read notes');
select ok(not has_table_privilege('authenticated', 'public.trainer_notes', 'insert,update,delete'), 'clients cannot bypass the note RPC');
select ok(not has_function_privilege('anon', 'public.save_trainer_note(date,text,integer,uuid)', 'execute'), 'anonymous users cannot save notes');

insert into auth.users (id, email, email_confirmed_at) values
 ('17000000-0000-4000-8000-000000000001', 'notes-trainer@example.test', now()),
 ('17000000-0000-4000-8000-000000000002', 'notes-other@example.test', now()),
 ('17000000-0000-4000-8000-000000000003', 'notes-student@example.test', now());
insert into public.profiles (id, role, display_name) values
 ('17000000-0000-4000-8000-000000000001', 'trainer', 'Diary trainer'),
 ('17000000-0000-4000-8000-000000000002', 'trainer', 'Other trainer'),
 ('17000000-0000-4000-8000-000000000003', 'student', 'Student');
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select is((select revision from public.save_trainer_note('2026-10-31', 'Private text', 0, '47000000-0000-4000-8000-000000000001')), 1, 'first write creates revision one');
select is((select revision from public.save_trainer_note('2026-10-31', 'Private text', 0, '47000000-0000-4000-8000-000000000001')), 1, 'retry is idempotent');
select is((select revision from public.save_trainer_note('2026-10-31', '', 1, '47000000-0000-4000-8000-000000000002')), 2, 'clearing text keeps its revision');
select throws_ok($$select public.save_trainer_note('2026-10-31', 'Old text', 1, '47000000-0000-4000-8000-000000000003')$$, '40001', 'Note revision conflict', 'stale writes cannot resurrect cleared text');
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.trainer_notes), 0, 'another trainer cannot read the owner diary');
select is((select revision from public.save_trainer_note('2026-10-31', 'Independent diary', 0, '47000000-0000-4000-8000-000000000004')), 1, 'another trainer has an independent diary');
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.trainer_notes), 0, 'students cannot read either diary');
select is((select revision from public.save_trainer_note('2026-10-31', 'Student write', 0, '47000000-0000-4000-8000-000000000005')), 1, 'students can write their own private diary');
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.save_trainer_note('2026-11-01', repeat('x', 50001), 0, '47000000-0000-4000-8000-000000000006')$$, '22023', 'Invalid note', 'server enforces the text limit');
select throws_ok($$select public.save_trainer_note(null, 'Text', 0, '47000000-0000-4000-8000-000000000007')$$, '22023', 'Invalid note', 'date is required');
reset role;
select * from finish();
rollback;
