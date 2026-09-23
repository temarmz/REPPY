import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingTelegramRegistration = {
  idToken: string;
  nonce: string;
  displayName: string;
  username: string | null;
};

type TelegramAuthResponse = {
  status?: 'authenticated' | 'registration-required';
  tokenHash?: string;
  telegram?: { displayName?: string; username?: string | null };
  error?: string;
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

  const popup = window.open(
    authUrl.toString(),
    'telegram_oidc_login',
    `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`,
  );
  if (!popup) throw new Error('Браузер заблокировал окно Telegram. Разреши всплывающие окна для REPPY.');

  try {
    const idToken = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        window.clearInterval(closeCheck);
        action();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== 'https://oauth.telegram.org' || event.source !== popup) return;
        let data = event.data as { event?: string; result?: string; error?: string };
        if (typeof event.data === 'string') {
          try { data = JSON.parse(event.data) as typeof data; } catch { return; }
        }
        if (data?.event !== 'auth_result') return;
        if (typeof data.result === 'string') finish(() => resolve(data.result!));
        else finish(() => reject(new Error(data.error || 'Telegram не подтвердил вход.')));
      };
      const closeCheck = window.setInterval(() => {
        if (popup.closed) finish(() => reject(new Error('Вход через Telegram отменён.')));
      }, 250);
      window.addEventListener('message', onMessage);
      popup.focus();
    });
    return { idToken, nonce };
  } catch (error) {
    popup.close();
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
    throw new Error('Аккаунт не найден. Создай кабинет тренера или открой приглашение от тренера.');
  }
  await applySession(client, result.tokenHash);
}

export async function previewTelegramTrainerRegistration(client: SupabaseClient): Promise<PendingTelegramRegistration> {
  const authorization = await authorizeTelegram();
  const result = await callTelegramAuth(client, { action: 'preview-trainer-registration', ...authorization });
  return {
    ...authorization,
    displayName: result.telegram?.displayName || '',
    username: result.telegram?.username ?? null,
  };
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
