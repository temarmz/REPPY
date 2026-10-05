create function public.accept_existing_student_invitation_from_telegram(
  p_token text,
  p_telegram_user_id bigint
)
returns public.trainer_student_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile_role public.app_role;
  v_existing_student public.students%rowtype;
  v_invited_student public.students%rowtype;
  v_relationship public.trainer_student_relationships%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null
    or char_length(p_token) not between 40 and 128
    or p_telegram_user_id is null
    or p_telegram_user_id <= 0
  then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select account.profile_id
  into v_profile_id
  from public.telegram_accounts account
  where account.telegram_user_id = p_telegram_user_id
  for update;

  if not found then
    raise exception 'Telegram account is not linked' using errcode = 'P0002';
  end if;

  select profile.role
  into v_profile_role
  from public.profiles profile
  where profile.id = v_profile_id;

  if v_profile_role is distinct from 'student' then
    raise exception 'Account is not a student' using errcode = '42501';
  end if;

  select student.*
  into v_existing_student
  from public.students student
  where student.account_id = v_profile_id
  for update;

  if not found then
    raise exception 'Student profile is incomplete' using errcode = 'P0002';
  end if;

  select invitation.*
  into v_invitation
  from public.student_invitations invitation
  where invitation.token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then
    raise exception 'Invitation is not available: invalid' using errcode = 'P0002';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.id = v_invitation.relationship_id
  for update;

  select student.*
  into v_invited_student
  from public.students student
  where student.id = v_relationship.student_id
  for update;

  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_profile_id
      and v_relationship.status = 'active'
      and v_relationship.student_id = v_existing_student.id
    then
      return v_relationship;
    end if;
    raise exception 'Invitation is not available: used' using errcode = 'P0002';
  end if;
  if v_invitation.expires_at <= v_now then
    raise exception 'Invitation is not available: expired' using errcode = 'P0002';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception 'Invitation is not available: revoked' using errcode = 'P0002';
  end if;
  if v_relationship.status <> 'invited'
    or v_invited_student.account_id is not null
  then
    raise exception 'Invitation is not available: used' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.trainer_student_relationships relationship
    where relationship.trainer_id = v_relationship.trainer_id
      and relationship.student_id = v_existing_student.id
  ) then
    raise exception 'Trainer relationship already exists' using errcode = '23505';
  end if;

  update public.trainer_student_relationships relationship
  set student_id = v_existing_student.id,
      status = 'active'
  where relationship.id = v_relationship.id
  returning relationship.* into v_relationship;

  update public.student_invitations invitation
  set accepted_at = v_now,
      accepted_by = v_profile_id
  where invitation.id = v_invitation.id;

  update public.student_invitations invitation
  set revoked_at = v_now
  where invitation.relationship_id = v_relationship.id
    and invitation.id <> v_invitation.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  delete from public.students student
  where student.id = v_invited_student.id
    and student.account_id is null
    and not exists (
      select 1
      from public.trainer_student_relationships relationship
      where relationship.student_id = student.id
    );

  return v_relationship;
end;
$$;

revoke all on function public.accept_existing_student_invitation_from_telegram(text, bigint)
  from public, anon, authenticated;
grant execute on function public.accept_existing_student_invitation_from_telegram(text, bigint)
  to service_role;
