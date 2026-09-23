-- A Telegram account may confirm several short-lived registration attempts before
-- one of them is activated.  The permanent uniqueness guarantee lives in
-- public.telegram_accounts, not in this temporary onboarding table.
alter table private.trainer_registration_attempts
  drop constraint if exists trainer_registration_attempts_telegram_user_id_key;

create function public.restart_trainer_registration(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_attempt private.trainer_registration_attempts%rowtype;
  v_invite private.trainer_registration_invites%rowtype;
  v_new_attempt private.trainer_registration_attempts%rowtype;
begin
  if p_token !~ '^[a-f0-9]{48}$' then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  select * into v_attempt
  from private.trainer_registration_attempts attempt
  where attempt.token_hash = extensions.digest(lower(p_token), 'sha256')
    and attempt.activated_at is null
  for update;

  if not found then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  select * into v_invite
  from private.trainer_registration_invites invite
  where invite.id = v_attempt.invite_id
  for update;

  if v_invite.consumed_at is not null or v_invite.expires_at <= clock_timestamp() then
    raise exception 'Trainer registration is not available' using errcode = 'P0002';
  end if;

  insert into private.trainer_registration_attempts (
    invite_id, token_hash, display_name, target_email, expires_at
  ) values (
    v_invite.id,
    extensions.digest(v_token, 'sha256'),
    v_attempt.display_name,
    v_attempt.target_email,
    least(v_invite.expires_at, clock_timestamp() + interval '30 minutes')
  ) returning * into v_new_attempt;

  return jsonb_build_object('token', v_token, 'expiresAt', v_new_attempt.expires_at);
end;
$$;

revoke all on function public.restart_trainer_registration(text) from public;
grant execute on function public.restart_trainer_registration(text) to anon, authenticated;
