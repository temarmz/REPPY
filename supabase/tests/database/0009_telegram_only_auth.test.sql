begin;

select plan(7);

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

insert into public.student_invitations (relationship_id, token_hash, target_email, expires_at)
values (
  '35000000-0000-4000-8000-000000000001',
  extensions.digest(repeat('t', 43), 'sha256'),
  'unused@example.test',
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

select * from finish();
rollback;
