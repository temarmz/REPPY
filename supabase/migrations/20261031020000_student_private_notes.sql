-- Each account can access only its own diary, regardless of role.
alter policy trainer_notes_owner_read on public.trainer_notes using (trainer_id = (select auth.uid()));
create or replace function public.save_trainer_note(p_note_date date, p_content text, p_expected_revision integer, p_mutation_id uuid)
returns setof public.trainer_notes
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.trainer_notes%rowtype;
begin
  if owner_id is null or not exists (select 1 from public.profiles p where p.id = owner_id and p.role in ('trainer', 'student')) then
    raise exception 'An account is required to write private notes' using errcode = '42501';
  end if;
  if p_note_date is null or p_mutation_id is null or p_content is null or char_length(p_content) > 50000
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.trainer_notes (trainer_id, note_date, content, mutation_id)
    values (owner_id, p_note_date, p_content, p_mutation_id)
    on conflict on constraint trainer_notes_pkey do nothing
    returning * into saved;
    if found then return next saved; return; end if;
  end if;
  select * into saved from public.trainer_notes n
    where n.trainer_id = owner_id and n.note_date = p_note_date for update;
  if not found then raise exception 'Note revision conflict' using errcode = '40001'; end if;
  -- A lost response can be retried without overwriting a later revision.
  if saved.mutation_id = p_mutation_id and saved.content = p_content then return next saved; return; end if;
  if saved.revision <> p_expected_revision then raise exception 'Note revision conflict' using errcode = '40001'; end if;
  update public.trainer_notes n set content = p_content, revision = n.revision + 1,
    mutation_id = p_mutation_id, updated_at = now()
    where n.trainer_id = owner_id and n.note_date = p_note_date returning * into saved;
  return next saved;
end;
$$;
