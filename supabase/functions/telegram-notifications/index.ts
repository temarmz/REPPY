import { createClient } from 'jsr:@supabase/supabase-js@2'

const appOrigin = 'https://temarmz.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

type Notification = {
  notification_id: string
  actor_profile_id?: string
  notification_kind:
    | 'assignment-reschedule-requested'
    | 'assignment-reschedule-accepted'
    | 'assignment-reschedule-declined'
    | 'assignment-created'
    | 'assignment-updated'
    | 'assignment-canceled'
    | 'workout-completed'
  notification_payload: Record<string, unknown>
  telegram_chat_id: number
}

function isExpectedPublishableKey(received: string | null): boolean {
  if (!received) return false

  const configuredKeys: string[] = []
  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (legacyKey) configuredKeys.push(legacyKey)

  const publishedKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (publishedKeys) {
    try {
      const parsed = JSON.parse(publishedKeys) as Record<string, unknown>
      configuredKeys.push(...Object.values(parsed).filter((value): value is string => typeof value === 'string'))
    } catch {
      return false
    }
  }

  return configuredKeys.some((expected) => expected === received)
}

function serviceRoleKey(): string | null {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>
      const defaultKey = parsed.default
      if (typeof defaultKey === 'string' && defaultKey) return defaultKey
    } catch {
      return null
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function textValue(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function scheduleText(payload: Record<string, unknown>): string {
  const date = textValue(payload, 'scheduledFor', '')
  const time = textValue(payload, 'scheduledTime', '').slice(0, 5)
  const format = textValue(payload, 'format', 'in-person')
  return format === 'online' ? `${date} · онлайн` : `${date}${time ? ` в ${time}` : ''}`
}

function notificationText(notification: Notification): string {
  const payload = notification.notification_payload
  const studentName = textValue(payload, 'studentName', 'Ученик')
  const workoutName = textValue(payload, 'workoutName', 'Тренировка')

  if (notification.notification_kind === 'assignment-reschedule-requested') {
    const date = textValue(payload, 'scheduledFor', '')
    const time = textValue(payload, 'scheduledTime', '').slice(0, 5)
    return `🔄 ${studentName} просит перенести тренировку «${workoutName}» на ${date}${time ? ` в ${time}` : ''}. Открой REPPY, чтобы проверить запрос.`
  }

  if (notification.notification_kind === 'assignment-reschedule-accepted') {
    const date = textValue(payload, 'scheduledFor', '')
    const time = textValue(payload, 'scheduledTime', '').slice(0, 5)
    return `✅ Тренер подтвердил перенос тренировки «${workoutName}» на ${date}${time ? ` в ${time}` : ''}. Новое время уже в REPPY.`
  }

  if (notification.notification_kind === 'assignment-reschedule-declined') {
    const date = textValue(payload, 'scheduledFor', '')
    const time = textValue(payload, 'scheduledTime', '').slice(0, 5)
    return `↩️ Тренер отклонил перенос тренировки «${workoutName}». Она остаётся на ${date}${time ? ` в ${time}` : ''}.`
  }

  if (notification.notification_kind === 'assignment-created') {
    return `📅 Тренер назначил тренировку «${workoutName}» на ${scheduleText(payload)}. Подробности уже в REPPY.`
  }

  if (notification.notification_kind === 'assignment-updated') {
    return `✏️ Тренер изменил тренировку «${workoutName}». Актуальное расписание: ${scheduleText(payload)}.`
  }

  if (notification.notification_kind === 'assignment-canceled') {
    return `🚫 Тренер отменил тренировку «${workoutName}», запланированную на ${scheduleText(payload)}.`
  }

  return `✅ ${studentName} завершил(а) тренировку «${workoutName}». Результаты уже доступны в REPPY.`
}

async function sendMessage(botToken: string, notification: Notification): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: notification.telegram_chat_id,
      text: notificationText(notification),
    }),
  })
  if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serverKey = serviceRoleKey()
  const authorization = request.headers.get('authorization')
  const apiKey = request.headers.get('apikey')
  if (!supabaseUrl || !serverKey) {
    return jsonResponse({ error: 'Notifications are not configured' }, 503)
  }

  let requestBody: Record<string, unknown>
  try { requestBody = await request.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }
  const serviceAuthorization = authorization?.replace(/^Bearer\s+/i, '')
  const trustedHealthCheck = requestBody.action === 'health'
    && (serviceAuthorization === serverKey || apiKey === serverKey)
  if (trustedHealthCheck) {
    return jsonResponse({ ok: true, configured: Boolean(botToken) }, botToken ? 200 : 503)
  }
  if (!botToken) return jsonResponse({ error: 'Notifications are not configured' }, 503)

  const supabase = createClient(supabaseUrl, serverKey, { auth: { persistSession: false } })
  let actorProfileId: string | null = null
  if (authorization) {
    const accessToken = authorization.replace(/^Bearer\s+/i, '')
    const { data: userData } = await supabase.auth.getUser(accessToken)
    actorProfileId = userData.user?.id ?? null
  }

  const scheduledDelivery = !actorProfileId && isExpectedPublishableKey(apiKey)
  if (!actorProfileId && !scheduledDelivery) return jsonResponse({ error: 'Unauthorized' }, 401)

  const { data, error } = scheduledDelivery
    ? await supabase.rpc('claim_due_telegram_notifications', { p_limit: 25 })
    : await supabase.rpc('claim_telegram_notifications', {
        p_actor_profile_id: actorProfileId,
        p_limit: 10,
      })
  if (error) return jsonResponse({ error: 'Could not claim notifications' }, 500)

  let sent = 0
  for (const notification of (data ?? []) as Notification[]) {
    const notificationActorId = notification.actor_profile_id ?? actorProfileId
    if (!notificationActorId) continue
    try {
      await sendMessage(botToken, notification)
      await supabase.rpc('finish_telegram_notification', {
        p_notification_id: notification.notification_id,
        p_actor_profile_id: notificationActorId,
        p_success: true,
        p_error: null,
      })
      sent += 1
    } catch (deliveryError) {
      await supabase.rpc('finish_telegram_notification', {
        p_notification_id: notification.notification_id,
        p_actor_profile_id: notificationActorId,
        p_success: false,
        p_error: deliveryError instanceof Error ? deliveryError.message : 'Unknown delivery error',
      })
    }
  }

  return jsonResponse({ ok: true, claimed: data?.length ?? 0, sent })
})
