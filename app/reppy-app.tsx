import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TRAINER_NAME,
  findAssignmentWorkout,
  findSessionWorkout,
  formatDay,
  type DemoState,
  type PaymentMethod,
  type Student,
} from './reppy-data';
import Icon, { iconAssetPaths } from './ui-icon';
import { useReppyData } from './use-reppy-data';
import { StudentExerciseProgress } from './exercise-progress-view';
import EmptyState from './empty-state';
import AppShell, { type AppTheme } from './app-shell';
import { AppStatusBanner, DataLoadError, useOnlineStatus } from './app-status';
import ModalFrame, { MODAL_LAYER_EVENT } from './modal-frame';
import { ActionButton, FormError } from './ui-controls';
import {
  recentSubscriptionPayments,
  subscriptionBalance,
  subscriptionEntriesFor,
} from './subscription-ledger';
import {
  cleanupOrphanedInstructionVideos,
  clearInstructionVideos,
} from './instruction-video-repository';
import { useReppyAuth, type TelegramConnection } from './reppy-auth';
import { AccountScreen, MissingProfileScreen, SupabaseInvitationScreen } from './auth-screens';
import { getSupabaseClient } from './supabase-client';
import { createSupabaseRepository } from './supabase-repository';
import {
  go,
  replaceInitialRoute,
  useHashNavigation,
  useRouteScrollRestoration,
} from './navigation';
import { DemoInvitationScreen, LoadingScreen, WelcomeScreen } from './onboarding-screens';
import WorkoutCalendar from './workout-calendar';
import NotFound from './not-found';
import PageHeader from './route-page-header';
import { moodLabel } from './mood';
import {
  assignmentScheduleLabel,
  assignmentSortValue,
} from './schedule-display';
import {
  lessonWord,
  subscriptionBalanceLabel,
  subscriptionTone,
} from './workout-display';
import {
  clearUiDraft,
  loadLastRoute,
  loadThemePreference,
  loadUiDraft,
  saveLastRoute,
  saveThemePreference,
  saveUiDraft,
} from './ui-persistence';

const StudentRoutes = lazy(() => import('./student-routes'));
const TrainerRoutes = lazy(() => import('./trainer-routes'));

function findStudent(data: DemoState, id: string) {
  return data.students.find((student) => student.id === id);
}

const APP_ASSETS = [
  'logo.png',
  'logo-full.png',
  'logo-wordmark.png',
  'favicon-32.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'good-sm.png',
  ...iconAssetPaths,
];

const ASSET_PRELOAD_TIMEOUT = 5500;

function formatRubles(amount = 0) {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
}

function paymentMethodLabel(method?: PaymentMethod) {
  return method === 'transfer' ? 'перевод' : 'наличные';
}

function formatSubscriptionDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function preloadAsset(path: string) {
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, ASSET_PRELOAD_TIMEOUT);
    const image = new Image();
    const done = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onload = done;
    image.onerror = done;
    image.decoding = 'async';
    image.src = new URL(path, document.baseURI).toString();
    if (image.complete) done();
  });
}

export default function ReppyApp() {
  const auth = useReppyAuth();
  const remoteRepository = useMemo(() => {
    const client = getSupabaseClient();
    return client && auth.profile ? createSupabaseRepository(client, auth.profile) : null;
  }, [auth.profile]);
  const { data, hydrated, persistencePhase, persistenceError, persistenceConflict, retryPersistence, reloadCurrentData, reset: resetData, createStudentInvitation, dispatch, setData } = useReppyData(remoteRepository);
  const online = useOnlineStatus();
  const path = useHashNavigation();
  const [assetsReady, setAssetsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalLayerOpen, setModalLayerOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<AppTheme>(loadThemePreference);
  const videoCleanupProfile = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || auth.profile?.role !== 'trainer') return;
    if (videoCleanupProfile.current === auth.profile.id) return;
    videoCleanupProfile.current = auth.profile.id;
    void cleanupOrphanedInstructionVideos().catch(() => {
      videoCleanupProfile.current = null;
    });
  }, [auth.profile, hydrated]);

  useEffect(() => {
    if (!auth.enabled || !hydrated) return;
    if (auth.status === 'authenticated' && auth.profile) {
      setData((current) => current.loggedIn && current.role === auth.profile!.role
        ? current
        : { ...current, loggedIn: true, role: auth.profile!.role });
    } else if (auth.status === 'anonymous') {
      setData((current) => current.loggedIn ? { ...current, loggedIn: false } : current);
    }
  }, [auth.enabled, auth.profile, auth.status, hydrated, setData]);

  useLayoutEffect(() => {
    const appliedTheme: AppTheme = data.loggedIn ? theme : 'dark';
    document.documentElement.dataset.theme = appliedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appliedTheme === 'light' ? '#f1f2eb' : '#070908');
  }, [data.loggedIn, theme]);

  useEffect(() => {
    let cancelled = false;
    const ready = Promise.all(APP_ASSETS.map(preloadAsset));
    const fallback = new Promise<void>((resolve) => window.setTimeout(resolve, ASSET_PRELOAD_TIMEOUT));
    void Promise.race([ready.then(() => undefined), fallback]).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleModalLayer = (event: Event) => setModalLayerOpen((event as CustomEvent<boolean>).detail);
    window.addEventListener(MODAL_LAYER_EVENT, handleModalLayer);
    return () => window.removeEventListener(MODAL_LAYER_EVENT, handleModalLayer);
  }, []);

  useEffect(() => {
    if (!hydrated || (path !== '/' && path !== '/auth/sign-in')) return;
    const activeRole = auth.enabled
      ? auth.status === 'authenticated' ? auth.profile?.role : undefined
      : data.loggedIn ? data.role : undefined;
    if (!activeRole) return;

    const identity = auth.enabled ? auth.profile?.id : 'demo';
    const restoredPath = identity ? loadLastRoute(activeRole, identity) : `/${activeRole}`;
    replaceInitialRoute(restoredPath);
  }, [auth.enabled, auth.profile, auth.status, data.loggedIn, data.role, hydrated, path]);

  useEffect(() => {
    if (!hydrated) return;
    const identity = auth.enabled ? auth.profile?.id : data.loggedIn ? 'demo' : undefined;
    if (!identity) return;
    saveLastRoute(path, identity);
  }, [auth.enabled, auth.profile?.id, data.loggedIn, hydrated, path]);

  useEffect(() => {
    if (!auth.enabled || auth.status !== 'authenticated' || !auth.profile || !hydrated) return;
    const wrongArea = auth.profile.role === 'student'
      ? path.startsWith('/trainer')
      : path.startsWith('/student');
    if (wrongArea) go(auth.profile.role === 'student' ? '/student' : '/trainer', true);
  }, [auth.enabled, auth.profile, auth.status, hydrated, path]);

  useRouteScrollRestoration(path, hydrated && assetsReady);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  const login = () => {
    setData((current) => ({ ...current, loggedIn: true, role: 'trainer' }));
    go('/trainer');
  };

  const switchRole = () => {
    const role = data.role === 'trainer' ? 'student' : 'trainer';
    setData((current) => ({ ...current, role, loggedIn: true }));
    go(role === 'trainer' ? '/trainer' : '/student');
  };

  const toggleTheme = () => setTheme((current) => {
    const next = current === 'dark' ? 'light' : 'dark';
    saveThemePreference(next);
    return next;
  });

  const resetDemo = () => {
    void clearInstructionVideos().catch(() => undefined);
    resetData();
    setSettingsOpen(false);
    go('/');
  };

  if (!hydrated && persistencePhase === 'error') return <DataLoadError onRetry={retryPersistence} />;

  if (!hydrated || !assetsReady || (auth.enabled && auth.status === 'loading')) {
    return <LoadingScreen progress message="Готовим тренировочный кабинет…" />;
  }

  const inviteMatch = path.match(/^\/invite\/([^/]+)(?:\/([^/]+))?$/);
  if (inviteMatch) {
    if (auth.enabled) {
      return (
        <SupabaseInvitationScreen
          key={decodeURIComponent(inviteMatch[1])}
          token={decodeURIComponent(inviteMatch[1])}
          signedIn={Boolean(auth.session)}
          profile={auth.profile}
          onPreview={auth.previewInvitation}
          onTelegramAccept={async (token) => {
            await auth.acceptStudentInvitationWithTelegram(token);
            go('/student', true);
          }}
          onResumeTelegram={async () => {
            const result = await auth.resumeTelegramRedirect();
            go('/student', true);
            return result;
          }}
          onAccept={async (token) => {
            await auth.acceptInvitation(token);
            go('/student', true);
          }}
          onHome={() => go('/', true)}
        />
      );
    }
    const token = decodeURIComponent(inviteMatch[1]);
    const inviteName = inviteMatch[2] ? decodeURIComponent(inviteMatch[2]) : '';
    const invitedStudent = findStudent(data, token)
      ?? (inviteName ? { id: token, name: inviteName, status: 'invited' as const, color: 'orange' as const } : undefined);
    return (
      <DemoInvitationScreen
        student={invitedStudent}
        onAccept={(acceptedStudent) => {
          const activeStudent: Student = { ...acceptedStudent, status: 'active' };
          setData((current) => ({
            ...current,
            loggedIn: true,
            role: 'student',
            activeStudentId: activeStudent.id,
            students: current.students.some((student) => student.id === activeStudent.id)
              ? current.students.map((student) => student.id === activeStudent.id ? { ...student, ...activeStudent } : student)
              : [...current.students, activeStudent],
          }));
          go('/student');
        }}
      />
    );
  }

  if (auth.enabled && path === '/auth/register-trainer') {
    return <AccountScreen
      key="unified-auth"
      initialError={auth.error}
      onTelegramSignIn={auth.signInWithTelegram}
      onCompleteRegistration={auth.finishTelegramTrainerRegistration}
      onResumeTelegram={auth.resumeTelegramRedirect}
      onHome={() => go('/', true)}
    />;
  }

  if (auth.enabled && auth.status === 'profile-missing') {
    return <MissingProfileScreen onSignOut={auth.signOut} />;
  }

  if (auth.enabled && auth.status === 'anonymous' && path === '/') {
    return <WelcomeScreen accountMode onLogin={() => go('/auth/sign-in')} />;
  }

  if (auth.enabled && auth.status !== 'authenticated') {
    return <AccountScreen
      key="unified-auth"
      initialError={auth.error}
      onTelegramSignIn={auth.signInWithTelegram}
      onCompleteRegistration={auth.finishTelegramTrainerRegistration}
      onResumeTelegram={auth.resumeTelegramRedirect}
      onHome={() => go('/', true)}
    />;
  }

  if (auth.enabled && (path === '/' || path === '/auth/sign-in')) {
    return <LoadingScreen progress message="Открываем твой кабинет…" />;
  }

  const authenticatedRouteMismatch = Boolean(auth.enabled && auth.profile && (
    (auth.profile.role === 'student' && path.startsWith('/trainer'))
    || (auth.profile.role === 'trainer' && path.startsWith('/student'))
  ));
  if (authenticatedRouteMismatch) {
    return <LoadingScreen progress message="Открываем твой кабинет…" />;
  }

  if (!data.loggedIn || path === '/') return <WelcomeScreen onLogin={login} />;

  let content: ReactNode;
  const area: 'trainer' | 'student' = auth.enabled && auth.profile
    ? auth.profile.role
    : path.startsWith('/student') ? 'student' : 'trainer';

  if (area === 'trainer') {
    content = <TrainerRoutes
      path={path}
      data={data}
      dispatch={dispatch}
      showToast={showToast}
      createStudentInvitation={createStudentInvitation}
      StudentProfileComponent={StudentProfile}
    />;

  } else if (path === '/student/calendar') {
    content = <WorkoutCalendar data={data} area="student" />;
  } else if (path === '/student/profile') {
    content = <StudentProfile data={data} studentId={data.activeStudentId} onUpdate={(updated) => {
      dispatch({ type: 'student.update', student: updated });
      showToast('Профиль сохранён');
    }} />;
  } else {
    content = <StudentRoutes path={path} data={data} dispatch={dispatch} showToast={showToast} />;
  }

  return (
    <>
      <AppShell
        area={area}
        path={path}
        displayName={auth.profile?.displayName ?? (area === 'trainer' ? TRAINER_NAME : findStudent(data, data.activeStudentId)?.name ?? 'Ученик')}
        hideBottomNav={settingsOpen || modalLayerOpen}
        onNavigate={go}
        onSwitchRole={auth.enabled ? undefined : switchRole}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSettings={() => setSettingsOpen(true)}
        systemStatus={<AppStatusBanner phase={persistencePhase} error={persistenceError} conflict={persistenceConflict} online={online} remote={auth.enabled} onRetry={retryPersistence} onReload={reloadCurrentData} />}
      >
        <Suspense fallback={<LoadingScreen message="Загружаем экран…" />}>{content}</Suspense>
        {toast && <div className="toast" role="status"><Icon name="check" /> {toast}</div>}
      </AppShell>
      {settingsOpen && <SettingsModal
        accountMode={auth.enabled}
        account={auth.profile ? {
          displayName: auth.profile.displayName,
          role: auth.profile.role,
          email: auth.session?.user.email?.endsWith('@users.reppy.invalid') ? '' : auth.session?.user.email ?? '',
        } : undefined}
        onClose={() => setSettingsOpen(false)}
        onReset={resetDemo}
        onSignOut={auth.enabled ? async () => {
          await auth.signOut();
          setSettingsOpen(false);
          go('/', true);
        } : undefined}
        onOpenDesignKit={!auth.enabled || auth.profile?.role === 'trainer' ? () => {
          setSettingsOpen(false);
          go('/trainer/design-kit');
        } : undefined}
        onConnectTelegram={auth.enabled ? async () => {
          const link = await auth.createTelegramLink();
          window.location.assign(link);
        } : undefined}
        onLoadTelegramConnection={auth.enabled ? auth.getTelegramConnection : undefined}
      />}
    </>
  );
}


function StudentProfile({ data, studentId, onUpdate, trainerView = false }: { data: DemoState; studentId: string; onUpdate: (student: Student) => void; trainerView?: boolean }) {
  const student = findStudent(data, studentId);
  if (!student) return <NotFound />;
  const assignments = data.assignments
    .filter((item) => item.studentId === studentId && item.status === 'assigned')
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const sessions = [...data.sessions].filter((item) => item.studentId === studentId && item.completedAt).reverse();
  return (
    <main className="content-page">
      {trainerView && <div className="student-profile-intro"><PageHeader back="/trainer/clients" semanticBack title={student.name.toUpperCase()} /><AthleteDetails student={student} onSave={onUpdate} compact /></div>}
      <SubscriptionCard data={data} student={student} trainerView={trainerView} />
      {trainerView && <section className="profile-schedule">
        <div className="section-heading"><h2>Предстоящие тренировки</h2></div>
        {trainerView && <button className="list-primary-action" type="button" onClick={() => go(`/trainer/clients/${student.id}/assign`)}><Icon name="plus" /> Назначить тренировку</button>}
        {assignments.length ? <div className="connected-list">{assignments.map((assignment) => {
          const workout = findAssignmentWorkout(data, assignment);
          return (
            <button className="workout-row" key={assignment.id} type="button" onClick={() => workout && go(trainerView ? `/trainer/assignments/${assignment.id}` : `/student/assignments/${assignment.id}`)}>
              <span><strong>{workout?.name}</strong><small>{assignmentScheduleLabel(assignment)}</small></span><i><Icon name="chevron-right" /></i>
            </button>
          );
        })}</div> : trainerView
          ? <EmptyState icon="calendar" title="Пока пусто" text="Назначь тренировку прямо из профиля ученика и подстрой план под него." />
          : <EmptyState icon="calendar" title="Пока пусто" text="Тренер ещё не добавил ближайшие занятия." />}
      </section>}

      {trainerView && <section className="section-block">
        <div className="section-heading"><h2>Последняя активность</h2></div>
        {sessions.length ? <div className="connected-list">{sessions.slice(0, 3).map((session) => (
          <button className="session-row" key={session.id} type="button" onClick={() => go(`/trainer/sessions/${session.id}`)}>
            <span className="done-badge"><Icon name="check" /></span><span><strong>{findSessionWorkout(data, session)?.name}</strong><small>{formatDay(session.completedAt)}{session.mood ? ` · ${moodLabel(session.mood)}` : ''}</small></span><i><Icon name="chevron-right" /></i>
          </button>
        ))}</div> : <EmptyState icon="circle" title="Ещё нет результатов" text="Завершённые тренировки ученика появятся в этом блоке." />}
      </section>}

      {!trainerView && <AthleteDetails student={student} onSave={onUpdate} alwaysExpanded />}
      {trainerView && <StudentExerciseProgress data={data} studentId={studentId} go={go} />}
    </main>
  );
}

function SubscriptionCard({ data, student, trainerView }: { data: DemoState; student: Student; trainerView: boolean }) {
  const entries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
  const payments = recentSubscriptionPayments(data.subscriptionEntries, student.id, trainerView ? 1 : 3);
  const balance = subscriptionBalance(data.subscriptionEntries, student.id);
  const hasEntries = entries.length > 0;
  return (
    <section className={`subscription-card ${subscriptionTone(balance, hasEntries)}`} aria-label="Абонемент">
      <header><span>АБОНЕМЕНТ</span><small>Без срока действия</small></header>
      <div className="subscription-balance">
        <strong>{subscriptionBalanceLabel(balance, hasEntries)}</strong>
        {balance <= 0 && hasEntries && <p>{balance < 0 ? 'Новые занятия будут добавляться к долгу.' : 'Следующую тренировку можно провести в долг.'}</p>}
        {!hasEntries && <p>{trainerView ? 'Добавь первое пополнение, чтобы начать учёт занятий.' : 'Тренер ещё не добавил пополнение.'}</p>}
      </div>
      {payments.length > 0 && <div className="recent-payments" aria-label="Последние пополнения">
        <span>{trainerView ? 'ПОСЛЕДНЕЕ ПОПОЛНЕНИЕ' : 'ПОСЛЕДНИЕ ПОПОЛНЕНИЯ'}</span>
        {payments.map((payment) => (
          <div key={payment.id}>
            <strong>+{payment.lessonDelta} {lessonWord(payment.lessonDelta)}</strong>
            <small>{formatRubles(payment.amountRub)} · {paymentMethodLabel(payment.paymentMethod)} · {formatSubscriptionDate(payment.occurredAt)}</small>
          </div>
        ))}
      </div>}
      {trainerView && <div className="subscription-actions">
        <ActionButton icon="plus" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>{payments.length ? 'Продлить' : 'Добавить абонемент'}</ActionButton>
        <ActionButton variant="secondary" icon="history" onClick={() => go(`/trainer/clients/${student.id}/subscription`)}>История</ActionButton>
      </div>}
    </section>
  );
}

function AthleteDetails({ student, onSave, alwaysExpanded = false, compact = false }: { student: Student; onSave: (student: Student) => void; alwaysExpanded?: boolean; compact?: boolean }) {
  const draftKey = `athlete:${student.id}:${compact ? 'compact' : 'full'}`;
  const [restoredDraft] = useState(() => loadUiDraft<{
    expanded: boolean;
    editing: boolean;
    height: string;
    weight: string;
    gender: Student['gender'];
    phone: string;
    contraindications: string;
  }>(draftKey));
  const [expanded, setExpanded] = useState(restoredDraft?.expanded ?? alwaysExpanded);
  const [editing, setEditing] = useState(restoredDraft?.editing ?? false);
  const [height, setHeight] = useState(restoredDraft?.height ?? (student.height ? String(student.height) : ''));
  const [weight, setWeight] = useState(restoredDraft?.weight ?? (student.weight ? String(student.weight) : ''));
  const [gender, setGender] = useState<Student['gender']>(restoredDraft?.gender ?? student.gender ?? 'not-specified');
  const [phone, setPhone] = useState(restoredDraft?.phone ?? student.phone ?? '');
  const [contraindications, setContraindications] = useState(restoredDraft?.contraindications ?? student.contraindications ?? '');
  const genderLabel = gender === 'male' ? 'Мужской' : gender === 'female' ? 'Женский' : 'Не указан';

  useEffect(() => {
    if (!editing) {
      clearUiDraft(draftKey);
      return;
    }
    saveUiDraft(draftKey, { expanded, editing, height, weight, gender, phone, contraindications });
  }, [contraindications, draftKey, editing, expanded, gender, height, phone, weight]);

  const save = () => {
    const parsedHeight = Number(height);
    const parsedWeight = Number(weight.replace(',', '.'));
    onSave({
      ...student,
      height: height.trim() && Number.isFinite(parsedHeight) ? Math.max(0, parsedHeight) : undefined,
      weight: weight.trim() && Number.isFinite(parsedWeight) ? Math.max(0, parsedWeight) : undefined,
      gender,
      phone: phone.trim(),
      contraindications: contraindications.trim(),
    });
    clearUiDraft(draftKey);
    setEditing(false);
  };

  return (
    <section className={`athlete-details section-block ${compact ? 'athlete-details-compact' : ''} ${alwaysExpanded ? 'always-expanded' : ''}`}>
      {compact ? <div className="athlete-inline-summary"><div><p>{[student.height ? `${student.height} см` : '', student.weight ? `${student.weight} кг` : '', student.gender && student.gender !== 'not-specified' ? genderLabel : '', student.phone].filter(Boolean).join(' · ') || 'Данные ученика не заполнены'}</p><p>Ограничения: {student.contraindications || 'не указаны'}</p></div><button type="button" className="wide-secondary athlete-edit-icon" aria-label="Редактировать данные ученика" title="Редактировать данные" aria-expanded={editing} onClick={() => { if (editing) { clearUiDraft(draftKey); setEditing(false); return; } setHeight(student.height ? String(student.height) : ''); setWeight(student.weight ? String(student.weight) : ''); setGender(student.gender ?? 'not-specified'); setPhone(student.phone ?? ''); setContraindications(student.contraindications ?? ''); setEditing(true); }}><Icon name="edit" /></button></div> : <div className="section-heading"><h2>Данные и ограничения</h2>{alwaysExpanded && !editing ? <button type="button" className="athlete-heading-edit" onClick={() => setEditing(true)}><Icon name="edit" /> Редактировать</button> : !alwaysExpanded && <button type="button" aria-expanded={expanded} onClick={() => { setExpanded((current) => !current); if (editing) clearUiDraft(draftKey); setEditing(false); }}>{expanded ? 'Скрыть' : 'Показать'}</button>}</div>}
      {(compact ? editing : expanded) && (editing ? <div className="athlete-form">
        <div className="athlete-form-grid">
          <label><span>Рост, см</span><input type="number" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="182" /></label>
          <label><span>Вес, кг</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="86" /></label>
        </div>
        <label><span>Пол</span><select value={gender} onChange={(event) => setGender(event.target.value as Student['gender'])}><option value="not-specified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
        <label><span>Мобильный телефон</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" /></label>
        <label><span>Противопоказания и особенности</span><textarea value={contraindications} onChange={(event) => setContraindications(event.target.value)} maxLength={800} placeholder="Например: протрузия поясничного отдела, грыжа, болит левое запястье…" /><small>Опиши всё, что тренеру важно учитывать при составлении плана.</small></label>
        <ActionButton icon="check" onClick={save}>Сохранить данные</ActionButton>
        {compact && <ActionButton variant="secondary" onClick={() => { clearUiDraft(draftKey); setEditing(false); }}>Отмена</ActionButton>}
      </div> : <>{!alwaysExpanded && <button className="details-edit-button" type="button" onClick={() => setEditing(true)}><Icon name="edit" /> Редактировать данные</button>}<dl className="athlete-summary">
        <div><dt>Рост</dt><dd>{student.height ? `${student.height} см` : 'Не указан'}</dd></div>
        <div><dt>Вес</dt><dd>{student.weight ? `${student.weight} кг` : 'Не указан'}</dd></div>
        <div><dt>Пол</dt><dd>{genderLabel}</dd></div>
        <div><dt>Телефон</dt><dd>{student.phone || 'Не указан'}</dd></div>
        <div className="athlete-summary-wide"><dt>Противопоказания и особенности</dt><dd>{student.contraindications || 'Не указаны'}</dd></div>
      </dl></>)}
    </section>
  );
}

function SettingsModal({ accountMode = false, account, onClose, onReset, onSignOut, onOpenDesignKit, onConnectTelegram, onLoadTelegramConnection }: { accountMode?: boolean; account?: { displayName: string; role: 'trainer' | 'student'; email: string }; onClose: () => void; onReset: () => void; onSignOut?: () => Promise<void>; onOpenDesignKit?: () => void; onConnectTelegram?: () => Promise<void>; onLoadTelegramConnection?: () => Promise<TelegramConnection> }) {
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [telegramConnection, setTelegramConnection] = useState<TelegramConnection | null>(null);
  const [telegramStatusLoading, setTelegramStatusLoading] = useState(Boolean(onLoadTelegramConnection));

  useEffect(() => {
    if (!onLoadTelegramConnection) return;
    let active = true;
    void onLoadTelegramConnection()
      .then((connection) => {
        if (active) setTelegramConnection(connection);
      })
      .catch((error) => {
        if (active) setTelegramError(error instanceof Error ? error.message : 'Не удалось проверить подключение Telegram.');
      })
      .finally(() => {
        if (active) setTelegramStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onLoadTelegramConnection]);

  const connectTelegram = async () => {
    if (!onConnectTelegram) return;
    setTelegramBusy(true);
    setTelegramError('');
    try {
      await onConnectTelegram();
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : 'Не удалось создать ссылку Telegram.');
    } finally {
      setTelegramBusy(false);
    }
  };

  return (
    <ModalFrame title={resetConfirmationOpen ? 'Сбросить локальные данные?' : accountMode ? 'Настройки аккаунта' : 'Настройки демо'} eyebrow="REPPY V0" className="settings-modal" surface="center" ariaLabel={accountMode ? 'Настройки аккаунта' : 'Настройки демо'} onClose={onClose}>
      {resetConfirmationOpen ? <p>Все локальные изменения в учениках, тренировках и расписании будут удалены.</p> : accountMode && account ? <section className="account-details" aria-label="Данные аккаунта"><span className="account-avatar">{account.displayName.trim().charAt(0).toUpperCase()}</span><div><strong>{account.displayName}</strong><small>{account.role === 'trainer' ? 'Тренер' : 'Ученик'}</small>{account.email && <span>{account.email}</span>}</div></section> : !accountMode ? <p>Сброс вернёт исходных учеников, тренировки и расписание.</p> : null}
      {resetConfirmationOpen ? <div className="confirmation-actions"><ActionButton variant="secondary" autoFocus onClick={() => setResetConfirmationOpen(false)}>Остаться</ActionButton><ActionButton variant="danger" onClick={onReset}>Сбросить данные</ActionButton></div> : <div className="settings-actions">{accountMode && onConnectTelegram && (telegramConnection?.connected ? <div className="telegram-connection-status"><Icon name="check" /><span><strong>Telegram подключён</strong><small>{telegramConnection.username ? `@${telegramConnection.username}` : telegramConnection.firstName}</small></span></div> : <ActionButton variant="secondary" icon="arrow-up-right" disabled={telegramBusy || telegramStatusLoading} onClick={() => void connectTelegram()}>{telegramStatusLoading ? 'Проверяем Telegram…' : telegramBusy ? 'Создаём ссылку…' : 'Подключить Telegram'}</ActionButton>)}{telegramError && <FormError>{telegramError}</FormError>}{onOpenDesignKit && <ActionButton variant="secondary" icon="workout" onClick={onOpenDesignKit}>Открыть дизайн-кит</ActionButton>}{accountMode && onSignOut ? <ActionButton variant="danger" onClick={() => void onSignOut()}>Выйти из аккаунта</ActionButton> : <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}><Icon name="trash" /> Сбросить демо-данные</button>}</div>}
    </ModalFrame>
  );
}
