// Keep these exact. Prefix/origin matching would turn the public code exchange
// into a redirect oracle. New clients must register their callback in BotFather.
const telegramRedirectUris = new Set([
  'https://temarmz.github.io/REPPY/',
  'reppy://auth/telegram',
])

export function isAllowedTelegramRedirect(uri: string): boolean {
  return telegramRedirectUris.has(uri)
}
