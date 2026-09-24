import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingTelegramRegistration = {
  idToken: string;
  nonce: string;
  displayName: string;
  username: string | null;
};

type TelegramAuthResponse = {
  code?: string;
  status?: 'authenticated' | 'registration-required';
  tokenHash?: string;
  telegram?: { displayName?: string; username?: string | null };
  error?: string;
  retryAfterSeconds?: number;
};

// OAuth client IDs are public identifiers. Keeping this value in the browser
// lets us open Telegram synchronously from the click handler, which prevents
// Safari and embedded browsers from blocking or losing the popup.
const TELEGRAM_OIDC_CLIENT_ID = 8840817445;

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callTelegramAuth(client: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke<TelegramAuthResponse>('telegram-auth', { body });
  if (error) {
    const context = 'context' in error ? (error as { context?: Response }).context : undefined;
    if (context) {
      try {
        const payload = await context.json() as TelegramAuthResponse;
        if (payload.code === 'rate_limited') {
          const seconds = Math.max(1, Number(payload.retryAfterSeconds) || 60);
          throw new Error(`Слишком много попыток. Повторите через ${seconds} сек.`);
        }
        throw new Error(payload.error || 'Не удалось войти через Telegram.');
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason;
      }
    }
    throw new Error(error.message || 'Не удалось войти через Telegram.');
  }
  if (!data) throw new Error('Telegram не вернул данные входа.');
  if (data.error) throw new Error(data.error);
  return data;
}

function telegramAuthorizationError(reason?: string) {
  const normalized = reason?.toLowerCase() ?? '';
  if (normalized.includes('cancel') || normalized.includes('closed') || normalized.includes('denied')) {
    return new Error('Вход через Telegram отменён. Можно безопасно попробовать ещё раз.');
  }
  return new Error(reason || 'Telegram не подтвердил вход. Попробуйте ещё раз.');
}

async function authorizeTelegram() {
  const width = 550;
  const height = 650;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  const nonce = randomNonce();
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const authUrl = new URL('https://oauth.telegram.org/auth');
  authUrl.search = new URLSearchParams({
    response_type: 'post_message',
    client_id: String(TELEGRAM_OIDC_CLIENT_ID),
    redirect_uri: redirectUri,
    scope: 'openid profile telegram:bot_access',
    nonce,
    lang: 'ru',
  }).toString();

  let popup: Window | null = null;
  const closePopup = () => popup?.close();
  try {
    const idToken = await new Promise<string>((resolve, reject) => {
      let settled = false;
      let popupClosedAt = 0;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        window.clearInterval(closeCheck);
        window.clearTimeout(responseTimeout);
        action();
      };
      const onMessage = (event: MessageEvent) => {
        // iOS Safari may recreate the popup WindowProxy after switching to
        // the Telegram app. The exact origin and the server-verified nonce
        // authenticate the response; object identity is not reliable there.
        if (event.origin !== 'https://oauth.telegram.org') return;
        let data = event.data as { event?: string; result?: string; error?: string };
        if (typeof event.data === 'string') {
          try { data = JSON.parse(event.data) as typeof data; } catch { return; }
        }
        if (data?.event !== 'auth_result') return;
        if (typeof data.result === 'string') finish(() => resolve(data.result!));
        else finish(() => reject(telegramAuthorizationError(data.error)));
      };
      const closeCheck = window.setInterval(() => {
        if (!popup?.closed) {
          popupClosedAt = 0;
          return;
        }
        // Safari can report the popup as closed just before delivering its
        // final postMessage. Give that message a short chance to arrive.
        if (!popupClosedAt) popupClosedAt = Date.now();
        if (Date.now() - popupClosedAt >= 750) finish(() => reject(telegramAuthorizationError('popup_closed')));
      }, 250);
      const responseTimeout = window.setTimeout(() => {
        finish(() => reject(new Error('Telegram не ответил. Закрой окно входа и попробуй ещё раз.')));
      }, 90_000);
      window.addEventListener('message', onMessage);
      popup = window.open(
        authUrl.toString(),
        'telegram_oidc_login',
        `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`,
      );
      if (!popup) {
        finish(() => reject(new Error('Браузер заблокировал окно Telegram. Разреши всплывающие окна для REPPY.')));
        return;
      }
      popup.focus();
    });
    closePopup();
    return { idToken, nonce };
  } catch (error) {
    closePopup();
    throw error;
  }
}

async function applySession(client: SupabaseClient, tokenHash?: string) {
  if (!tokenHash) throw new Error('Сервер не выдал сессию REPPY.');
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw new Error(error.message);
}

export async function telegramSignIn(client: SupabaseClient) {
  const authorization = await authorizeTelegram();
  const result = await callTelegramAuth(client, { action: 'login', ...authorization });
  if (result.status === 'registration-required') {
    return {
      ...authorization,
      displayName: result.telegram?.displayName || '',
      username: result.telegram?.username ?? null,
    } satisfies PendingTelegramRegistration;
  }
  await applySession(client, result.tokenHash);
  return null;
}

export async function completeTelegramTrainerRegistration(
  client: SupabaseClient,
  pending: PendingTelegramRegistration,
  displayName: string,
) {
  const result = await callTelegramAuth(client, {
    action: 'register-trainer',
    idToken: pending.idToken,
    nonce: pending.nonce,
    displayName,
  });
  await applySession(client, result.tokenHash);
}

export async function acceptInvitationWithTelegram(client: SupabaseClient, invitationToken: string) {
  const authorization = await authorizeTelegram();
  const result = await callTelegramAuth(client, {
    action: 'accept-student-invitation',
    invitationToken,
    ...authorization,
  });
  await applySession(client, result.tokenHash);
}
