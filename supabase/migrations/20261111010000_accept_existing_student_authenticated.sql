-- Keep the legacy path for a newly authenticated account without a profile.
alter function public.accept_student_invitation(text) set schema private;
revoke all on function private.accept_student_invitation(text) from public, anon, authenticated;

create or replace function public.accept_student_invitation(p_token text)
returns public.trainer_student_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_telegram_id bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_user_id;
  if not found then
    return private.accept_student_invitation(p_token);
  end if;
  if v_role <> 'student' then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;
  select telegram_user_id into v_telegram_id from public.telegram_accounts where profile_id = v_user_id;
  if not found then
    -- Legacy accounts can retry their own accepted invitation; the original
    -- function still refuses attaching another student record to that account.
    return private.accept_student_invitation(p_token);
  end if;
  return public.accept_existing_student_invitation_from_telegram(p_token, v_telegram_id);
end;
$$;
revoke all on function public.accept_student_invitation(text) from public, anon;
grant execute on function public.accept_student_invitation(text) to authenticated;
