import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0'

const appOrigin = 'https://temarmz.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

type TelegramIdentity = {
  id: number
  firstName: string
  displayName: string
  username: string | null
}

type RateLimitResult = {
  allowed?: boolean
  retryAfterSeconds?: number
}

const rateRules: Record<string, { limit: number; windowSeconds: number; blockSeconds: number }> = {
  config: { limit: 120, windowSeconds: 60, blockSeconds: 60 },
  login: { limit: 20, windowSeconds: 300, blockSeconds: 300 },
  'preview-trainer-registration': { limit: 10, windowSeconds: 600, blockSeconds: 600 },
  'register-trainer': { limit: 6, windowSeconds: 600, blockSeconds: 900 },
  'accept-student-invitation': { limit: 6, windowSeconds: 600, blockSeconds: 900 },
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function failure(code: string, error: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ code, error, ...extra }, status)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function enforceRateLimit(
  admin: ReturnType<typeof createClient>,
  request: Request,
  action: string,
) {
  const rule = rateRules[action] ?? { limit: 10, windowSeconds: 300, blockSeconds: 600 }
  const address = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const key = await sha256(`${action}:${address}`)
  const { data, error } = await admin.rpc('consume_telegram_auth_rate_limit', {
    p_key: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
    p_block_seconds: rule.blockSeconds,
  })
  if (error) throw error
  return data as RateLimitResult
}

function serviceRoleKey(): string | null {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default
    } catch { return null }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

async function verifyTelegramIdToken(idToken: string, nonce: string, clientId: string): Promise<TelegramIdentity> {
  const jwks = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'))
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: 'https://oauth.telegram.org',
    audience: clientId,
  })
  if (payload.nonce !== nonce) throw new Error('Invalid Telegram nonce')

  const textClaim = (...values: unknown[]) => values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() ?? ''
  const rawId = Number(payload.id ?? payload.sub)
  const firstName = textClaim(payload.given_name, payload.first_name, textClaim(payload.name).split(/\s+/)[0])
  const lastName = textClaim(payload.family_name, payload.last_name)
  const displayName = textClaim(payload.name, [firstName, lastName].filter(Boolean).join(' '), firstName)
  if (!Number.isSafeInteger(rawId) || rawId <= 0 || !firstName || !displayName) {
    throw new Error('Telegram profile is incomplete')
  }
  return {
    id: rawId,
    firstName,
    displayName: displayName.slice(0, 120),
    username: textClaim(payload.preferred_username, payload.username) || null,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return failure('method_not_allowed', 'Method not allowed', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = serviceRoleKey()
  const clientId = Deno.env.get('TELEGRAM_OIDC_CLIENT_ID')
  if (!supabaseUrl || !serviceKey || !clientId) return failure('not_configured', 'Telegram Login is not configured', 503)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return failure('invalid_json', 'Invalid JSON', 400) }
  const action = typeof body.action === 'string' ? body.action : ''
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  try {
    const rate = await enforceRateLimit(admin, request, action)
    if (rate.allowed !== true) {
      return failure(
        'rate_limited',
        'Слишком много попыток. Подождите немного и повторите.',
        429,
        { retryAfterSeconds: Math.max(1, Number(rate.retryAfterSeconds) || 60) },
      )
    }
  } catch (error) {
    console.error('Telegram auth rate limiter failed', error)
    return failure('rate_limit_unavailable', 'Вход временно недоступен. Повторите через минуту.', 503)
  }
  if (action === 'config') return json({ clientId })
  if (!['login', 'preview-trainer-registration', 'register-trainer', 'accept-student-invitation'].includes(action)) {
    return failure('unsupported_action', 'Unsupported action', 400)
  }

  const idToken = typeof body.idToken === 'string' ? body.idToken : ''
  const nonce = typeof body.nonce === 'string' ? body.nonce : ''
  if (!idToken || nonce.length < 32 || nonce.length > 128) return failure('invalid_request', 'Invalid Telegram request', 400)

  let telegram: TelegramIdentity
  try { telegram = await verifyTelegramIdToken(idToken, nonce, clientId) } catch (error) {
    console.error('Telegram OIDC verification failed', error)
    return failure('verification_failed', 'Не удалось подтвердить данные Telegram. Закройте окно входа и повторите.', 401)
  }

  const { data: linkedAccount, error: linkedError } = await admin
    .from('telegram_accounts')
    .select('profile_id')
    .eq('telegram_user_id', telegram.id)
    .maybeSingle()
  if (linkedError) return failure('account_lookup_failed', 'Unable to load REPPY account', 500)

  const sessionFor = async (userId: string) => {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    const email = userData.user?.email
    if (userError || !email) throw userError ?? new Error('Auth user has no internal email')
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError) throw linkError
    return { tokenHash: linkData.properties.hashed_token }
  }

  if (linkedAccount?.profile_id) {
    if (action !== 'login' && action !== 'register-trainer') {
      return failure(
        'telegram_already_linked',
        'Этот Telegram уже связан с аккаунтом REPPY. Вернитесь на экран входа.',
        409,
      )
    }
    try { return json({ status: 'authenticated', ...(await sessionFor(linkedAccount.profile_id)) }) }
    catch (error) { console.error('Telegram session issue failed', error); return failure('session_failed', 'Unable to open REPPY account', 500) }
  }

  if (action === 'login') return json({ code: 'account_not_found', status: 'registration-required', telegram })
  if (action === 'preview-trainer-registration') return json({ status: 'registration-required', telegram })

  const syntheticEmail = `telegram-${telegram.id}@users.reppy.invalid`
  const createUser = async (role?: 'trainer') => admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    app_metadata: role ? { reppy_role: role, telegram_user_id: String(telegram.id) } : { telegram_user_id: String(telegram.id) },
    user_metadata: { display_name: telegram.displayName },
  })

  if (action === 'register-trainer') {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    if (displayName.length < 2 || displayName.length > 120) return failure('invalid_display_name', 'Укажите имя длиной от 2 до 120 символов.', 400)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      app_metadata: { reppy_role: 'trainer', telegram_user_id: String(telegram.id) },
      user_metadata: { display_name: displayName },
    })
    if (createError || !created.user) return failure('trainer_already_exists', 'Аккаунт для этого Telegram уже создан. Попробуйте войти.', 409)
    const { error: telegramError } = await admin.from('telegram_accounts').insert({
      profile_id: created.user.id,
      telegram_user_id: telegram.id,
      chat_id: telegram.id,
      username: telegram.username,
      first_name: telegram.firstName,
    })
    if (telegramError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return failure('telegram_already_linked', 'Этот Telegram уже связан с другим аккаунтом REPPY.', 409)
    }
    try { return json({ status: 'authenticated', ...(await sessionFor(created.user.id)) }) }
    catch (error) { console.error('Trainer session issue failed', error); return failure('session_failed', 'Кабинет создан, но вход не выполнен.', 500) }
  }

  if (action === 'accept-student-invitation') {
    const invitationToken = typeof body.invitationToken === 'string' ? body.invitationToken : ''
    if (invitationToken.length < 40 || invitationToken.length > 128) return failure('invitation_invalid', 'Приглашение недействительно.', 400)
    const { data: created, error: createError } = await createUser()
    if (createError || !created.user) return failure('student_already_exists', 'Аккаунт для этого Telegram уже создан. Войдите через Telegram.', 409)
    const { error: acceptError } = await admin.rpc('accept_student_invitation_from_telegram', {
      p_token: invitationToken,
      p_user_id: created.user.id,
      p_telegram_user_id: telegram.id,
      p_chat_id: telegram.id,
      p_username: telegram.username,
      p_first_name: telegram.firstName,
    })
    if (acceptError) {
      await admin.auth.admin.deleteUser(created.user.id)
      const message = acceptError.message.toLowerCase()
      if (message.includes('expired')) return failure('invitation_expired', 'Срок действия приглашения истёк. Попросите тренера создать новую ссылку.', 410)
      if (message.includes('revoked')) return failure('invitation_revoked', 'Тренер отозвал это приглашение. Попросите новую ссылку.', 410)
      if (message.includes('used')) return failure('invitation_used', 'Это приглашение уже использовано. Войдите через Telegram или попросите тренера о новом приглашении.', 409)
      if (message.includes('already linked')) return failure('telegram_already_linked', 'Этот Telegram уже связан с аккаунтом REPPY.', 409)
      return failure('invitation_invalid', 'Приглашение недействительно.', 409)
    }
    try { return json({ status: 'authenticated', ...(await sessionFor(created.user.id)) }) }
    catch (error) { console.error('Student session issue failed', error); return failure('session_failed', 'Аккаунт создан, но вход не выполнен.', 500) }
  }

  return failure('unsupported_action', 'Unsupported action', 400)
})
