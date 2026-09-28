drop function if exists public.restart_trainer_registration(text);
drop function if exists public.activate_trainer_registration(text);
drop function if exists public.verify_trainer_registration(text, bigint, bigint, text, text);
drop function if exists public.get_trainer_registration_status(text);
drop function if exists public.start_trainer_registration(text, text, text);
drop function if exists public.issue_trainer_registration_invitation(text);

drop table if exists private.trainer_registration_attempts;
drop table if exists private.trainer_registration_invites;

drop function public.create_student_with_invitation(text, text, public.student_color, text);
drop function public.create_student_invitation(uuid, text);

alter table public.student_invitations drop column target_email;

create function public.create_student_invitation(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.trainer_student_relationships%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_token text;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_student_relationships relationship
  join public.students student on student.id = relationship.student_id
  where relationship.id = p_relationship_id
    and relationship.trainer_id = (select auth.uid())
    and relationship.status = 'invited'
    and student.account_id is null
  for update of relationship, student;

  if not found then
    raise exception 'Invitation can only be created for an unregistered student'
      using errcode = '42501';
  end if;

  update public.student_invitations invitation
  set revoked_at = v_now
  where invitation.relationship_id = v_relationship.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  v_token := replace(
    replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'),
    '/',
    '_'
  );

  insert into public.student_invitations (relationship_id, token_hash, expires_at)
  values (
    v_relationship.id,
    extensions.digest(v_token, 'sha256'),
    v_now + interval '48 hours'
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'invitationId', v_invitation.id,
    'relationshipId', v_invitation.relationship_id,
    'token', v_token,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

revoke all on function public.create_student_invitation(uuid) from public, anon;
grant execute on function public.create_student_invitation(uuid) to authenticated;

create function public.create_student_with_invitation(
  p_name text,
  p_color public.student_color default 'orange',
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_student public.students%rowtype;
  v_relationship public.trainer_student_relationships%rowtype;
  v_invitation jsonb;
  v_name text := btrim(p_name);
  v_timezone text := btrim(p_timezone);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.current_user_is_trainer() then
    raise exception 'Only a trainer can invite students' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Student name must contain between 2 and 120 characters' using errcode = '22023';
  end if;
  if v_timezone is null or char_length(v_timezone) not between 1 and 100 then
    raise exception 'A valid timezone is required' using errcode = '22023';
  end if;

  insert into public.students (created_by, name)
  values (v_user_id, v_name)
  returning * into v_student;

  insert into public.trainer_student_relationships (
    trainer_id, student_id, status, color, timezone
  ) values (
    v_user_id, v_student.id, 'invited', coalesce(p_color, 'orange'), v_timezone
  )
  returning * into v_relationship;

  v_invitation := public.create_student_invitation(v_relationship.id);
  return v_invitation || jsonb_build_object(
    'studentId', v_student.id,
    'studentName', v_student.name
  );
end;
$$;

revoke all on function public.create_student_with_invitation(text, public.student_color, text) from public, anon;
grant execute on function public.create_student_with_invitation(text, public.student_color, text) to authenticated;

create or replace function public.accept_student_invitation(p_token text)
returns public.trainer_student_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_relationship public.trainer_student_relationships%rowtype;
  v_student public.students%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 40 and 128 then
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

  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_user_id and v_student.account_id = v_user_id then
      return v_relationship;
    end if;
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  if v_invitation.revoked_at is not null
    or v_invitation.expires_at <= v_now
    or v_relationship.status <> 'invited'
    or v_student.account_id is not null
    or exists (select 1 from public.profiles profile where profile.id = v_user_id)
  then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, role, display_name)
  values (v_user_id, 'student', v_student.name);

  update public.students set account_id = v_user_id where id = v_student.id;
  update public.trainer_student_relationships
  set status = 'active'
  where id = v_relationship.id
  returning * into v_relationship;

  update public.student_invitations
  set accepted_at = v_now, accepted_by = v_user_id
  where id = v_invitation.id;

  update public.student_invitations
  set revoked_at = v_now
  where relationship_id = v_relationship.id
    and id <> v_invitation.id
    and accepted_at is null
    and revoked_at is null;

  return v_relationship;
end;
$$;

revoke all on function public.accept_student_invitation(text) from public, anon;
grant execute on function public.accept_student_invitation(text) to authenticated;
