begin;

select plan(14);

select ok(
  has_function_privilege(
    'service_role',
    'public.accept_student_invitation_from_telegram(text, uuid, bigint, bigint, text, text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.accept_student_invitation_from_telegram(text, uuid, bigint, bigint, text, text)',
    'execute'
  ),
  'only the Telegram auth backend can accept a student invitation without email credentials'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.accept_existing_student_invitation_from_telegram(text, bigint)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.accept_existing_student_invitation_from_telegram(text, bigint)',
    'execute'
  ),
  'only the Telegram auth backend can attach another trainer to an existing student account'
);

insert into auth.users (id, email, email_confirmed_at)
values
  ('15000000-0000-4000-8000-000000000001', 'telegram-trainer@example.test', now()),
  ('15000000-0000-4000-8000-000000000002', 'telegram-550001@users.reppy.invalid', now());

insert into public.profiles (id, role, display_name)
values ('15000000-0000-4000-8000-000000000001', 'trainer', 'Telegram Trainer');

insert into public.students (id, created_by, name)
values ('25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'Telegram Student');

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '35000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'invited'
);

insert into public.student_invitations (relationship_id, token_hash, expires_at)
values (
  '35000000-0000-4000-8000-000000000001',
  extensions.digest(repeat('t', 43), 'sha256'),
  now() + interval '1 day'
);

set local role service_role;

select lives_ok(
  $$select public.accept_student_invitation_from_telegram(
    repeat('t', 43),
    '15000000-0000-4000-8000-000000000002',
    550001,
    550001,
    'telegram_student',
    'Telegram'
  )$$,
  'a verified Telegram identity can accept the trainer invitation'
);

reset role;

select is(
  (select role::text from public.profiles where id = '15000000-0000-4000-8000-000000000002'),
  'student',
  'the invited account receives only the student role'
);

select is(
  (select display_name from public.profiles where id = '15000000-0000-4000-8000-000000000002'),
  'Telegram Student',
  'the trainer-provided student name remains authoritative'
);

select is(
  (select telegram_user_id::text from public.telegram_accounts where profile_id = '15000000-0000-4000-8000-000000000002'),
  '550001',
  'the Telegram identity is linked during invitation acceptance'
);

select is(
  (select status::text from public.trainer_student_relationships where id = '35000000-0000-4000-8000-000000000001'),
  'active',
  'the trainer-student relationship becomes active'
);

select ok(
  (select accepted_at is not null from public.student_invitations where relationship_id = '35000000-0000-4000-8000-000000000001'),
  'the one-time invitation is consumed'
);

insert into auth.users (id, email, email_confirmed_at)
values ('15000000-0000-4000-8000-000000000003', 'second-telegram-trainer@example.test', now());

insert into public.profiles (id, role, display_name)
values ('15000000-0000-4000-8000-000000000003', 'trainer', 'Second Telegram Trainer');

insert into public.students (id, created_by, name)
values ('25000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003', 'Duplicate Student Card');

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '35000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000003',
  '25000000-0000-4000-8000-000000000002',
  'invited'
);

insert into public.student_invitations (relationship_id, token_hash, expires_at)
values (
  '35000000-0000-4000-8000-000000000002',
  extensions.digest(repeat('e', 43), 'sha256'),
  now() + interval '1 day'
);

insert into public.assignments (
  id, relationship_id, scheduled_for, scheduled_time, format, workout_snapshot
) values (
  '45000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000002',
  current_date + 1,
  '18:00',
  'in-person',
  '{"name":"Existing invitation workout","exercises":[]}'::jsonb
);

set local role service_role;

select lives_ok(
  $$select public.accept_existing_student_invitation_from_telegram(repeat('e', 43), 550001)$$,
  'an existing Telegram student can accept an invitation from another trainer'
);

reset role;

select is(
  (select status::text from public.trainer_student_relationships where id = '35000000-0000-4000-8000-000000000002'),
  'active',
  'the new trainer relationship becomes active'
);

select is(
  (select student_id::text from public.trainer_student_relationships where id = '35000000-0000-4000-8000-000000000002'),
  '25000000-0000-4000-8000-000000000001',
  'the new relationship points to the existing student profile'
);

select is(
  (select count(*)::integer from public.students where id = '25000000-0000-4000-8000-000000000002'),
  0,
  'the duplicate invited student card is removed after the relationship is transferred'
);

select is(
  (select accepted_by::text from public.student_invitations where relationship_id = '35000000-0000-4000-8000-000000000002'),
  '15000000-0000-4000-8000-000000000002',
  'the existing student account is recorded as the invitation recipient'
);

select is(
  (select count(*)::integer from public.assignments where relationship_id = '35000000-0000-4000-8000-000000000002'),
  1,
  'assignments created before invitation acceptance stay on the transferred relationship'
);

select * from finish();
rollback;
