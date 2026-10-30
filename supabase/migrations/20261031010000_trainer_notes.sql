-- A private diary, deliberately independent of relationships and workouts.
create table public.trainer_notes (
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  note_date date not null,
  content text not null default '' check (char_length(content) <= 50000),
  revision integer not null default 1 check (revision > 0),
  mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint trainer_notes_pkey primary key (trainer_id, note_date)
);
alter table public.trainer_notes enable row level security;
revoke all on public.trainer_notes from anon, authenticated;
grant select on public.trainer_notes to authenticated;
grant all on public.trainer_notes to service_role;
create policy trainer_notes_owner_read on public.trainer_notes for select to authenticated
  using (trainer_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'trainer'
  ));

create function public.save_trainer_note(p_note_date date, p_content text, p_expected_revision integer, p_mutation_id uuid)
returns setof public.trainer_notes
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.trainer_notes%rowtype;
begin
  if owner_id is null or not exists (select 1 from public.profiles p where p.id = owner_id and p.role = 'trainer') then
    raise exception 'Only a trainer can write private notes' using errcode = '42501';
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
revoke all on function public.save_trainer_note(date, text, integer, uuid) from public, anon;
grant execute on function public.save_trainer_note(date, text, integer, uuid) to authenticated;
alter publication supabase_realtime add table public.trainer_notes;
