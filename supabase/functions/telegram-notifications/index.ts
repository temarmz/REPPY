import { createClient } from 'jsr:@supabase/supabase-js@2'

type Notification = {
  notification_id: string
  notification_kind: 'assignment-reschedule-requested' | 'workout-completed'
  notification_payload: Record<string, unknown>
  telegram_chat_id: number
}

function textValue(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
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
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization')
  if (!botToken || !supabaseUrl || !serviceRoleKey || !authorization) {
    return Response.json({ error: 'Notifications are not configured' }, { status: 503 })
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const actorProfileId = userData.user.id
  const { data, error } = await supabase.rpc('claim_telegram_notifications', {
    p_actor_profile_id: actorProfileId,
    p_limit: 10,
  })
  if (error) return Response.json({ error: 'Could not claim notifications' }, { status: 500 })

  let sent = 0
  for (const notification of (data ?? []) as Notification[]) {
    try {
      await sendMessage(botToken, notification)
      await supabase.rpc('finish_telegram_notification', {
        p_notification_id: notification.notification_id,
        p_actor_profile_id: actorProfileId,
        p_success: true,
        p_error: null,
      })
      sent += 1
    } catch (deliveryError) {
      await supabase.rpc('finish_telegram_notification', {
        p_notification_id: notification.notification_id,
        p_actor_profile_id: actorProfileId,
        p_success: false,
        p_error: deliveryError instanceof Error ? deliveryError.message : 'Unknown delivery error',
      })
    }
  }

  return Response.json({ claimed: data?.length ?? 0, sent })
})
