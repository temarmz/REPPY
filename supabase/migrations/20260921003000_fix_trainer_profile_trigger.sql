create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if new.raw_app_meta_data ->> 'reppy_role' is distinct from 'trainer' then
    return new;
  end if;

  v_display_name := btrim(new.raw_user_meta_data ->> 'display_name');

  if v_display_name is null or char_length(v_display_name) not between 2 and 120 then
    raise exception 'Trainer display name must contain between 2 and 120 characters'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, 'trainer', v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of raw_app_meta_data, raw_user_meta_data on auth.users
for each row execute function private.handle_new_auth_user();
