begin;

select plan(8);

select ok(
  has_function_privilege('authenticated', 'public.delete_subscription_payment(uuid, bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_subscription(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.delete_subscription(uuid)', 'execute'),
  'subscription deletion is available only to authenticated accounts'
);

insert into auth.users (id, email, email_confirmed_at)
values
  ('17000000-0000-4000-8000-000000000001', 'subscription-trainer@example.test', now()),
  ('17000000-0000-4000-8000-000000000002', 'subscription-student@example.test', now());

insert into public.profiles (id, role, display_name)
values
  ('17000000-0000-4000-8000-000000000001', 'trainer', 'Subscription Trainer'),
  ('17000000-0000-4000-8000-000000000002', 'student', 'Subscription Student');

insert into public.students (id, account_id, created_by, name)
values (
  '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000001',
  'Subscription Student'
);

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '37000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.subscription_entries (id, relationship_id, kind, lesson_delta, occurred_at, amount_rub, payment_method)
values
  ('47000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'payment', 8, now(), 11400, 'cash'),
  ('47000000-0000-4000-8000-000000000002', '37000000-0000-4000-8000-000000000001', 'payment', 4, now(), 6000, 'transfer');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.subscription_entries),
  2,
  'the student can read the ledger for their own relationship'
);

select throws_like(
  $$select public.delete_subscription_payment('47000000-0000-4000-8000-000000000001', 1)$$,
  '%Subscription payment changed or access denied%',
  'the student cannot delete a payment'
);

select throws_like(
  $$select public.delete_subscription('37000000-0000-4000-8000-000000000001')$$,
  '%Only the trainer can delete a subscription%',
  'the student cannot delete the full subscription'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.delete_subscription_payment('47000000-0000-4000-8000-000000000001', 1)$$,
  'the trainer can delete one payment'
);

select is(
  (select count(*)::integer from public.get_trainer_subscription_entries()),
  1,
  'deleting one payment keeps the rest of the subscription ledger'
);

select is(
  public.delete_subscription('37000000-0000-4000-8000-000000000001'),
  1,
  'the trainer can delete the remaining subscription history'
);

select is(
  (select count(*)::integer from public.get_trainer_subscription_entries()),
  0,
  'the full subscription deletion leaves an empty ledger'
);

select * from finish();
rollback;
