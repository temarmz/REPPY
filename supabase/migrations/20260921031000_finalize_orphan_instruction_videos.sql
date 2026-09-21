create function public.delete_claimed_instruction_videos(p_video_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_user_id is null or not private.current_user_is_trainer() then
    raise exception 'Only a trainer can finalize instruction video cleanup' using errcode = '42501';
  end if;

  if p_video_ids is null or cardinality(p_video_ids) = 0 or cardinality(p_video_ids) > 100 then
    raise exception 'Between 1 and 100 video ids are required' using errcode = '22023';
  end if;

  delete from public.instruction_videos video
  using public.trainer_student_relationships relationship
  where video.id = any(p_video_ids)
    and video.relationship_id = relationship.id
    and relationship.trainer_id = v_user_id
    and relationship.status <> 'archived'
    and video.deleted_at is not null;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_claimed_instruction_videos(uuid[]) from public, anon, authenticated;
grant execute on function public.delete_claimed_instruction_videos(uuid[]) to authenticated;
