import { SignJWT, jwtVerify } from 'npm:jose@6.1.0'

export type TelegramIdentity = { id: number; firstName: string; displayName: string; username: string | null }

const issuer = 'reppy:telegram-registration'

export async function issueRegistrationToken(telegram: TelegramIdentity, secret: string, audience: string) {
  return new SignJWT({ telegram }).setProtectedHeader({ alg: 'HS256' }).setIssuer(issuer)
    .setAudience(audience).setSubject(String(telegram.id)).setIssuedAt().setExpirationTime('15m')
    .sign(new TextEncoder().encode(secret))
}

export async function verifyRegistrationToken(token: string, secret: string, audience: string): Promise<TelegramIdentity> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'], issuer, audience,
    requiredClaims: ['exp', 'iat', 'sub'], maxTokenAge: '15m',
  })
  const telegram = payload.telegram as TelegramIdentity
  if (!telegram || !Number.isSafeInteger(telegram.id) || telegram.id <= 0 || String(telegram.id) !== payload.sub) {
    throw new Error('Invalid registration identity')
  }
  return telegram
}
