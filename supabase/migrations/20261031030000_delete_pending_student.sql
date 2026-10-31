-- Remove only an unaccepted relationship. Locking the same row as invitation
-- acceptance makes deletion and acceptance mutually exclusive.
create function public.delete_pending_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.trainer_student_relationships%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select relationship.* into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.student_id = p_student_id
    and relationship.trainer_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Invitation is not available' using errcode = '42501';
  end if;
  if v_relationship.status = 'archived' then return; end if;
  if v_relationship.status <> 'invited' then
    raise exception 'Student already accepted invitation' using errcode = '40001';
  end if;

  update public.student_invitations
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where relationship_id = v_relationship.id and accepted_at is null;

  update public.trainer_student_relationships
  set status = 'archived'
  where id = v_relationship.id;
end;
$$;
revoke all on function public.delete_pending_student(uuid) from public, anon, authenticated;
grant execute on function public.delete_pending_student(uuid) to authenticated;
