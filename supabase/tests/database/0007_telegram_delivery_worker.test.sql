begin;

select plan(6);

select has_function(
  'public',
  'claim_due_telegram_notifications',
  array['integer'],
  'scheduled Telegram delivery claim RPC exists'
);

select has_function(
  'public',
  'configure_telegram_notification_delivery',
  array['text', 'text'],
  'Telegram delivery cron configuration RPC exists'
);

select ok(
  has_function_privilege('service_role', 'public.claim_due_telegram_notifications(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_due_telegram_notifications(integer)', 'execute')
    and not has_function_privilege('anon', 'public.claim_due_telegram_notifications(integer)', 'execute'),
  'only service role can claim notifications for scheduled delivery'
);

select ok(
  has_function_privilege('service_role', 'public.configure_telegram_notification_delivery(text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.configure_telegram_notification_delivery(text,text)', 'execute')
    and not has_function_privilege('anon', 'public.configure_telegram_notification_delivery(text,text)', 'execute'),
  'only service role can configure Telegram delivery cron'
);

insert into auth.users (id)
values
  ('17000000-0000-4000-8000-000000000001'),
  ('17000000-0000-4000-8000-000000000002');

insert into public.profiles (id, role, display_name)
values
  ('17000000-0000-4000-8000-000000000001', 'trainer', 'Delivery Trainer'),
  ('17000000-0000-4000-8000-000000000002', 'student', 'Delivery Student');

insert into public.telegram_accounts (profile_id, telegram_user_id, chat_id, first_name)
values ('17000000-0000-4000-8000-000000000001', 1700000001, 1700000001, 'Trainer');

insert into public.telegram_notification_outbox (
  id,
  recipient_profile_id,
  actor_profile_id,
  kind,
  event_key,
  payload
)
values
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'workout-completed',
    'scheduled-delivery-linked-recipient',
    '{"studentName":"Delivery Student","workoutName":"Delivery Workout"}'
  ),
  (
    '27000000-0000-4000-8000-000000000002',
    '17000000-0000-4000-8000-000000000002',
    '17000000-0000-4000-8000-000000000001',
    'assignment-created',
    'scheduled-delivery-unlinked-recipient',
    '{"studentName":"Delivery Student","workoutName":"Delivery Workout"}'
  );

set local role service_role;

select is(
  (select count(*)::integer from public.claim_due_telegram_notifications(25)),
  1,
  'worker claims only notifications whose recipient linked Telegram'
);

reset role;

select results_eq(
  $$select status, attempts from public.telegram_notification_outbox where id = '27000000-0000-4000-8000-000000000001'$$,
  $$values ('processing'::text, 1::integer)$$,
  'claim marks the notification as processing and increments attempts'
);

select * from finish();
rollback;
