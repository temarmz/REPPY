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

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
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
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = serviceRoleKey()
  const clientId = Deno.env.get('TELEGRAM_OIDC_CLIENT_ID')
  if (!supabaseUrl || !serviceKey || !clientId) return json({ error: 'Telegram Login is not configured' }, 503)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (body.action === 'config') return json({ clientId })

  const idToken = typeof body.idToken === 'string' ? body.idToken : ''
  const nonce = typeof body.nonce === 'string' ? body.nonce : ''
  if (!idToken || nonce.length < 32 || nonce.length > 128) return json({ error: 'Invalid Telegram request' }, 400)

  let telegram: TelegramIdentity
  try { telegram = await verifyTelegramIdToken(idToken, nonce, clientId) } catch (error) {
    console.error('Telegram OIDC verification failed', error)
    return json({ error: 'Telegram verification failed' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: linkedAccount, error: linkedError } = await admin
    .from('telegram_accounts')
    .select('profile_id')
    .eq('telegram_user_id', telegram.id)
    .maybeSingle()
  if (linkedError) return json({ error: 'Unable to load REPPY account' }, 500)

  const sessionFor = async (userId: string) => {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    const email = userData.user?.email
    if (userError || !email) throw userError ?? new Error('Auth user has no internal email')
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError) throw linkError
    return { tokenHash: linkData.properties.hashed_token }
  }

  if (linkedAccount?.profile_id) {
    try { return json({ status: 'authenticated', ...(await sessionFor(linkedAccount.profile_id)) }) }
    catch (error) { console.error('Telegram session issue failed', error); return json({ error: 'Unable to open REPPY account' }, 500) }
  }

  if (body.action === 'login') return json({ status: 'registration-required', telegram }, 404)
  if (body.action === 'preview-trainer-registration') return json({ status: 'registration-required', telegram })

  const syntheticEmail = `telegram-${telegram.id}@users.reppy.invalid`
  const createUser = async (role?: 'trainer') => admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    app_metadata: role ? { reppy_role: role, telegram_user_id: String(telegram.id) } : { telegram_user_id: String(telegram.id) },
    user_metadata: { display_name: telegram.displayName },
  })

  if (body.action === 'register-trainer') {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    if (displayName.length < 2 || displayName.length > 120) return json({ error: 'Укажите имя длиной от 2 до 120 символов.' }, 400)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      app_metadata: { reppy_role: 'trainer', telegram_user_id: String(telegram.id) },
      user_metadata: { display_name: displayName },
    })
    if (createError || !created.user) return json({ error: 'Не удалось создать кабинет тренера.' }, 409)
    const { error: telegramError } = await admin.from('telegram_accounts').insert({
      profile_id: created.user.id,
      telegram_user_id: telegram.id,
      chat_id: telegram.id,
      username: telegram.username,
      first_name: telegram.firstName,
    })
    if (telegramError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'Не удалось связать Telegram с кабинетом.' }, 409)
    }
    try { return json({ status: 'authenticated', ...(await sessionFor(created.user.id)) }) }
    catch (error) { console.error('Trainer session issue failed', error); return json({ error: 'Кабинет создан, но вход не выполнен.' }, 500) }
  }

  if (body.action === 'accept-student-invitation') {
    const invitationToken = typeof body.invitationToken === 'string' ? body.invitationToken : ''
    if (invitationToken.length < 40 || invitationToken.length > 128) return json({ error: 'Приглашение недействительно.' }, 400)
    const { data: created, error: createError } = await createUser()
    if (createError || !created.user) return json({ error: 'Не удалось создать аккаунт ученика.' }, 409)
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
      return json({ error: 'Приглашение недействительно или уже использовано.' }, 409)
    }
    try { return json({ status: 'authenticated', ...(await sessionFor(created.user.id)) }) }
    catch (error) { console.error('Student session issue failed', error); return json({ error: 'Аккаунт создан, но вход не выполнен.' }, 500) }
  }

  return json({ error: 'Unsupported action' }, 400)
})
