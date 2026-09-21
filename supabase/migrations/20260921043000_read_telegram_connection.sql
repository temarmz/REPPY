create function public.get_telegram_connection()
returns table (
  connected boolean,
  username text,
  first_name text,
  linked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select true, account.username, account.first_name, account.linked_at
  from public.telegram_accounts account
  where account.profile_id = (select auth.uid())

  union all

  select false, null::text, null::text, null::timestamptz
  where (select auth.uid()) is not null
    and not exists (
      select 1
      from public.telegram_accounts account
      where account.profile_id = (select auth.uid())
    )
  limit 1;
$$;

revoke all on function public.get_telegram_connection() from public, anon;
grant execute on function public.get_telegram_connection() to authenticated;
