create function public.accept_student_invitation_from_telegram(
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
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  select invitation.* into v_invitation
  from public.student_invitations invitation
  where invitation.token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  select relationship.* into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.id = v_invitation.relationship_id
  for update;

  select student.* into v_student
  from public.students student
  where student.id = v_relationship.student_id
  for update;

  if v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= v_now
    or v_relationship.status <> 'invited'
    or v_student.account_id is not null
    or exists (select 1 from public.profiles profile where profile.id = p_user_id)
    or exists (
      select 1 from public.telegram_accounts account
      where account.telegram_user_id = p_telegram_user_id
    )
  then
    raise exception 'Invitation is not available' using errcode = 'P0002';
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
