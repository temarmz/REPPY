import assert from 'node:assert/strict';
import test from 'node:test';

import { telegramSignIn } from '../app/telegram-login.ts';

function installTelegramWindow(result = 'telegram-id-token', { replacePopupProxy = false } = {}) {
  const popup = {
    closed: false,
    close() { this.closed = true; },
    focus() {},
  };
  const listeners = new Set();
  globalThis.window = {
    screenX: 0,
    outerWidth: 390,
    screen: { height: 844 },
    location: { origin: 'https://temarmz.github.io', pathname: '/REPPY/' },
    open: () => popup,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      if (type !== 'message') return;
      listeners.add(listener);
      setTimeout(() => listener({
        origin: 'https://oauth.telegram.org',
        source: replacePopupProxy ? {} : popup,
        data: { event: 'auth_result', result },
      }), 0);
    },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  return popup;
}

test('единый Telegram-вход принимает ответ после замены popup-окна мобильным Safari', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const popup = installTelegramWindow('telegram-id-token', { replacePopupProxy: true });
  const client = {
    functions: {
      invoke: async (_name, { body }) => body.action === 'config' ? ({ data: { redirectFlowConfigured: false }, error: null }) : ({
        data: {
          status: 'registration-required',
          telegram: { displayName: 'Новый тренер', username: 'new_trainer' },
        },
        error: null,
      }),
    },
    auth: { verifyOtp: async () => assert.fail('Сессия не должна применяться до подтверждения регистрации') },
  };

  const pending = await telegramSignIn(client);

  assert.equal(pending.displayName, 'Новый тренер');
  assert.equal(pending.username, 'new_trainer');
  assert.equal(pending.idToken, 'telegram-id-token');
  assert.equal(popup.closed, true);
});

test('единый Telegram-вход сразу применяет сессию существующего аккаунта', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  installTelegramWindow();
  let appliedToken = '';
  const client = {
    functions: {
      invoke: async (_name, { body }) => body.action === 'config'
        ? ({ data: { redirectFlowConfigured: false }, error: null })
        : ({ data: { status: 'authenticated', tokenHash: 'session-token' }, error: null }),
    },
    auth: {
      verifyOtp: async ({ token_hash }) => {
        appliedToken = token_hash;
        return { error: null };
      },
    },
  };

  const pending = await telegramSignIn(client);

  assert.equal(pending, null);
  assert.equal(appliedToken, 'session-token');
});

test('мобильный вход использует полный redirect с PKCE вместо popup', async (t) => {
  const previousWindow = globalThis.window;
  const values = new Map();
  let assigned = '';
  let popupOpened = false;
  t.after(() => { globalThis.window = previousWindow; });
  globalThis.window = {
    location: {
      origin: 'https://temarmz.github.io', pathname: '/REPPY/', search: '', hash: '#/auth/sign-in',
      assign(value) { assigned = value; },
    },
    sessionStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
    open() { popupOpened = true; return null; },
  };
  const client = {
    functions: { invoke: async () => ({ data: { redirectFlowConfigured: true }, error: null }) },
    auth: { verifyOtp: async () => assert.fail('До возврата из Telegram сессия не применяется') },
  };

  await telegramSignIn(client);

  const url = new URL(assigned);
  assert.equal(url.origin, 'https://oauth.telegram.org');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(popupOpened, false);
  assert.ok(values.get('reppy-telegram-oidc'));
});
