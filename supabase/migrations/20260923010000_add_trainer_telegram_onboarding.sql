create table private.trainer_registration_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  target_email text not null check (
    target_email = lower(btrim(target_email))
    and char_length(target_email) between 3 and 320
    and target_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create table private.trainer_registration_attempts (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references private.trainer_registration_invites (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  target_email text not null check (
    target_email = lower(btrim(target_email))
    and char_length(target_email) between 3 and 320
  ),
  telegram_user_id bigint unique,
  telegram_chat_id bigint,
  telegram_username text,
  telegram_first_name text,
  verified_at timestamptz,
  activated_by uuid references auth.users (id) on delete set null,
  activated_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint trainer_registration_attempts_telegram_complete check (
    (verified_at is null and telegram_user_id is null and telegram_chat_id is null)
    or (verified_at is not null and telegram_user_id is not null and telegram_chat_id = telegram_user_id)
  ),
  constraint trainer_registration_attempts_activated_complete check (
    (activated_at is null and activated_by is null)
    or (activated_at is not null and activated_by is not null)
  )
);

create index trainer_registration_attempts_active_idx
  on private.trainer_registration_attempts (invite_id, expires_at)
  where activated_at is null;

create function public.issue_trainer_registration_invitation(p_target_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_target_email));
  v_code text := encode(extensions.gen_random_bytes(24), 'hex');
  v_invite private.trainer_registration_invites%rowtype;
begin
  if v_email is null
    or char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'A valid trainer email is required' using errcode = '22023';
  end if;

  insert into private.trainer_registration_invites (code_hash, target_email, expires_at)
  values (extensions.digest(v_code, 'sha256'), v_email, clock_timestamp() + interval '7 days')
  returning * into v_invite;

  return jsonb_build_object(
    'code', v_code,
    'targetEmail', v_invite.target_email,
    'expiresAt', v_invite.expires_at
  );
end;
$$;

create function public.start_trainer_registration(
  p_invite_code text,
  p_display_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_hash bytea;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_display_name);
  v_invite private.trainer_registration_invites%rowtype;
  v_attempt private.trainer_registration_attempts%rowtype;
begin
  if p_invite_code !~ '^[a-f0-9]{48}$'
    or v_name is null
    or char_length(v_name) not between 2 and 120
    or v_email is null
    or char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  v_code_hash := extensions.digest(lower(p_invite_code), 'sha256');
  select * into v_invite
  from private.trainer_registration_invites invite
  where invite.code_hash = v_code_hash
  for update;

  if not found
    or v_invite.consumed_at is not null
    or v_invite.expires_at <= clock_timestamp()
    or v_invite.target_email <> v_email
  then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  insert into private.trainer_registration_attempts (
    invite_id,
    token_hash,
    display_name,
    target_email,
    expires_at
  ) values (
    v_invite.id,
    extensions.digest(v_token, 'sha256'),
    v_name,
    v_email,
    least(v_invite.expires_at, clock_timestamp() + interval '30 minutes')
  ) returning * into v_attempt;

  return jsonb_build_object('token', v_token, 'expiresAt', v_attempt.expires_at);
end;
$$;

create function public.get_trainer_registration_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt private.trainer_registration_attempts%rowtype;
begin
  if p_token !~ '^[a-f0-9]{48}$' then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  select attempt.* into v_attempt
  from private.trainer_registration_attempts attempt
  where attempt.token_hash = extensions.digest(lower(p_token), 'sha256')
    and attempt.expires_at > clock_timestamp();

  if not found then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'telegramVerified', v_attempt.verified_at is not null,
    'activated', v_attempt.activated_at is not null,
    'expiresAt', v_attempt.expires_at
  );
end;
$$;

create function public.verify_trainer_registration(
  p_token text,
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_username text,
  p_first_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt private.trainer_registration_attempts%rowtype;
begin
  if p_token !~ '^[a-f0-9]{48}$'
    or p_telegram_user_id <= 0
    or p_chat_id <> p_telegram_user_id
    or char_length(btrim(coalesce(p_first_name, ''))) not between 1 and 128
  then
    return 'unavailable';
  end if;

  select attempt.* into v_attempt
  from private.trainer_registration_attempts attempt
  join private.trainer_registration_invites invite on invite.id = attempt.invite_id
  where attempt.token_hash = extensions.digest(lower(p_token), 'sha256')
    and attempt.expires_at > clock_timestamp()
    and attempt.activated_at is null
    and invite.consumed_at is null
  for update of attempt;

  if not found then return 'unavailable'; end if;

  if exists (
    select 1 from public.telegram_accounts account
    where account.telegram_user_id = p_telegram_user_id
  ) then
    return 'telegram-already-linked';
  end if;

  update private.trainer_registration_attempts
  set telegram_user_id = p_telegram_user_id,
      telegram_chat_id = p_chat_id,
      telegram_username = nullif(btrim(p_username), ''),
      telegram_first_name = btrim(p_first_name),
      verified_at = clock_timestamp()
  where id = v_attempt.id;

  return 'verified';
end;
$$;

create function public.activate_trainer_registration(p_token text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_attempt private.trainer_registration_attempts%rowtype;
  v_invite private.trainer_registration_invites%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null or p_token !~ '^[a-f0-9]{48}$' then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  select lower(btrim(user_record.email)), user_record.email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users user_record
  where user_record.id = v_user_id;

  select attempt.* into v_attempt
  from private.trainer_registration_attempts attempt
  where attempt.token_hash = extensions.digest(lower(p_token), 'sha256')
  for update;

  if not found then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  select * into v_invite
  from private.trainer_registration_invites invite
  where invite.id = v_attempt.invite_id
  for update;

  if v_attempt.activated_at is not null then
    if v_attempt.activated_by = v_user_id then
      select * into v_profile from public.profiles where id = v_user_id;
      return v_profile;
    end if;
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  if v_invite.consumed_at is not null
    or v_invite.expires_at <= clock_timestamp()
    or v_attempt.expires_at <= clock_timestamp()
    or v_attempt.verified_at is null
    or v_attempt.telegram_user_id is null
    or v_email_confirmed_at is null
    or v_user_email is distinct from v_attempt.target_email
    or exists (select 1 from public.profiles profile where profile.id = v_user_id)
    or exists (
      select 1 from public.telegram_accounts account
      where account.telegram_user_id = v_attempt.telegram_user_id
    )
  then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, role, display_name)
  values (v_user_id, 'trainer', v_attempt.display_name)
  returning * into v_profile;

  insert into public.telegram_accounts (
    profile_id, telegram_user_id, chat_id, username, first_name, linked_at, last_interaction_at
  ) values (
    v_user_id,
    v_attempt.telegram_user_id,
    v_attempt.telegram_chat_id,
    v_attempt.telegram_username,
    v_attempt.telegram_first_name,
    clock_timestamp(),
    clock_timestamp()
  );

  update private.trainer_registration_attempts
  set activated_by = v_user_id, activated_at = clock_timestamp()
  where id = v_attempt.id;

  update private.trainer_registration_invites
  set consumed_at = clock_timestamp()
  where id = v_invite.id;

  return v_profile;
end;
$$;

revoke all on table private.trainer_registration_invites, private.trainer_registration_attempts from public, anon, authenticated;
revoke all on function public.issue_trainer_registration_invitation(text) from public, anon, authenticated;
revoke all on function public.start_trainer_registration(text, text, text) from public;
revoke all on function public.get_trainer_registration_status(text) from public;
revoke all on function public.verify_trainer_registration(text, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.activate_trainer_registration(text) from public, anon;

grant execute on function public.issue_trainer_registration_invitation(text) to service_role;
grant execute on function public.start_trainer_registration(text, text, text) to anon, authenticated;
grant execute on function public.get_trainer_registration_status(text) to anon, authenticated;
grant execute on function public.verify_trainer_registration(text, bigint, bigint, text, text) to service_role;
grant execute on function public.activate_trainer_registration(text) to authenticated;
