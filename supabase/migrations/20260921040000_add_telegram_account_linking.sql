create table public.telegram_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null unique,
  username text,
  first_name text not null check (length(btrim(first_name)) between 1 and 128),
  linked_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  constraint telegram_accounts_private_chat check (telegram_user_id = chat_id)
);

create table private.telegram_link_codes (
  code_hash bytea primary key check (octet_length(code_hash) = 32),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index telegram_link_codes_one_open_per_profile_idx
  on private.telegram_link_codes (profile_id)
  where consumed_at is null;

alter table public.telegram_accounts enable row level security;

create function public.create_telegram_link_code()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := (select auth.uid());
  v_code text := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
begin
  if v_profile_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (select 1 from public.profiles profile where profile.id = v_profile_id) then
    raise exception 'profile not found';
  end if;

  delete from private.telegram_link_codes
  where profile_id = v_profile_id
    and consumed_at is null;

  insert into private.telegram_link_codes (code_hash, profile_id, expires_at)
  values (extensions.digest(v_code, 'sha256'), v_profile_id, v_expires_at);

  return query select v_code, v_expires_at;
end;
$$;

create function public.consume_telegram_link_code(
  p_code text,
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_username text,
  p_first_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code private.telegram_link_codes%rowtype;
begin
  if p_code !~ '^[a-f0-9]{48}$'
    or p_telegram_user_id <= 0
    or p_chat_id <> p_telegram_user_id
    or length(btrim(coalesce(p_first_name, ''))) not between 1 and 128 then
    return false;
  end if;

  select * into v_code
  from private.telegram_link_codes link_code
  where link_code.code_hash = extensions.digest(p_code, 'sha256')
    and link_code.consumed_at is null
    and link_code.expires_at > clock_timestamp()
  for update;

  if not found then
    return false;
  end if;

  update private.telegram_link_codes
  set consumed_at = clock_timestamp()
  where code_hash = v_code.code_hash;

  insert into public.telegram_accounts (
    profile_id, telegram_user_id, chat_id, username, first_name, linked_at, last_interaction_at
  ) values (
    v_code.profile_id,
    p_telegram_user_id,
    p_chat_id,
    nullif(btrim(p_username), ''),
    btrim(p_first_name),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (profile_id) do update
  set telegram_user_id = excluded.telegram_user_id,
      chat_id = excluded.chat_id,
      username = excluded.username,
      first_name = excluded.first_name,
      linked_at = excluded.linked_at,
      last_interaction_at = excluded.last_interaction_at;

  return true;
end;
$$;

revoke all on table public.telegram_accounts from public, anon, authenticated;
revoke all on table private.telegram_link_codes from public, anon, authenticated;
revoke all on function public.consume_telegram_link_code(text, bigint, bigint, text, text) from public, anon, authenticated;

grant execute on function public.create_telegram_link_code() to authenticated;
grant execute on function public.consume_telegram_link_code(text, bigint, bigint, text, text) to service_role;
