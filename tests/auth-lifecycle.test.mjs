import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooksUrl = moduleUrl(`
export const state = [], effects = [];
export function useState(value) { const index = state.length; state.push(value); return [value, next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }
export const useRef = current => ({ current });
export const useMemo = fn => fn();
export const useCallback = fn => fn;
export const useEffect = fn => { effects.push(fn); };
`);
const clientUrl = moduleUrl('export let client; export const setClient = value => { client = value; }; export const getSupabaseClient = () => client; export const supabaseConfig = {};');
const telegramUrl = moduleUrl('export const acceptInvitationWithTelegram = () => {}; export const completeTelegramTrainerRegistration = () => {}; export const completeTelegramRedirect = () => {}; export const telegramSignIn = () => {};');
const hooks = await import(hooksUrl);
const dependency = await import(clientUrl);
const source = readFileSync(new URL('../app/reppy-auth.ts', import.meta.url), 'utf8')
  .replace("'react'", JSON.stringify(hooksUrl))
  .replace("'./supabase-client'", JSON.stringify(clientUrl))
  .replace("'./telegram-login'", JSON.stringify(telegramUrl));
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { useReppyAuth } = await import(moduleUrl(outputText));

function fixture(t) {
  hooks.state.length = 0;
  hooks.effects.length = 0;
  const timers = [], requests = [];
  let listener;
  dependency.setClient({
    auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: () => ({ select: () => ({ eq: (_key, id) => ({ maybeSingle: () => new Promise(resolve => requests.push({ id, resolve })) }) }) }),
  });
  const previous = globalThis.window;
  globalThis.window = { setTimeout: callback => timers.push(callback) };
  useReppyAuth();
  const cleanup = hooks.effects[0]();
  t.after(() => { cleanup(); globalThis.window = previous; });
  return { timers, requests, cleanup, emit: id => listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null) };
}

test('a queued profile load cannot start after a newer sign-out event', async t => {
  const f = fixture(t);
  f.emit('old-account');
  f.emit(null);
  f.timers.shift()();
  assert.equal(f.requests.length, 0);
  f.timers.shift()();
  assert.equal(hooks.state[2], 'anonymous');
  assert.equal(hooks.state[1], null);
});

test('an in-flight profile response cannot update state after auth cleanup', async t => {
  const f = fixture(t);
  f.emit('old-account');
  f.timers.shift()();
  f.cleanup();
  f.requests[0].resolve({ data: { id: 'old-account', role: 'trainer', display_name: 'Old' }, error: null });
  await new Promise(setImmediate);
  assert.equal(hooks.state[1], null);
  assert.notEqual(hooks.state[2], 'authenticated');
});
