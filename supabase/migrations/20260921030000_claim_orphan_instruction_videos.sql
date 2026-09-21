create function private.assert_workout_instruction_videos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship_id uuid;
  v_video_id uuid;
begin
  if jsonb_typeof(new.workout_snapshot -> 'exercises') is distinct from 'array' then
    return new;
  end if;

  if tg_table_name = 'assignments' then
    v_relationship_id := new.relationship_id;
  else
    select assignment.relationship_id
    into v_relationship_id
    from public.assignments assignment
    where assignment.id = new.assignment_id;
  end if;

  for v_video_id in
    select private.try_uuid(exercise #>> '{instructionVideo,id}')
    from jsonb_array_elements(new.workout_snapshot -> 'exercises') exercise
    where exercise ? 'instructionVideo'
  loop
    if v_video_id is null then
      raise exception 'Instruction video id is invalid' using errcode = '22023';
    end if;

    perform 1
    from public.instruction_videos video
    where video.id = v_video_id
      and video.relationship_id = v_relationship_id
      and video.deleted_at is null
    for share;

    if not found then
      raise exception 'Instruction video is unavailable for this relationship'
        using errcode = '23503';
    end if;
  end loop;

  return new;
end;
$$;

create trigger assignments_validate_instruction_videos
before insert or update of relationship_id, workout_snapshot on public.assignments
for each row execute function private.assert_workout_instruction_videos();

create trigger workout_sessions_validate_instruction_videos
before insert or update of assignment_id, workout_snapshot on public.workout_sessions
for each row execute function private.assert_workout_instruction_videos();

create function public.claim_orphan_instruction_videos()
returns table(video_id uuid, object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_video record;
begin
  if v_user_id is null or not private.current_user_is_trainer() then
    raise exception 'Only a trainer can clean up instruction videos' using errcode = '42501';
  end if;

  return query
  select video.id, video.object_path
  from public.instruction_videos video
  join public.trainer_student_relationships relationship on relationship.id = video.relationship_id
  where relationship.trainer_id = v_user_id
    and relationship.status <> 'archived'
    and video.deleted_at is not null;

  for v_video in
    select video.id, video.object_path
    from public.instruction_videos video
    join public.trainer_student_relationships relationship on relationship.id = video.relationship_id
    where relationship.trainer_id = v_user_id
      and relationship.status <> 'archived'
      and video.deleted_at is null
      and video.created_at < clock_timestamp() - interval '24 hours'
    order by video.created_at
    for update of video
  loop
    if not exists (
      select 1
      from public.assignments assignment
      cross join lateral jsonb_array_elements(assignment.workout_snapshot -> 'exercises') exercise
      where private.try_uuid(exercise #>> '{instructionVideo,id}') = v_video.id
    ) and not exists (
      select 1
      from public.workout_sessions session
      cross join lateral jsonb_array_elements(session.workout_snapshot -> 'exercises') exercise
      where private.try_uuid(exercise #>> '{instructionVideo,id}') = v_video.id
    ) then
      update public.instruction_videos video
      set deleted_at = clock_timestamp()
      where video.id = v_video.id;

      video_id := v_video.id;
      object_path := v_video.object_path;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_workout_instruction_videos() from public, anon, authenticated;
revoke all on function public.claim_orphan_instruction_videos() from public, anon, authenticated;
grant execute on function public.claim_orphan_instruction_videos() to authenticated;
