create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.claim_due_telegram_notifications(
  p_limit integer default 25
)
returns table (
  notification_id uuid,
  actor_profile_id uuid,
  notification_kind public.telegram_notification_kind,
  notification_payload jsonb,
  telegram_chat_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.telegram_notification_outbox outbox
    join public.telegram_accounts account on account.profile_id = outbox.recipient_profile_id
    where (
      outbox.status = 'pending'
      or (outbox.status = 'processing' and outbox.processing_started_at < clock_timestamp() - interval '5 minutes')
    )
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < 20
    order by outbox.created_at
    for update of outbox skip locked
    limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.telegram_notification_outbox outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        processing_started_at = clock_timestamp(),
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.actor_profile_id, outbox.recipient_profile_id, outbox.kind, outbox.payload
  )
  select claimed.id, claimed.actor_profile_id, claimed.kind, claimed.payload, account.chat_id
  from claimed
  join public.telegram_accounts account on account.profile_id = claimed.recipient_profile_id;
end;
$$;

revoke all on function public.claim_due_telegram_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_due_telegram_notifications(integer) to service_role;

create function public.configure_telegram_notification_delivery(
  p_project_url text,
  p_publishable_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url_secret_id uuid;
  v_publishable_key_secret_id uuid;
  v_job_id bigint;
begin
  if p_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/?$' then
    raise exception 'Invalid Supabase project URL' using errcode = '22023';
  end if;
  if length(trim(p_publishable_key)) < 20 then
    raise exception 'Invalid Supabase publishable key' using errcode = '22023';
  end if;

  select secret.id into v_project_url_secret_id
  from vault.secrets secret
  where secret.name = 'reppy_project_url';
  if v_project_url_secret_id is null then
    perform vault.create_secret(rtrim(p_project_url, '/'), 'reppy_project_url', 'REPPY Edge Function base URL');
  else
    perform vault.update_secret(v_project_url_secret_id, rtrim(p_project_url, '/'), 'reppy_project_url', 'REPPY Edge Function base URL');
  end if;

  select secret.id into v_publishable_key_secret_id
  from vault.secrets secret
  where secret.name = 'reppy_publishable_key';
  if v_publishable_key_secret_id is null then
    perform vault.create_secret(trim(p_publishable_key), 'reppy_publishable_key', 'REPPY Cron publishable API key');
  else
    perform vault.update_secret(v_publishable_key_secret_id, trim(p_publishable_key), 'reppy_publishable_key', 'REPPY Cron publishable API key');
  end if;

  for v_job_id in
    select job.jobid from cron.job job where job.jobname = 'reppy-telegram-notifications'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'reppy-telegram-notifications',
    '30 seconds',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reppy_project_url') || '/functions/v1/telegram-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'reppy_publishable_key')
        ),
        body := jsonb_build_object('source', 'supabase-cron'),
        timeout_milliseconds := 10000
      ) as request_id;
    $job$
  );
end;
$$;

revoke all on function public.configure_telegram_notification_delivery(text, text) from public, anon, authenticated;
grant execute on function public.configure_telegram_notification_delivery(text, text) to service_role;

comment on function public.configure_telegram_notification_delivery(text, text) is
  'Stores the REPPY Edge Function URL and publishable key in Vault and schedules Telegram outbox delivery every 30 seconds.';
