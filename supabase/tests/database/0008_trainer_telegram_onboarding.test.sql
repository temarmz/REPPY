begin;

select plan(19);

create temporary table trainer_registration_payloads (
  label text primary key,
  payload jsonb not null
);

grant select, insert, update, delete on trainer_registration_payloads to anon, authenticated, service_role;

select ok(
  not has_function_privilege('authenticated', 'public.issue_trainer_registration_invitation(text)', 'execute'),
  'only the service role can issue trainer registration invitations'
);

select ok(
  has_function_privilege('anon', 'public.start_trainer_registration(text, text, text)', 'execute'),
  'an invited trainer can start registration before authentication'
);

select ok(
  has_function_privilege('anon', 'public.restart_trainer_registration(text)', 'execute'),
  'a pending registration can renew its Telegram verification link'
);

select ok(
  has_function_privilege('service_role', 'public.verify_trainer_registration(text, bigint, bigint, text, text)', 'execute'),
  'only the webhook service role can verify a Telegram account'
);

set local role service_role;

insert into trainer_registration_payloads (label, payload)
values ('invite', public.issue_trainer_registration_invitation('new-coach@example.com'));

select is(
  (select char_length(payload ->> 'code') from trainer_registration_payloads where label = 'invite'),
  48,
  'operator invitation contains a 256-bit opaque code'
);

reset role;
set local role anon;

insert into trainer_registration_payloads (label, payload)
values (
  'attempt',
  public.start_trainer_registration(
    (select payload ->> 'code' from trainer_registration_payloads where label = 'invite'),
    '  Новый тренер  ',
    'NEW-COACH@EXAMPLE.COM'
  )
);

select is(
  (select char_length(payload ->> 'token') from trainer_registration_payloads where label = 'attempt'),
  48,
  'browser receives a distinct opaque Telegram verification token'
);

select is(
  (select payload ->> 'telegramVerified' from (
    select public.get_trainer_registration_status(payload ->> 'token') as payload
    from trainer_registration_payloads where label = 'attempt'
  ) status),
  'false',
  'registration is pending before Telegram verification'
);

reset role;
set local role service_role;

select is(
  public.verify_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'attempt'),
    991001,
    991001,
    'newcoach',
    'Новый'
  ),
  'verified',
  'the bot can verify the pending registration'
);

reset role;
set local role anon;

insert into trainer_registration_payloads (label, payload)
values (
  'replacement-attempt',
  public.restart_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'attempt')
  )
);

select is(
  (select char_length(payload ->> 'token') from trainer_registration_payloads where label = 'replacement-attempt'),
  48,
  'renewing the link preserves registration details without exposing them to the browser'
);

reset role;
set local role service_role;

select is(
  public.verify_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'replacement-attempt'),
    991001,
    991001,
    'newcoach',
    'Новый'
  ),
  'verified',
  'the same Telegram can confirm a replacement pending registration'
);

reset role;
set local role anon;

select is(
  (select payload ->> 'telegramVerified' from (
    select public.get_trainer_registration_status(payload ->> 'token') as payload
    from trainer_registration_payloads where label = 'replacement-attempt'
  ) status),
  'true',
  'registration status reveals only that Telegram verification succeeded'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values ('14000000-0000-4000-8000-000000000001', 'new-coach@example.com', now());

reset role;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$select public.activate_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'replacement-attempt')
  )$$,
  'verified Auth account can activate its trainer profile'
);

reset role;

select is(
  (select role::text from public.profiles where id = '14000000-0000-4000-8000-000000000001'),
  'trainer',
  'activation grants the fixed trainer role'
);

select is(
  (select display_name from public.profiles where id = '14000000-0000-4000-8000-000000000001'),
  'Новый тренер',
  'activation uses the normalized registration name'
);

select is(
  (select telegram_user_id::text from public.telegram_accounts where profile_id = '14000000-0000-4000-8000-000000000001'),
  '991001',
  'activation links the verified Telegram account to the new profile'
);

select is(
  (select count(*)::integer from private.trainer_registration_invites where consumed_at is not null),
  1,
  'activation consumes the operator invitation once'
);

set local role authenticated;

select lives_ok(
  $$select public.activate_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'replacement-attempt')
  )$$,
  'activation is idempotent for the same Auth account'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.start_trainer_registration(
    (select payload ->> 'code' from trainer_registration_payloads where label = 'invite'),
    'Another Coach',
    'new-coach@example.com'
  )$$,
  'P0002',
  'Trainer registration is not available',
  'consumed operator invitation cannot start another registration'
);

reset role;
set local role service_role;

insert into trainer_registration_payloads (label, payload)
values ('second-invite', public.issue_trainer_registration_invitation('other-coach@example.com'));

reset role;
set local role anon;

insert into trainer_registration_payloads (label, payload)
values (
  'second-attempt',
  public.start_trainer_registration(
    (select payload ->> 'code' from trainer_registration_payloads where label = 'second-invite'),
    'Other Coach',
    'other-coach@example.com'
  )
);

reset role;
set local role service_role;

select is(
  public.verify_trainer_registration(
    (select payload ->> 'token' from trainer_registration_payloads where label = 'second-attempt'),
    991001,
    991001,
    'newcoach',
    'Новый'
  ),
  'telegram-already-linked',
  'the same Telegram account cannot be attached to a second profile'
);

select * from finish();
rollback;
