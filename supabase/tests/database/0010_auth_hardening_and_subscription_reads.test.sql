begin;

select plan(8);

select ok(
  has_function_privilege('service_role', 'public.consume_telegram_auth_rate_limit(text, integer, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_telegram_auth_rate_limit(text, integer, integer, integer)', 'execute'),
  'only the trusted Telegram backend can consume a rate limit'
);

select ok(
  has_function_privilege('authenticated', 'public.get_trainer_subscription_entries()', 'execute')
  and not has_function_privilege('anon', 'public.get_trainer_subscription_entries()', 'execute'),
  'only authenticated accounts can request the trainer subscription ledger'
);

create temporary table rate_results (position integer primary key, result jsonb);
grant select, insert on rate_results to service_role;

set local role service_role;
insert into rate_results values
  (1, public.consume_telegram_auth_rate_limit(repeat('a', 64), 2, 60, 120)),
  (2, public.consume_telegram_auth_rate_limit(repeat('a', 64), 2, 60, 120)),
  (3, public.consume_telegram_auth_rate_limit(repeat('a', 64), 2, 60, 120));
reset role;

select is((select result ->> 'allowed' from rate_results where position = 1), 'true', 'the first Telegram auth attempt is allowed');
select is((select result ->> 'allowed' from rate_results where position = 2), 'true', 'attempts up to the configured limit are allowed');
select is((select result ->> 'allowed' from rate_results where position = 3), 'false', 'an attempt above the limit is blocked');
select ok((select (result ->> 'retryAfterSeconds')::integer >= 120 from rate_results where position = 3), 'a blocked attempt includes a retry delay');

insert into auth.users (id, email, email_confirmed_at)
values ('16000000-0000-4000-8000-000000000001', 'ledger-trainer@example.test', now());

insert into public.profiles (id, role, display_name)
values ('16000000-0000-4000-8000-000000000001', 'trainer', 'Ledger Trainer');

insert into public.students (id, created_by, name)
values ('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'Ledger Student');

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '36000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.subscription_entries (relationship_id, kind, lesson_delta, occurred_at, amount_rub, payment_method)
values ('36000000-0000-4000-8000-000000000001', 'payment', 8, now(), 12000, 'transfer');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.get_trainer_subscription_entries()),
  1,
  'the trainer ledger RPC returns a saved subscription payment'
);

reset role;

insert into public.student_invitations (relationship_id, token_hash, target_email, expires_at)
values (
  '36000000-0000-4000-8000-000000000001',
  extensions.digest(repeat('x', 43), 'sha256'),
  'expired@example.test',
  now() - interval '1 minute'
);

select throws_like(
  $$select public.get_student_invitation_preview(repeat('x', 43))$$,
  '%Invitation is not available: expired%',
  'an expired invitation has a distinct user-facing reason'
);

select * from finish();
rollback;
