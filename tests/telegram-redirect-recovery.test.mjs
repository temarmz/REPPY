import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(t, failAt) {
  const { completeTelegramRedirect, resetTelegramRedirect, hasTelegramRedirectCallback } = await import(`../app/telegram-login.ts?recovery=${failAt}`);
  const previous = globalThis.window;
  t.after(() => { globalThis.window = previous; });
  const pending = { action: 'login', state: 'qa-state', nonce: 'qa-nonce', verifier: 'qa-verifier',
    returnHash: '#/auth/sign-in', startedAt: Date.now() };
  let stored = JSON.stringify(pending);
  const location = new URL('https://reppy.test/?code=qa-code&state=qa-state#/auth/sign-in');
  const history = { state: { reppyIndex: 4 }, replaceState(state, _unused, url) {
    this.state = state; location.href = new URL(url, location).href;
  } };
  globalThis.window = { location, history, sessionStorage: {
    getItem: () => stored, removeItem: () => { stored = null; },
  } };
  const calls = { exchange: 0, login: 0, session: 0 };
  const consumedCodes = new Set();
  let failed = false;
  const client = {
    functions: { invoke: async (_name, { body }) => {
      const step = body.action === 'exchange-code' ? 'exchange' : 'login';
      calls[step]++;
      if (failAt === step && !failed) {
        failed = true;
        return { data: null, error: { message: 'Network unavailable' } };
      }
      if (step === 'exchange') {
        assert.equal(consumedCodes.has(body.code), false, 'A consumed OAuth code must not be exchanged again');
        consumedCodes.add(body.code);
        return { data: { idToken: 'isolated-id-token' }, error: null };
      }
      assert.equal(body.idToken, 'isolated-id-token');
      return { data: { status: 'authenticated', tokenHash: `isolated-session-${calls.login}` }, error: null };
    } },
    auth: { verifyOtp: async () => {
      calls.session++;
      if (failAt === 'session' && !failed) {
        failed = true;
        return { error: { message: 'Session request failed' } };
      }
      return { error: null };
    } },
  };
  return { complete: () => completeTelegramRedirect(client), reset: resetTelegramRedirect,
    hasCallback: hasTelegramRedirectCallback, client, location, history, calls, stored: () => stored,
    nextCallback() {
      stored = JSON.stringify({ ...pending, state: 'next-state', nonce: 'next-nonce', startedAt: Date.now() });
      location.search = '?code=next-code&state=next-state';
    },
  };
}

for (const step of ['exchange', 'login', 'session']) {
  test(`Telegram redirect can recover after ${step} fails without losing its callback`, async t => {
    const f = await fixture(t, step);
    await assert.rejects(f.complete());
    assert.ok(f.stored(), 'Pending callback must survive until authentication succeeds');
    assert.doesNotMatch(f.stored(), /isolated-id-token/, 'The exchanged ID token must not be written to disk');
    assert.equal(f.location.search, '?code=qa-code&state=qa-state');
    const resumed = f.complete();
    assert.equal(f.complete(), resumed, 'Concurrent completion must share one request');
    assert.equal(await resumed, null);
    assert.equal(f.calls.exchange, step === 'exchange' ? 2 : 1);
    assert.equal(f.calls.login, step === 'exchange' ? 1 : 2);
    assert.equal(f.calls.session, step === 'session' ? 2 : 1);
    assert.equal(f.stored(), null);
    assert.equal(f.location.search, '');
    assert.equal(f.location.hash, '#/auth/sign-in');
    assert.deepEqual(f.history.state, { reppyIndex: 4 });
  });
}

test('starting over prevents a late exchanged token from authenticating the abandoned callback', async t => {
  const f = await fixture(t, 'discard');
  let release;
  const exchange = new Promise(resolve => { release = resolve; });
  const invoke = f.client.functions.invoke;
  f.client.functions.invoke = (_name, { body }) => {
    if (body.action !== 'exchange-code') return invoke(_name, { body });
    f.calls.exchange++;
    return exchange;
  };
  const abandoned = f.complete();
  f.reset();
  release({ data: { idToken: 'late-id-token' }, error: null });
  await assert.rejects(abandoned, { name: 'AbortError' });
  assert.deepEqual(f.calls, { exchange: 1, login: 0, session: 0 });
  assert.equal(f.stored(), null);
  assert.equal(f.location.search, '');
});

test('a new callback cannot reuse the completed result of a previous login', async t => {
  const f = await fixture(t, 'next-callback');
  assert.equal(await f.complete(), null);
  f.nextCallback();
  assert.equal(await f.complete(), null);
  assert.deepEqual(f.calls, { exchange: 2, login: 2, session: 2 });
});

test('failed storage cleanup does not report a confirmed session as a failed login', async t => {
  const f = await fixture(t, 'cleanup');
  window.sessionStorage.removeItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
  assert.equal(await f.complete(), null);
  assert.deepEqual(f.calls, { exchange: 1, login: 1, session: 1 });
  assert.equal(f.location.search, '');
  assert.equal(f.hasCallback(), false);
});
