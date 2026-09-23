drop policy if exists subscription_entries_read_by_trainer on public.subscription_entries;
drop policy if exists subscription_entries_read_by_members on public.subscription_entries;

create policy subscription_entries_read_by_members on public.subscription_entries
for select to authenticated
using (private.can_read_relationship(relationship_id));

create function public.delete_subscription_payment(
  p_entry_id uuid,
  p_expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.subscription_entries entry
  where entry.id = p_entry_id
    and entry.kind = 'payment'
    and entry.revision = p_expected_revision
    and private.is_relationship_trainer(entry.relationship_id);

  if not found then
    raise exception 'Subscription payment changed or access denied' using errcode = '40001';
  end if;
end;
$$;

create function public.delete_subscription(p_relationship_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.is_relationship_trainer(p_relationship_id) then
    raise exception 'Only the trainer can delete a subscription' using errcode = '42501';
  end if;

  delete from public.subscription_entries entry
  where entry.relationship_id = p_relationship_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_subscription_payment(uuid, bigint)
  from public, anon;
grant execute on function public.delete_subscription_payment(uuid, bigint)
  to authenticated;

revoke all on function public.delete_subscription(uuid)
  from public, anon;
grant execute on function public.delete_subscription(uuid)
  to authenticated;
