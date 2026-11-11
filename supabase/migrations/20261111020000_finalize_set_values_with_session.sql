-- The legacy flag remains a storage compatibility detail, never a manual action.
-- Derive it in the same transaction as completion (including safe RPC retries).
create function private.finalize_session_set_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.set_results
  set completed = actual_reps > 0
  where session_id = new.id;
  return new;
end;
$$;
revoke all on function private.finalize_session_set_values() from public, anon, authenticated;
create trigger finalize_session_set_values
after update of completed_at on public.workout_sessions
for each row when (old.completed_at is null and new.completed_at is not null)
execute function private.finalize_session_set_values();
