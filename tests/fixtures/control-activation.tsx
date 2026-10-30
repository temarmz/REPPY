import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountScreen } from '../../app/auth-screens';
import { ActionButton, TextField } from '../../app/ui/controls';
import { Box, Form, Page, PageTitle, Section } from '../../app/ui/elements';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const state = { events: [] as string[], submitted: 0, reset: 0, submitter: '', created: [] as string[], cancel: false,
  holdRegistration: false, releaseRegistration: (): void => { throw new Error('No registration is held'); } };
declare global { interface Window { controlActivationQa: typeof state } }
window.controlActivationQa = state;

function Harness() {
  const [created, setCreated] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (params.get('mode') === 'account') return created
    ? <Page><PageTitle>Кабинет создан</PageTitle></Page>
    : <AccountScreen onHome={() => {}} onResumeTelegram={async () => null}
      onTelegramSignIn={async () => ({ idToken: 'isolated-token', nonce: 'isolated-nonce', displayName: 'Тестовый тренер', username: null })}
      onCompleteRegistration={async (_pending, name) => {
        state.created.push(name);
        if (state.holdRegistration) await new Promise<void>(resolve => { state.releaseRegistration = resolve; });
        setCreated(true);
      }} />;
  return <Box className="app-shell"><Page className="content-page narrow-page">
    <PageTitle>Контролы</PageTitle>
    {params.get('mode') === 'replacement' ? <ActionButton onClick={() => {
      state.events.push(confirm ? 'confirm' : 'open');
      setConfirm(true);
    }}>{confirm ? 'Подтвердить' : 'Открыть'}</ActionButton> : <Section className="form-card"><Form onSubmit={event => {
      event.preventDefault();
      state.submitted++;
      state.submitter = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? '';
    }} onReset={() => { state.reset++; }}>
      <TextField id="native-name" label="Имя" defaultValue="" required />
      <Box onClickCapture={event => state.events.push(`capture:${event.type}`)} onClick={event => state.events.push(`bubble:${event.type}`)}>
        <ActionButton type="submit" name="intent" value="save" onClick={event => {
          state.events.push(`target:${event.type}`);
          if (state.cancel) event.preventDefault();
        }}>Сохранить</ActionButton>
      </Box>
      <ActionButton type="reset" variant="secondary">Сбросить</ActionButton>
    </Form></Section>}
  </Page></Box>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
