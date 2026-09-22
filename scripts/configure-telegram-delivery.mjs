import { spawnSync } from 'node:child_process'

const projectRef = process.env.REPPY_SUPABASE_PROJECT_REF ?? 'jpsyweztxrhcuxezoeej'
if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  console.error('Invalid Supabase project ref.')
  process.exit(1)
}

const keyResult = spawnSync('npx', [
  'supabase',
  'projects',
  'api-keys',
  '--project-ref',
  projectRef,
  '--reveal',
  '--output',
  'json',
], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (keyResult.status !== 0) {
  console.error('Could not read Supabase API keys. Run `npx supabase login` and try again.')
  process.exit(1)
}

let keys
try {
  keys = JSON.parse(keyResult.stdout)
} catch {
  console.error('Supabase CLI returned an unexpected API key response.')
  process.exit(1)
}

if (!Array.isArray(keys)) {
  console.error('Supabase CLI returned an unexpected API key response.')
  process.exit(1)
}

const publishableKey = keys.find((key) => key?.type === 'publishable' && key?.name === 'default')?.api_key
  ?? keys.find((key) => key?.id === 'anon')?.api_key
const secretKey = keys.find((key) => key?.type === 'secret' && key?.name === 'default')?.api_key
  ?? keys.find((key) => key?.id === 'service_role')?.api_key

if (typeof publishableKey !== 'string' || typeof secretKey !== 'string') {
  console.error('The project needs both a publishable and a secret API key.')
  process.exit(1)
}

const projectUrl = `https://${projectRef}.supabase.co`
const response = await fetch(`${projectUrl}/rest/v1/rpc/configure_telegram_notification_delivery`, {
  method: 'POST',
  headers: {
    apikey: secretKey,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    p_project_url: projectUrl,
    p_publishable_key: publishableKey,
  }),
})

if (!response.ok) {
  console.error(`Supabase rejected Telegram delivery configuration with status ${response.status}.`)
  process.exit(1)
}

const workerResponse = await fetch(`${projectUrl}/functions/v1/telegram-notifications`, {
  method: 'POST',
  headers: {
    apikey: publishableKey,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ source: 'configuration-check' }),
})
const workerResult = await workerResponse.json().catch(() => null)
if (!workerResponse.ok || workerResult?.ok !== true) {
  console.error(`Telegram notification worker health check failed with status ${workerResponse.status}.`)
  process.exit(1)
}

console.log('Telegram notification delivery scheduled every 30 seconds and the worker health check passed.')
