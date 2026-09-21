const projectRef = process.env.REPPY_SUPABASE_PROJECT_REF ?? 'jpsyweztxrhcuxezoeej'
const botToken = process.env.REPPY_TELEGRAM_BOT_TOKEN
const webhookSecret = process.env.REPPY_TELEGRAM_WEBHOOK_SECRET

if (!botToken || !webhookSecret) {
  console.error('Set REPPY_TELEGRAM_BOT_TOKEN and REPPY_TELEGRAM_WEBHOOK_SECRET before running this script.')
  process.exit(1)
}

if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
  console.error('The webhook secret may contain only A-Z, a-z, 0-9, _ and - and must be at most 256 characters.')
  process.exit(1)
}

const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/telegram-webhook`
const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  }),
})

const result = await response.json().catch(() => null)
if (!response.ok || result?.ok !== true) {
  console.error('Telegram rejected the webhook configuration.')
  process.exit(1)
}

console.log(`Telegram webhook configured: ${webhookUrl}`)
