create table private.telegram_auth_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 0),
  blocked_until timestamptz
);

create function public.consume_telegram_auth_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row private.telegram_auth_rate_limits%rowtype;
  v_retry_after integer := 0;
begin
  if char_length(coalesce(p_key, '')) <> 64
    or p_limit not between 1 and 1000
    or p_window_seconds not between 1 and 86400
    or p_block_seconds not between 1 and 86400
  then
    raise exception 'Invalid rate limit configuration' using errcode = '22023';
  end if;

  insert into private.telegram_auth_rate_limits (rate_key, window_started_at, attempts)
  values (p_key, v_now, 0)
  on conflict (rate_key) do nothing;

  select * into v_row
  from private.telegram_auth_rate_limits
  where rate_key = p_key
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry_after);
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update private.telegram_auth_rate_limits
    set window_started_at = v_now,
        attempts = 1,
        blocked_until = null
    where rate_key = p_key;
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  if v_row.attempts >= p_limit then
    update private.telegram_auth_rate_limits
    set attempts = attempts + 1,
        blocked_until = v_now + make_interval(secs => p_block_seconds)
    where rate_key = p_key;
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', p_block_seconds);
  end if;

  update private.telegram_auth_rate_limits
  set attempts = attempts + 1,
      blocked_until = null
  where rate_key = p_key;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

revoke all on function public.consume_telegram_auth_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_telegram_auth_rate_limit(text, integer, integer, integer)
  to service_role;

create function public.get_trainer_subscription_entries()
returns setof public.subscription_entries
language sql
stable
security definer
set search_path = ''
as $$
  select entry.*
  from public.subscription_entries entry
  join public.trainer_student_relationships relationship
    on relationship.id = entry.relationship_id
  where relationship.trainer_id = (select auth.uid())
    and relationship.status <> 'archived'
  order by entry.occurred_at desc, entry.created_at desc;
$$;

revoke all on function public.get_trainer_subscription_entries()
  from public, anon;
grant execute on function public.get_trainer_subscription_entries()
  to authenticated;

create or replace function public.get_student_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invitation public.student_invitations%rowtype;
  v_relationship public.trainer_student_relationships%rowtype;
  v_student public.students%rowtype;
  v_trainer_name text;
begin
  if p_token is null or char_length(p_token) not between 40 and 128 then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select invitation.* into v_invitation
  from public.student_invitations invitation
  where invitation.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select relationship.* into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.id = v_invitation.relationship_id;

  select student.* into v_student
  from public.students student
  where student.id = v_relationship.student_id;

  if v_invitation.expires_at <= now() then
    raise exception 'Invitation is not available: expired' using errcode = 'P0002';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception 'Invitation is not available: revoked' using errcode = 'P0002';
  end if;
  if v_invitation.accepted_at is not null
    or v_relationship.status <> 'invited'
    or v_student.account_id is not null
  then
    raise exception 'Invitation is not available: used' using errcode = 'P0002';
  end if;

  select trainer.display_name into v_trainer_name
  from public.profiles trainer
  where trainer.id = v_relationship.trainer_id;

  return jsonb_build_object(
    'studentName', v_student.name,
    'trainerName', v_trainer_name,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

create or replace function public.accept_student_invitation_from_telegram(
  p_token text,
  p_user_id uuid,
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_username text,
  p_first_name text
)
returns public.trainer_student_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.trainer_student_relationships%rowtype;
  v_student public.students%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null
    or char_length(p_token) not between 40 and 128
    or p_user_id is null
    or p_telegram_user_id <= 0
    or p_chat_id <> p_telegram_user_id
    or char_length(btrim(coalesce(p_first_name, ''))) not between 1 and 128
    or not exists (select 1 from auth.users auth_user where auth_user.id = p_user_id)
  then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select invitation.* into v_invitation
  from public.student_invitations invitation
  where invitation.token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select relationship.* into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.id = v_invitation.relationship_id
  for update;

  select student.* into v_student
  from public.students student
  where student.id = v_relationship.student_id
  for update;

  if v_invitation.expires_at <= v_now then
    raise exception 'Invitation is not available: expired' using errcode = 'P0002';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception 'Invitation is not available: revoked' using errcode = 'P0002';
  end if;
  if v_invitation.accepted_at is not null
    or v_relationship.status <> 'invited'
    or v_student.account_id is not null
  then
    raise exception 'Invitation is not available: used' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles profile where profile.id = p_user_id) then
    raise exception 'Account already exists' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.telegram_accounts account
    where account.telegram_user_id = p_telegram_user_id
  ) then
    raise exception 'Telegram account already linked' using errcode = '23505';
  end if;

  insert into public.profiles (id, role, display_name)
  values (p_user_id, 'student', v_student.name);

  insert into public.telegram_accounts (
    profile_id, telegram_user_id, chat_id, username, first_name, linked_at, last_interaction_at
  ) values (
    p_user_id,
    p_telegram_user_id,
    p_chat_id,
    nullif(btrim(p_username), ''),
    btrim(p_first_name),
    v_now,
    v_now
  );

  update public.students student
  set account_id = p_user_id
  where student.id = v_student.id;

  update public.trainer_student_relationships relationship
  set status = 'active'
  where relationship.id = v_relationship.id
  returning relationship.* into v_relationship;

  update public.student_invitations invitation
  set accepted_at = v_now,
      accepted_by = p_user_id
  where invitation.id = v_invitation.id;

  update public.student_invitations invitation
  set revoked_at = v_now
  where invitation.relationship_id = v_relationship.id
    and invitation.id <> v_invitation.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  return v_relationship;
end;
$$;

revoke all on function public.accept_student_invitation_from_telegram(text, uuid, bigint, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_student_invitation_from_telegram(text, uuid, bigint, bigint, text, text)
  to service_role;
