import { createClient } from 'jsr:@supabase/supabase-js@2'

type TelegramMessage = {
  chat?: { id?: number; type?: string }
  from?: { id?: number; username?: string; first_name?: string }
  text?: string
}

type TelegramUpdate = { message?: TelegramMessage }

const telegramApi = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

function hasExpectedSecret(request: Request, expectedSecret: string): boolean {
  const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (receivedSecret.length !== expectedSecret.length) return false

  let mismatch = 0
  for (let index = 0; index < expectedSecret.length; index += 1) {
    mismatch |= receivedSecret.charCodeAt(index) ^ expectedSecret.charCodeAt(index)
  }
  return mismatch === 0
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(telegramApi(token, 'sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`)
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!botToken || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response('Webhook is not configured', { status: 503 })
  }

  if (!hasExpectedSecret(request, webhookSecret)) return new Response('Unauthorized', { status: 401 })

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const message = update.message
  const chatId = message?.chat?.id
  const telegramUserId = message?.from?.id
  const firstName = message?.from?.first_name
  if (message?.chat?.type !== 'private' || !chatId || !telegramUserId || !firstName) {
    return new Response('ok')
  }

  const trainerRegistrationToken = message.text?.match(/^\/start\s+trainer_([a-f0-9]{48})$/i)?.[1]?.toLowerCase()
  const startCode = message.text?.match(/^\/start\s+([a-f0-9]{48})$/i)?.[1]?.toLowerCase()
  if (!trainerRegistrationToken && !startCode) {
    await sendMessage(botToken, chatId, 'Привет! Открой REPPY, выбери «Подключить Telegram» и перейди по выданной ссылке.')
    return new Response('ok')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  if (trainerRegistrationToken) {
    const { data: status, error } = await supabase.rpc('verify_trainer_registration', {
      p_token: trainerRegistrationToken,
      p_telegram_user_id: telegramUserId,
      p_chat_id: chatId,
      p_username: message.from?.username ?? null,
      p_first_name: firstName,
    })

    if (error) throw error
    await sendMessage(
      botToken,
      chatId,
      status === 'verified'
        ? 'Telegram подтверждён. Вернитесь в REPPY и завершите создание аккаунта тренера.'
        : status === 'telegram-already-linked'
          ? 'Этот Telegram уже подключён к другому аккаунту REPPY. Сначала удалите старую тестовую привязку.'
          : 'Ссылка регистрации уже использована или устарела. Запросите новую у администратора REPPY.',
    )
    return new Response('ok')
  }

  const { data: linked, error } = await supabase.rpc('consume_telegram_link_code', {
    p_code: startCode,
    p_telegram_user_id: telegramUserId,
    p_chat_id: chatId,
    p_username: message.from?.username ?? null,
    p_first_name: firstName,
  })

  if (error) throw error
  await sendMessage(
    botToken,
    chatId,
    linked === true
      ? 'Telegram успешно подключён к REPPY. Здесь будут приходить уведомления о тренировках.'
      : 'Эта ссылка уже использована или устарела. Вернись в REPPY и создай новую ссылку для подключения.',
  )

  return new Response('ok')
})
