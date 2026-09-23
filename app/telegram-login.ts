import type { SupabaseClient } from '@supabase/supabase-js';

type TelegramLoginResult = {
  id_token?: string;
  error?: string;
};

type TelegramLoginApi = {
  auth: (
    options: { client_id: number; scope: Array<'profile' | 'write'>; lang: string; nonce: string },
    callback: (result: TelegramLoginResult) => void,
  ) => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginApi };
  }
}

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

let sdkPromise: Promise<void> | null = null;

function loadTelegramSdk() {
  if (window.Telegram?.Login) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://oauth.telegram.org/js/telegram-login.js';
    script.async = true;
    script.onload = () => window.Telegram?.Login ? resolve() : reject(new Error('Telegram Login не загрузился.'));
    script.onerror = () => reject(new Error('Не удалось загрузить Telegram Login.'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

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

async function authorizeTelegram(client: SupabaseClient) {
  const config = await callTelegramAuth(client, { action: 'config' });
  const clientId = Number((config as TelegramAuthResponse & { clientId?: string }).clientId);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) throw new Error('Telegram Login ещё не настроен.');
  await loadTelegramSdk();
  const nonce = randomNonce();
  const idToken = await new Promise<string>((resolve, reject) => {
    window.Telegram?.Login?.auth(
      { client_id: clientId, scope: ['profile', 'write'], lang: 'ru', nonce },
      (result) => result.id_token ? resolve(result.id_token) : reject(new Error(result.error || 'Вход через Telegram отменён.')),
    );
  });
  return { idToken, nonce };
}

async function applySession(client: SupabaseClient, tokenHash?: string) {
  if (!tokenHash) throw new Error('Сервер не выдал сессию REPPY.');
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw new Error(error.message);
}

export async function telegramSignIn(client: SupabaseClient) {
  const authorization = await authorizeTelegram(client);
  const result = await callTelegramAuth(client, { action: 'login', ...authorization });
  if (result.status === 'registration-required') {
    throw new Error('Аккаунт не найден. Создай кабинет тренера или открой приглашение от тренера.');
  }
  await applySession(client, result.tokenHash);
}

export async function previewTelegramTrainerRegistration(client: SupabaseClient): Promise<PendingTelegramRegistration> {
  const authorization = await authorizeTelegram(client);
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
  const authorization = await authorizeTelegram(client);
  const result = await callTelegramAuth(client, {
    action: 'accept-student-invitation',
    invitationToken,
    ...authorization,
  });
  await applySession(client, result.tokenHash);
}
