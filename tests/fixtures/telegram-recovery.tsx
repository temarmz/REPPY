import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountScreen } from '../../app/auth-screens';
import { completeTelegramRedirect } from '../../app/telegram-login';
import { Page, PageTitle } from '../../app/ui/elements';

type Step = 'exchange' | 'login' | 'session';
const params = new URLSearchParams(location.search);
const failedStep = params.get('step') as Step;
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const fixture: { calls: Record<Step | 'fresh', number>; held: boolean; release: () => void } = {
  calls: { exchange: 0, login: 0, session: 0, fresh: 0 },
  held: false, release: () => { throw new Error('No request is held'); },
};
declare global { interface Window { telegramRecoveryQa: typeof fixture } }
window.telegramRecoveryQa = fixture;
let failed = false;
async function request(step: Step) {
  fixture.calls[step]++;
  if (step !== failedStep) return false;
  if (!failed) { failed = true; return true; }
  fixture.held = true;
  await new Promise<void>(resolve => { fixture.release = resolve; });
  return false;
}
let authenticated = () => {};
const client = {
  functions: { invoke: async (_name: string, { body }: { body: { action: string } }) => {
    const step = body.action === 'exchange-code' ? 'exchange' : 'login';
    if (await request(step)) return { data: null, error: { message: 'Isolated network failure' } };
    return { data: step === 'exchange' ? { idToken: 'isolated-id-token' }
      : { status: 'authenticated', tokenHash: 'isolated-session-token' }, error: null };
  } },
  auth: { verifyOtp: async () => {
    if (await request('session')) return { error: { message: 'Не удалось завершить вход. Проверь соединение.' } };
    authenticated();
    return { error: null };
  } },
};
const resume = () => completeTelegramRedirect(client as unknown as SupabaseClient);
function Harness() {
  const [signedIn, setSignedIn] = useState(false);
  useLayoutEffect(() => {
    authenticated = () => setSignedIn(true);
    return () => { authenticated = () => {}; };
  }, []);
  if (signedIn) return <Page><PageTitle>Вход подтверждён</PageTitle></Page>;
  return <AccountScreen onResumeTelegram={resume} onHome={() => {}}
    onTelegramSignIn={async () => {
      fixture.calls.fresh++;
      return { idToken: 'fresh-token', nonce: 'fresh-nonce', displayName: 'Новый вход', username: null };
    }} onCompleteRegistration={async () => {}} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
