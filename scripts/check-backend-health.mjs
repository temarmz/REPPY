import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Заполните ${missing.join(', ')} в .env.admin.local.`);

const projectUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(projectUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function edgeHealth(name, body) {
  const response = await fetch(`${projectUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${payload.error ?? ''}`.trim());
  return payload;
}

const [telegramAuth, telegramNotifications, outboxResult, accountsResult] = await Promise.all([
  edgeHealth('telegram-auth', { action: 'config' }),
  edgeHealth('telegram-notifications', { action: 'health' }),
  supabase
    .from('telegram_notification_outbox')
    .select('recipient_profile_id, status, attempts, available_at, processing_started_at, last_error, created_at')
    .neq('status', 'sent')
    .limit(5000),
  supabase.from('telegram_accounts').select('profile_id').limit(5000),
]);

if (outboxResult.error) throw new Error(`Очередь Telegram: ${outboxResult.error.message}`);
if (accountsResult.error) throw new Error(`Telegram-аккаунты: ${accountsResult.error.message}`);

const now = Date.now();
const fiveMinutes = 5 * 60 * 1000;
const rows = outboxResult.data ?? [];
const linkedProfiles = new Set((accountsResult.data ?? []).map((row) => row.profile_id));
const staleProcessing = rows.filter((row) => row.status === 'processing'
  && row.processing_started_at
  && now - new Date(row.processing_started_at).getTime() > fiveMinutes);
const overdue = rows.filter((row) => row.status === 'pending'
  && now - new Date(row.available_at).getTime() > fiveMinutes);
const retrying = rows.filter((row) => row.status === 'pending' && row.attempts > 0);
const exhausted = rows.filter((row) => row.attempts >= 20);
const withoutTelegram = rows.filter((row) => !linkedProfiles.has(row.recipient_profile_id));

const report = {
  checkedAt: new Date().toISOString(),
  edgeFunctions: {
    telegramAuth: telegramAuth.clientId ? 'ok' : 'misconfigured',
    telegramNotifications: telegramNotifications.configured ? 'ok' : 'misconfigured',
  },
  telegramOutbox: {
    unsent: rows.length,
    retrying: retrying.length,
    overdueMoreThanFiveMinutes: overdue.length,
    staleProcessing: staleProcessing.length,
    exhausted: exhausted.length,
    recipientsWithoutTelegram: withoutTelegram.length,
    recentErrors: [...new Set(retrying.map((row) => row.last_error).filter(Boolean))].slice(0, 5),
  },
};

console.log(JSON.stringify(report, null, 2));

const unhealthy = report.edgeFunctions.telegramAuth !== 'ok'
  || report.edgeFunctions.telegramNotifications !== 'ok'
  || overdue.length > 0
  || staleProcessing.length > 0
  || exhausted.length > 0
  || withoutTelegram.length > 0;

if (unhealthy) {
  console.error('Backend health check failed. Проверьте Edge Function Logs и telegram_notification_outbox.');
  process.exitCode = 1;
} else {
  console.log('Backend REPPY работает штатно; зависших Telegram-уведомлений нет.');
}
