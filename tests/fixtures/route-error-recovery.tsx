import { lazy, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialState, type DemoState } from '../../app/reppy-data';
import { applyReppyCommand } from '../../app/reppy-commands';
import type { ReppyRepository } from '../../app/reppy-repository';
import { useReppyData } from '../../app/use-reppy-data';
import { go, goToMenuTab, useHashNavigation } from '../../app/navigation';
import RetainedRouteViews from '../../app/retained-route-views';
import AppShell from '../../app/ui/app-shell';
import { AppErrorBoundary, AppStatusBanner } from '../../app/ui/app-status';
import { ActionButton, TextField } from '../../app/ui/controls';
import { Page, Section } from '../../app/ui/elements';

export type RecoveryFixture = {
  controller: ReturnType<typeof useReppyData> | null;
  calls: string[];
  confirmedPhone: string | undefined;
  mounts: number;
  unmounts: number;
  release: () => void;
};
declare global { interface Window { routeRecoveryQa: RecoveryFixture } }

const initial: DemoState = { ...createInitialState(), role: 'student', loggedIn: true };
let confirmed = initial;
let release: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
const fixture: RecoveryFixture = { controller: null, calls: [], confirmedPhone: undefined, mounts: 0, unmounts: 0, release: () => release() };
window.routeRecoveryQa = fixture;
const repository: ReppyRepository = {
  async load() { return structuredClone(confirmed); },
  async execute(command) {
    if (command.type !== 'student.update') throw new Error('Unexpected command');
    fixture.calls.push(command.student.phone!);
    if (fixture.calls.length === 1) await held;
    confirmed = applyReppyCommand(confirmed, command);
    fixture.confirmedPhone = confirmed.students[0].phone;
  },
  async save() { throw new Error('Remote commands must not save demo state'); },
  async clear() {},
};
const FailedScreen = lazy(() => Promise.reject(new Error('Isolated lazy screen request failed')));

function ProfileDraft({ onSave }: { onSave: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  return <Page className="content-page narrow-page"><Section className="form-card">
    <TextField id="qa-phone" label="Телефон для проверки" value={phone} onChange={event => setPhone(event.target.value)} />
    <ActionButton icon="check" onClick={() => onSave(phone)}>Сохранить для проверки</ActionButton>
  </Section></Page>;
}

function Harness() {
  const controller = useReppyData(repository);
  const path = useHashNavigation();
  const [theme] = useState<'dark' | 'light'>(() => localStorage.getItem('reppy-ui:theme') === 'light' ? 'light' : 'dark');
  useLayoutEffect(() => { fixture.controller = controller; document.documentElement.dataset.theme = theme; });
  useEffect(() => { fixture.mounts++; return () => { fixture.unmounts++; }; }, []);
  if (!controller.hydrated) return null;
  return <AppShell area="student" path={path} displayName="Изолированный ученик" hideBottomNav={false}
    onNavigate={go} onNavigateTab={goToMenuTab}
    systemStatus={<AppStatusBanner phase={controller.persistencePhase} online remote onRetry={controller.retryPersistence} />}>
    <RetainedRouteViews path={path} renderRoute={route => route === '/student/calendar' ? <FailedScreen /> : <ProfileDraft onSave={phone => {
      const student = controller.data.students[0];
      controller.dispatch({ type: 'student.update', student: { ...student, phone: '+7 111 111-11-11' } });
      controller.dispatch({ type: 'student.update', student: { ...student, phone } });
    }} />} />
  </AppShell>;
}

createRoot(document.getElementById('root')!).render(<AppErrorBoundary><Harness /></AppErrorBoundary>);
