create function public.create_student_with_invitation(
  p_name text,
  p_target_email text,
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
    trainer_id,
    student_id,
    status,
    color,
    timezone
  )
  values (
    v_user_id,
    v_student.id,
    'invited',
    coalesce(p_color, 'orange'),
    v_timezone
  )
  returning * into v_relationship;

  v_invitation := public.create_student_invitation(v_relationship.id, p_target_email);

  return v_invitation || jsonb_build_object(
    'studentId', v_student.id,
    'studentName', v_student.name
  );
end;
$$;

revoke all on function public.create_student_with_invitation(text, text, public.student_color, text) from public, anon;
grant execute on function public.create_student_with_invitation(text, text, public.student_color, text) to authenticated;
