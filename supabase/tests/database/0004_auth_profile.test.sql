begin;

select plan(11);

select has_trigger(
  'auth',
  'users',
  'on_auth_user_created',
  'auth user creation invokes the profile trigger'
);

select ok(
  not has_function_privilege('authenticated', 'private.handle_new_auth_user()', 'execute'),
  'authenticated clients cannot invoke the auth trigger function directly'
);

insert into auth.users (id, raw_user_meta_data, raw_app_meta_data)
values (
  '12000000-0000-4000-8000-000000000001',
  '{"display_name":"  Marina Coach  "}',
  '{"reppy_role":"trainer"}'
);

select is(
  (select count(*)::integer from public.profiles where id = '12000000-0000-4000-8000-000000000001'),
  1,
  'trainer registration creates exactly one profile'
);

select is(
  (select role::text from public.profiles where id = '12000000-0000-4000-8000-000000000001'),
  'trainer',
  'trainer registration cannot choose another application role'
);

select is(
  (select display_name from public.profiles where id = '12000000-0000-4000-8000-000000000001'),
  'Marina Coach',
  'trainer display name is normalized before storage'
);

insert into auth.users (id, raw_user_meta_data)
values (
  '12000000-0000-4000-8000-000000000002',
  '{"registration_kind":"trainer","display_name":"Self-promoted trainer"}'
);

select is(
  (select count(*)::integer from public.profiles where id = '12000000-0000-4000-8000-000000000002'),
  0,
  'editable user metadata cannot create a trainer profile'
);

insert into auth.users (id)
values ('12000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::integer from public.profiles where id = '12000000-0000-4000-8000-000000000003'),
  0,
  'auth users without trusted app metadata receive no application profile'
);

update auth.users
set
  raw_user_meta_data = '{"display_name":"Delayed Metadata Coach"}',
  raw_app_meta_data = '{"reppy_role":"trainer"}'
where id = '12000000-0000-4000-8000-000000000003';

select is(
  (select role::text from public.profiles where id = '12000000-0000-4000-8000-000000000003'),
  'trainer',
  'trusted trainer metadata added after account creation creates the profile'
);

select throws_ok(
  $$insert into auth.users (id, raw_user_meta_data, raw_app_meta_data)
    values (
      '12000000-0000-4000-8000-000000000004',
      '{"display_name":" "}',
      '{"reppy_role":"trainer"}'
    )$$,
  '22023',
  'Trainer display name must contain between 2 and 120 characters',
  'invalid trainer metadata rejects the auth user transaction'
);

select is(
  (select count(*)::integer from auth.users where id = '12000000-0000-4000-8000-000000000004'),
  0,
  'a rejected profile trigger leaves no orphaned auth user'
);

delete from auth.users
where id = '12000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.profiles where id = '12000000-0000-4000-8000-000000000001'),
  0,
  'deleting an auth user cascades to their application profile'
);

select * from finish();
rollback;
