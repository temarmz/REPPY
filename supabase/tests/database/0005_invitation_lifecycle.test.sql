begin;

select plan(32);

create temporary table invitation_payloads (
  label text primary key,
  payload jsonb not null
);

grant select, insert, update, delete on invitation_payloads to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at)
values
  ('13000000-0000-4000-8000-000000000001', 'invite-trainer@example.com', now()),
  ('13000000-0000-4000-8000-000000000002', 'student@example.com', now()),
  ('13000000-0000-4000-8000-000000000003', 'wrong@example.com', now()),
  ('13000000-0000-4000-8000-000000000004', 'foreign-trainer@example.com', now()),
  ('13000000-0000-4000-8000-000000000005', 'student@example.net', null),
  ('13000000-0000-4000-8000-000000000006', 'expired@example.com', now());

insert into public.profiles (id, role, display_name)
values
  ('13000000-0000-4000-8000-000000000001', 'trainer', 'Invite Trainer'),
  ('13000000-0000-4000-8000-000000000004', 'trainer', 'Foreign Trainer');

insert into public.students (id, created_by, name)
values
  (
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'Invite Student'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001',
    'Revoked Student'
  ),
  (
    '23000000-0000-4000-8000-000000000003',
    '13000000-0000-4000-8000-000000000001',
    'Expired Student'
  );

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values
  (
    '33000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'invited'
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    'invited'
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000003',
    'invited'
  );

insert into public.student_invitations (
  id,
  relationship_id,
  token_hash,
  target_email,
  expires_at
)
values (
  'b1000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000003',
  extensions.digest(repeat('e', 43), 'sha256'),
  'expired@example.com',
  now() - interval '1 minute'
);

select ok(
  not has_table_privilege('authenticated', 'public.student_invitations', 'insert, update, delete'),
  'invitation state cannot be mutated directly'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$insert into invitation_payloads (label, payload)
    values (
      'first',
      public.create_student_invitation(
        '33000000-0000-4000-8000-000000000001',
        ' Student@Example.COM '
      )
    )$$,
  'trainer can create an invitation'
);

select is(
  (select char_length(payload ->> 'token') from invitation_payloads where label = 'first'),
  43,
  'invitation token contains 256 bits encoded as base64url'
);

select is(
  (select payload ->> 'targetEmail' from invitation_payloads where label = 'first'),
  'student@example.com',
  'the invited email is normalized before storage'
);

select throws_like(
  $$select token_hash from public.student_invitations limit 1$$,
  '%permission denied%',
  'trainer cannot read stored invitation hashes through the Data API'
);

select lives_ok(
  $$insert into invitation_payloads (label, payload)
    values (
      'second',
      public.create_student_invitation(
        '33000000-0000-4000-8000-000000000001',
        'student@example.com'
      )
    )$$,
  'trainer can reissue an invitation'
);

select ok(
  (
    select invitation.revoked_at is not null
    from public.student_invitations invitation
    where invitation.id = (
      select (payload ->> 'invitationId')::uuid
      from invitation_payloads
      where label = 'first'
    )
  ),
  'reissuing revokes the previous token'
);

select is(
  (
    select count(invitation.id)::integer
    from public.student_invitations invitation
    where invitation.relationship_id = '33000000-0000-4000-8000-000000000001'
      and invitation.accepted_at is null
      and invitation.revoked_at is null
  ),
  1,
  'only one invitation remains active for a relationship'
);

select isnt(
  (select payload ->> 'token' from invitation_payloads where label = 'first'),
  (select payload ->> 'token' from invitation_payloads where label = 'second'),
  'reissuing generates a new token'
);

reset role;

select throws_like(
  $$insert into public.student_invitations (
      relationship_id,
      token_hash,
      target_email,
      expires_at
    ) values (
      '33000000-0000-4000-8000-000000000001',
      extensions.digest(repeat('u', 43), 'sha256'),
      'other@example.com',
      now() + interval '1 day'
    )$$,
  '%student_invitations_one_open_idx%',
  'the database enforces one open invitation per relationship'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
set local role authenticated;

select throws_ok(
  $$select public.create_student_invitation(
    '33000000-0000-4000-8000-000000000001',
    'student@example.com'
  )$$,
  '42501',
  'Invitation can only be created for an unregistered student',
  'an unrelated trainer cannot issue an invitation'
);

select throws_ok(
  $$select public.revoke_student_invitation(
    (select (payload ->> 'invitationId')::uuid from invitation_payloads where label = 'second')
  )$$,
  'P0002',
  'Invitation is not available',
  'an unrelated trainer cannot revoke an invitation'
);

reset role;
set local role anon;

select is(
  public.get_student_invitation_preview(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  ) ->> 'studentName',
  'Invite Student',
  'a bearer can preview the invited student name'
);

select is(
  public.get_student_invitation_preview(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  ) ->> 'trainerName',
  'Invite Trainer',
  'a bearer can preview the trainer name'
);

select throws_ok(
  $$select public.get_student_invitation_preview(
    (select payload ->> 'token' from invitation_payloads where label = 'first')
  )$$,
  'P0002',
  'Invitation is not available',
  'a reissued token is no longer usable'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  )$$,
  'P0002',
  'Invitation is not available',
  'an account with another confirmed email cannot accept the invitation'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  )$$,
  'authenticated student can accept the active invitation'
);

reset role;

select is(
  (select role::text from public.profiles where id = '13000000-0000-4000-8000-000000000002'),
  'student',
  'acceptance creates a fixed student profile'
);

select is(
  (select account_id from public.students where id = '23000000-0000-4000-8000-000000000001'),
  '13000000-0000-4000-8000-000000000002'::uuid,
  'acceptance links the Auth account to the existing student record'
);

select is(
  (select status::text from public.trainer_student_relationships where id = '33000000-0000-4000-8000-000000000001'),
  'active',
  'acceptance activates the trainer-student relationship'
);

select is(
  (
    select accepted_by
    from public.student_invitations
    where id = (
      select (payload ->> 'invitationId')::uuid
      from invitation_payloads
      where label = 'second'
    )
  ),
  '13000000-0000-4000-8000-000000000002'::uuid,
  'acceptance records which Auth user consumed the token'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  )$$,
  'retrying acceptance by the same student is idempotent'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'second')
  )$$,
  'P0002',
  'Invitation is not available',
  'an accepted token cannot be reused by another account'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$insert into invitation_payloads (label, payload)
    values (
      'profiled',
      public.create_student_invitation(
        '33000000-0000-4000-8000-000000000002',
        'invite-trainer@example.com'
      )
    )$$,
  'trainer can create an invitation for an existing profile'
);

select throws_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'profiled')
  )$$,
  'P0002',
  'Invitation is not available',
  'an account that already has a profile cannot consume an invitation'
);

select lives_ok(
  $$insert into invitation_payloads (label, payload)
    values (
      'revoked',
      public.create_student_invitation(
        '33000000-0000-4000-8000-000000000002',
        'student@example.net'
      )
    )$$,
  'trainer can reissue the invitation for an unconfirmed account'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000005', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'revoked')
  )$$,
  'P0002',
  'Invitation is not available',
  'an unconfirmed matching email cannot accept the invitation'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  public.revoke_student_invitation(
    (select (payload ->> 'invitationId')::uuid from invitation_payloads where label = 'revoked')
  ),
  true,
  'trainer can revoke an unaccepted invitation'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.get_student_invitation_preview(
    (select payload ->> 'token' from invitation_payloads where label = 'revoked')
  )$$,
  'P0002',
  'Invitation is not available',
  'a revoked invitation cannot be previewed'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_student_invitation(
    (select payload ->> 'token' from invitation_payloads where label = 'revoked')
  )$$,
  'P0002',
  'Invitation is not available',
  'a revoked invitation cannot be accepted'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.get_student_invitation_preview(repeat('e', 43))$$,
  'P0002',
  'Invitation is not available',
  'an expired invitation cannot be previewed'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000006', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_student_invitation(repeat('e', 43))$$,
  'P0002',
  'Invitation is not available',
  'an expired invitation cannot be accepted'
);

select * from finish();
rollback;
