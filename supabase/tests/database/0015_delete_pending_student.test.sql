begin;
select plan(9);
select ok(not has_function_privilege('anon', 'public.delete_pending_student(uuid)', 'execute'), 'anonymous cannot delete invitations');
insert into auth.users (id, email) values
 ('18000000-0000-4000-8000-000000000001', 'delete-owner@example.test'),
 ('18000000-0000-4000-8000-000000000002', 'delete-other@example.test');
insert into public.profiles (id, role, display_name) values
 ('18000000-0000-4000-8000-000000000001', 'trainer', 'Owner'),
 ('18000000-0000-4000-8000-000000000002', 'trainer', 'Other');
insert into public.students (id, created_by, name) values
 ('28000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001', 'Pending student'),
 ('28000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000001', 'Active student');
insert into public.trainer_student_relationships (id, trainer_id, student_id, status) values
 ('38000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 'invited'),
 ('38000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000002', 'active');
insert into public.student_invitations (relationship_id, token_hash, expires_at) values
 ('38000000-0000-4000-8000-000000000001', extensions.digest(repeat('d', 43), 'sha256'), now() + interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.delete_pending_student('28000000-0000-4000-8000-000000000001')$$, '42501', 'Invitation is not available', 'another trainer cannot delete');
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.delete_pending_student('28000000-0000-4000-8000-000000000002')$$, '40001', 'Student already accepted invitation', 'active student is protected');
select lives_ok($$select public.delete_pending_student('28000000-0000-4000-8000-000000000001')$$, 'owner can remove pending student');
select lives_ok($$select public.delete_pending_student('28000000-0000-4000-8000-000000000001')$$, 'retry is idempotent');
select is((select count(*)::integer from public.trainer_student_relationships where id = '38000000-0000-4000-8000-000000000001'), 0, 'archived relationship hidden by RLS');
reset role;
select is((select status::text from public.trainer_student_relationships where id = '38000000-0000-4000-8000-000000000001'), 'archived', 'pending relationship is archived');
select ok((select revoked_at is not null from public.student_invitations where relationship_id = '38000000-0000-4000-8000-000000000001'), 'link revoked');
select is((select status::text from public.trainer_student_relationships where id = '38000000-0000-4000-8000-000000000002'), 'active', 'active relationship unchanged');
select * from finish();
rollback;
