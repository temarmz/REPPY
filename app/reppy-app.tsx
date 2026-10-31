import { InitialsAvatar } from './ui/avatar';
import { ListRow } from './ui/patterns';
import { SectionHeading, Field } from './ui/patterns';
import { Box, Page, Section, Inline, Strong, Small, Italic, Header, Paragraph, SelectOption, DefinitionList, DefinitionTerm, DefinitionValue } from './ui/elements';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  TRAINER_NAME,
  findAssignmentWorkout,
  findSessionWorkout,
  formatDay,
  type DemoState,
  type PaymentMethod,
  type Student,
} from './reppy-data';
import Icon, { iconAssetPaths } from './ui/icon';
import { useReppyData } from './use-reppy-data';
import { StudentExerciseProgress } from './exercise-progress-view';
import EmptyState from './ui/empty-state';
import ConfirmationModal from './ui/confirmation-modal';
import AppShell, { type AppTheme } from './ui/app-shell';
import RetainedRouteViews from './retained-route-views';
import StudentRoutes from './student-routes';
import TrainerRoutes from './trainer-routes';
import { AppErrorBoundary, AppErrorScreen, AppStatusBanner, DataLoadError, PersistencePhaseContext, useOnlineStatus } from './ui/app-status';
import { downloadPersistenceDiagnostics } from './persistence-diagnostics';
import ModalFrame, { MODAL_LAYER_EVENT, reconcileModalLayerState } from './ui/modal-frame';
import { ActionButton, FormError, Button, Input, Select, Textarea, SegmentedControl } from './ui/controls';
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
import { createLocalTrainerNotes, createSupabaseTrainerNotes } from './trainer-notes';
import { createTrainerNotesController } from './trainer-notes-controller';
import TrainerNotesScreen from './trainer-notes-screen';
import {
  go,
  goToMenuTab,
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
const notesStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};

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
  const profileId = auth.profile?.id;
  const profileRole = auth.profile?.role;
  const remoteRepository = useMemo(() => {
    const client = getSupabaseClient();
    return client && profileId && profileRole ? createSupabaseRepository(client, { id: profileId, role: profileRole }) : null;
  }, [profileId, profileRole]);
  const { data, hydrated, persistencePhase, persistenceError, persistenceConflict, retryPersistence, reloadCurrentData, reset: resetData, createStudentInvitation, dispatch, setData } = useReppyData(remoteRepository);
  const notesIdentity = profileId ?? (data.role === 'student' ? `demo:student:${data.activeStudentId}` : 'demo');
  const notesController = useMemo(() => {
    const client = getSupabaseClient();
    const repository = client && profileId
      ? createSupabaseTrainerNotes(client, profileId)
      : createLocalTrainerNotes(notesStorage, notesIdentity === 'demo' ? 'reppy-trainer-notes-demo-v1' : `reppy-notes:${notesIdentity}`);
    return createTrainerNotesController(repository, notesStorage, notesIdentity);
  }, [profileId, notesIdentity]);
  useEffect(() => notesController.start(), [auth.enabled, notesController, profileRole]);
  const online = useOnlineStatus();
  const path = useHashNavigation();
  const [assetsReady, setAssetsReady] = useState(false);
  const [shellFailed, setShellFailed] = useState(false);
  const [shellRecoveryKey, setShellRecoveryKey] = useState(0);
  const [modalLayerOpen, setModalLayerOpen] = useState(false);
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
    const reconcileModalLayer = () => { setModalLayerOpen(reconcileModalLayerState()); };
    window.addEventListener(MODAL_LAYER_EVENT, handleModalLayer);
    window.addEventListener('pageshow', reconcileModalLayer);
    window.addEventListener('hashchange', reconcileModalLayer);
    document.addEventListener('visibilitychange', reconcileModalLayer);
    reconcileModalLayer();
    return () => {
      window.removeEventListener(MODAL_LAYER_EVENT, handleModalLayer);
      window.removeEventListener('pageshow', reconcileModalLayer);
      window.removeEventListener('hashchange', reconcileModalLayer);
      document.removeEventListener('visibilitychange', reconcileModalLayer);
    };
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
    if (!hydrated) return;
    // Keep old bookmarks and the last saved route working after removing the
    // separate history tab. Results now belong to the calendar.
    if (path === '/student/history') replaceInitialRoute('/student/calendar');
    const legacySession = path.match(/^\/student\/history\/([^/]+)$/);
    if (legacySession) {
      const session = data.sessions.find((item) => item.id === legacySession[1]);
      const assignment = data.assignments.find((item) => item.id === session?.assignmentId);
      if (assignment) {
        try { window.sessionStorage.setItem('reppy-ui:calendar-day:student', assignment.scheduledFor); } catch { /* best effort */ }
      }
      replaceInitialRoute(`/student/calendar/sessions/${legacySession[1]}`);
    }
  }, [data.assignments, data.sessions, hydrated, path]);

  useEffect(() => {
    if (!auth.enabled || auth.status !== 'authenticated' || !auth.profile || !hydrated) return;
    const wrongArea = auth.profile.role === 'student'
      ? path.startsWith('/trainer')
      : path.startsWith('/student');
    if (wrongArea) go(auth.profile.role === 'student' ? '/student' : '/trainer', true);
  }, [auth.enabled, auth.profile, auth.status, hydrated, path]);

  useRouteScrollRestoration(path, hydrated && assetsReady && data.loggedIn && (!auth.enabled || auth.status === 'authenticated'), auth.profile?.id ?? `demo:${data.activeStudentId}`);
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
    notesController.resetDemo();
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

  const area: 'trainer' | 'student' = auth.enabled && auth.profile
    ? auth.profile.role
    : path.startsWith('/student') ? 'student' : 'trainer';

  const renderRoute = (route: string) => {
    const profileStudent = area === 'student' ? findStudent(data, data.activeStudentId) : undefined;
    const accountSettings = <ProfileSettings
      details={profileStudent ? <AthleteDetails student={profileStudent} onSave={(student) => dispatch({ type: 'student.update', student })} alwaysExpanded /> : undefined}
      summary={profileStudent ? <SubscriptionCard data={data} student={profileStudent} trainerView={false} /> : undefined}
      accountMode={auth.enabled}
      account={auth.profile ? {
        displayName: auth.profile.displayName,
        role: auth.profile.role,
        email: auth.session?.user.email?.endsWith('@users.reppy.invalid') ? '' : auth.session?.user.email ?? '',
      } : { displayName: area === 'trainer' ? TRAINER_NAME : findStudent(data, data.activeStudentId)?.name ?? 'Ученик', role: area, email: '' }}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSwitchRole={auth.enabled ? undefined : switchRole}
      onReset={resetDemo}
      onSignOut={auth.enabled ? async () => { await auth.signOut(); go('/', true); } : undefined}
      onOpenDesignKit={area === 'trainer' ? () => go('/trainer/design-kit') : undefined}
      onConnectTelegram={auth.enabled ? async () => { const link = await auth.createTelegramLink(); window.location.assign(link); } : undefined}
      onLoadTelegramConnection={auth.enabled ? auth.getTelegramConnection : undefined}
    />;
    if (route === `/${area}/notes`) return <TrainerNotesScreen controller={notesController} identity={notesIdentity} />;
    if (area === 'trainer') {
      if (route === '/trainer/notes') return <TrainerNotesScreen controller={notesController} identity={profileId ?? 'demo'} />;
      if (route === '/trainer/profile') return <TrainerProfileTabs data={data} settings={accountSettings} />;
      return <TrainerRoutes
        path={route}
        data={data}
        draftIdentity={auth.profile?.id ?? 'demo'}
        dispatch={dispatch}
        createStudentInvitation={createStudentInvitation}
        StudentProfileComponent={StudentProfile}
      />;
    } else if (route === '/student/calendar') {
      return <WorkoutCalendar data={data} area="student" />;
    } else if (route === '/student/profile') {
      return <StudentProfile data={data} studentId={data.activeStudentId} onUpdate={(updated) => {
        dispatch({ type: 'student.update', student: updated });
      }} settings={accountSettings} />;
    } else {
      return <StudentRoutes path={route} data={data} dispatch={dispatch} />;
    }
  };

  return (
    <>
      <AppErrorBoundary key={shellRecoveryKey} hideFallback onFailure={() => setShellFailed(true)}>
      <AppShell
        key={`${auth.profile?.id ?? 'demo'}:${area}:${area === 'student' ? data.activeStudentId : ''}`}
        area={area}
        path={path}
        displayName={auth.profile?.displayName ?? (area === 'trainer' ? TRAINER_NAME : findStudent(data, data.activeStudentId)?.name ?? 'Ученик')}
        hideBottomNav={modalLayerOpen}
        onNavigate={go}
        onNavigateTab={goToMenuTab}
        systemStatus={<AppStatusBanner phase={persistencePhase} error={persistenceError} conflict={persistenceConflict} online={online} remote={auth.enabled} onRetry={retryPersistence} onReload={reloadCurrentData} hideSaving />}
      >
        <PersistencePhaseContext value={persistencePhase}>
          <RetainedRouteViews path={path} renderRoute={renderRoute} />
        </PersistencePhaseContext>
      </AppShell>
      </AppErrorBoundary>
      {shellFailed && <AppErrorScreen onRecover={() => {
        go(area === 'student' ? '/student' : '/trainer');
        setShellRecoveryKey((current) => current + 1);
        setShellFailed(false);
      }} />}
    </>
  );
}


function TrainerProfileTabs({ data, settings }: { data: DemoState; settings: ReactNode }) {
  const [tab, setTab] = useState('data');
  return <Page className="content-page"><PageHeader title="ПРОФИЛЬ" />
    <SegmentedControl label="Раздел профиля" value={tab} onChange={setTab} options={[{ value: 'data', label: 'Данные' }, { value: 'progress', label: 'Прогресс' }]} />
    <Box hidden={tab !== 'data'}>{settings}</Box>
    {tab === 'progress' && (data.students.length ? data.students.map((student) => <Section key={student.id} className="section-block"><SectionHeading title={student.name} /><StudentExerciseProgress data={data} studentId={student.id} go={go} area="trainer" /></Section>) : <EmptyState icon="users" title="Пока нет учеников" text="Прогресс появится после завершённых тренировок учеников." />)}
  </Page>;
}

function StudentProfile({ data, studentId, onUpdate, trainerView = false, settings }: { data: DemoState; studentId: string; onUpdate: (student: Student) => void; trainerView?: boolean; settings?: ReactNode }) {
  const [profileTab, setProfileTab] = useState('data');
  const student = findStudent(data, studentId);
  if (!student) return <NotFound />;
  const assignments = data.assignments
    .filter((item) => item.studentId === studentId && item.status === 'assigned')
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const sessions = [...data.sessions].filter((item) => item.studentId === studentId && item.completedAt).reverse();
  return (
    <Page className="content-page">
      {trainerView && <Box className="student-profile-intro"><PageHeader back="/trainer/clients" semanticBack title={student.name.toUpperCase()} /><AthleteDetails student={student} onSave={onUpdate} compact /></Box>}
      <SegmentedControl label="Раздел профиля" value={profileTab} onChange={setProfileTab} options={[{ value: 'data', label: 'Данные' }, { value: 'progress', label: 'Прогресс' }]} />
      <Box hidden={profileTab !== 'data'}>
      {trainerView || !settings ? <SubscriptionCard data={data} student={student} trainerView={trainerView} /> : null}
      {trainerView && <Section className="profile-schedule">
        <SectionHeading title="Предстоящие тренировки" />
        {trainerView && <Button className="list-primary-action" type="button" onClick={() => go(`/trainer/clients/${student.id}/assign`)}><Icon name="plus" /> Назначить тренировку</Button>}
        {assignments.length ? <Box className="connected-list">{assignments.map((assignment) => {
          const workout = findAssignmentWorkout(data, assignment);
          return (
            <ListRow className="workout-row" key={assignment.id} type="button" onClick={() => workout && go(trainerView ? `/trainer/assignments/${assignment.id}` : `/student/assignments/${assignment.id}`)}>
              <Inline><Strong>{workout?.name}</Strong><Small>{assignmentScheduleLabel(assignment)}</Small></Inline><Italic><Icon name="chevron-right" /></Italic>
            </ListRow>
          );
        })}</Box> : trainerView
          ? <EmptyState icon="calendar" title="Пока пусто" text="Назначь тренировку прямо из профиля ученика и подстрой план под него." />
          : <EmptyState icon="calendar" title="Пока пусто" text="Тренер ещё не добавил ближайшие занятия." />}
      </Section>}

      {trainerView && <Section className="section-block">
        <SectionHeading title="Последняя активность" />
        {sessions.length ? <Box className="connected-list">{sessions.slice(0, 3).map((session) => (
          <ListRow className="session-row" key={session.id} type="button" onClick={() => go(`/trainer/sessions/${session.id}`)}>
            <Inline className="done-badge"><Icon name="check" /></Inline><Inline><Strong>{findSessionWorkout(data, session)?.name}</Strong><Small>{formatDay(session.completedAt)}{session.mood ? ` · ${moodLabel(session.mood)}` : ''}</Small></Inline><Italic><Icon name="chevron-right" /></Italic>
          </ListRow>
        ))}</Box> : <EmptyState icon="circle" title="Ещё нет результатов" text="Завершённые тренировки ученика появятся в этом блоке." />}
      </Section>}

      {!trainerView && !settings && <AthleteDetails student={student} onSave={onUpdate} alwaysExpanded />}
      {settings}
      </Box>
      {profileTab === 'progress' && <StudentExerciseProgress data={data} studentId={studentId} go={go} area={trainerView ? 'trainer' : 'student'} />}

    </Page>
  );
}

function SubscriptionCard({ data, student, trainerView }: { data: DemoState; student: Student; trainerView: boolean }) {
  const entries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
  const payments = recentSubscriptionPayments(data.subscriptionEntries, student.id, trainerView ? 1 : 3);
  const balance = subscriptionBalance(data.subscriptionEntries, student.id);
  const hasEntries = entries.length > 0;
  return (
    <Section className={`subscription-card ${subscriptionTone(balance, hasEntries)}`} aria-label="Абонемент">
      <Header><Inline>АБОНЕМЕНТ</Inline><Small>Без срока действия</Small></Header>
      <Box className="subscription-balance">
        <Strong>{subscriptionBalanceLabel(balance, hasEntries)}</Strong>
        {balance <= 0 && hasEntries && <Paragraph>{balance < 0 ? 'Новые занятия будут добавляться к долгу.' : 'Следующую тренировку можно провести в долг.'}</Paragraph>}
        {!hasEntries && <Paragraph>{trainerView ? 'Добавь первое пополнение, чтобы начать учёт занятий.' : 'Тренер ещё не добавил пополнение.'}</Paragraph>}
      </Box>
      {payments.length > 0 && <Box className="recent-payments" aria-label="Последние пополнения">
        <Inline>{trainerView ? 'ПОСЛЕДНЕЕ ПОПОЛНЕНИЕ' : 'ПОСЛЕДНИЕ ПОПОЛНЕНИЯ'}</Inline>
        {payments.map((payment) => (
          <Box key={payment.id}>
            <Strong>+{payment.lessonDelta} {lessonWord(payment.lessonDelta)}</Strong>
            <Small>{formatRubles(payment.amountRub)} · {paymentMethodLabel(payment.paymentMethod)} · {formatSubscriptionDate(payment.occurredAt)}</Small>
          </Box>
        ))}
      </Box>}
      {trainerView && <Box className="subscription-actions">
        <ActionButton icon="plus" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>{payments.length ? 'Продлить' : 'Добавить абонемент'}</ActionButton>
        <ActionButton variant="secondary" icon="history" onClick={() => go(`/trainer/clients/${student.id}/subscription`)}>История</ActionButton>
      </Box>}
    </Section>
  );
}

function AthleteDetails({ student, onSave, alwaysExpanded = false, compact = false }: { student: Student; onSave: (student: Student) => void; alwaysExpanded?: boolean; compact?: boolean }) {
  const draftKey = `athlete:${student.id}:${compact ? 'compact' : 'full'}`;
  const [restoredDraft] = useState(() => loadUiDraft(draftKey));
  const [expanded, setExpanded] = useState(typeof restoredDraft?.expanded === 'boolean' ? restoredDraft.expanded : alwaysExpanded);
  const [editing, setEditing] = useState(typeof restoredDraft?.editing === 'boolean' ? restoredDraft.editing : false);
  const [height, setHeight] = useState(typeof restoredDraft?.height === 'string' ? restoredDraft.height : (student.height ? String(student.height) : ''));
  const [weight, setWeight] = useState(typeof restoredDraft?.weight === 'string' ? restoredDraft.weight : (student.weight ? String(student.weight) : ''));
  const [gender, setGender] = useState<Student['gender']>(restoredDraft?.gender === 'male' || restoredDraft?.gender === 'female' || restoredDraft?.gender === 'not-specified' ? restoredDraft.gender : student.gender ?? 'not-specified');
  const [phone, setPhone] = useState(typeof restoredDraft?.phone === 'string' ? restoredDraft.phone : student.phone ?? '');
  const [contraindications, setContraindications] = useState(typeof restoredDraft?.contraindications === 'string' ? restoredDraft.contraindications : student.contraindications ?? '');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const parsedHeight = Number(height);
  const parsedWeight = Number(weight.replace(',', '.'));
  const metricError = height.trim() && (!Number.isFinite(parsedHeight) || parsedHeight < 50 || parsedHeight > 260)
    ? 'Укажи рост от 50 до 260 см.'
    : weight.trim() && (!Number.isFinite(parsedWeight) || parsedWeight < 20 || parsedWeight > 500)
      ? 'Укажи вес от 20 до 500 кг.' : '';
  const genderLabel = gender === 'male' ? 'Мужской' : gender === 'female' ? 'Женский' : 'Не указан';
  const resetFields = () => {
    setHeight(student.height ? String(student.height) : '');
    setWeight(student.weight ? String(student.weight) : '');
    setGender(student.gender ?? 'not-specified');
    setPhone(student.phone ?? '');
    setContraindications(student.contraindications ?? '');
    setValidationAttempted(false);
  };
  const cancelEdit = () => {
    clearUiDraft(draftKey);
    resetFields();
    setEditing(false);
  };
  const startEdit = () => { resetFields(); setEditing(true); };
  const keepFieldFocus = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.closest('.athlete-form')?.contains(document.activeElement)) event.preventDefault();
  };

  useEffect(() => {
    if (!editing) {
      clearUiDraft(draftKey);
      return;
    }
    saveUiDraft(draftKey, { expanded, editing, height, weight, gender, phone, contraindications });
  }, [contraindications, draftKey, editing, expanded, gender, height, phone, weight]);

  const save = () => {
    setValidationAttempted(true);
    if (metricError) return;
    onSave({
      ...student,
      height: height.trim() ? parsedHeight : undefined,
      weight: weight.trim() ? parsedWeight : undefined,
      gender,
      phone: phone.trim(),
      contraindications: contraindications.trim(),
    });
    clearUiDraft(draftKey);
    setEditing(false);
  };

  return (
    <Section className={`athlete-details section-block ${compact ? 'athlete-details-compact' : ''} ${alwaysExpanded ? 'always-expanded' : ''}`}>
      {compact ? <Box className="athlete-inline-summary"><Box><Paragraph>{[student.height ? `${student.height} см` : '', student.weight ? `${student.weight} кг` : '', student.gender && student.gender !== 'not-specified' ? genderLabel : '', student.phone].filter(Boolean).join(' · ') || 'Данные ученика не заполнены'}</Paragraph><Paragraph>Ограничения: {student.contraindications || 'не указаны'}</Paragraph></Box><Button type="button" className="wide-secondary athlete-edit-icon" aria-label="Редактировать данные ученика" title="Редактировать данные" aria-expanded={editing} onClick={() => { if (editing) { cancelEdit(); return; } startEdit(); }}><Icon name="edit" /></Button></Box> : <SectionHeading title={<>Данные и ограничения</>} >{alwaysExpanded && !editing ? <Button type="button" className="athlete-heading-edit" onClick={startEdit}><Icon name="edit" /> Редактировать</Button> : !alwaysExpanded && <Button type="button" aria-expanded={expanded} onClick={() => { setExpanded((current) => !current); if (editing) cancelEdit(); }}>{expanded ? 'Скрыть' : 'Показать'}</Button>}</SectionHeading>}
      {(compact ? editing : expanded) && (editing ? <Box className="athlete-form">
        <Box className="athlete-form-grid">
          <Field label={<>Рост, см</>} ><Input type="number" min="50" max="260" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="182" /></Field>
          <Field label={<>Вес, кг</>} ><Input type="number" min="20" max="500" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="86" /></Field>
        </Box>
        <Field label={<>Пол</>} ><Select value={gender} onChange={(event) => setGender(event.target.value as Student['gender'])}><SelectOption value="not-specified">Не указан</SelectOption><SelectOption value="male">Мужской</SelectOption><SelectOption value="female">Женский</SelectOption></Select></Field>
        <Field label={<>Мобильный телефон</>} ><Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" /></Field>
        <Field label={<>Противопоказания и особенности</>} ><Textarea value={contraindications} onChange={(event) => setContraindications(event.target.value)} maxLength={800} placeholder="Например: протрузия поясничного отдела, грыжа, болит левое запястье…" /></Field>
        {validationAttempted && metricError && <FormError>{metricError}</FormError>}
        <ActionButton icon="check" onPointerDown={keepFieldFocus} onClick={save}>Сохранить данные</ActionButton>
        <ActionButton variant="secondary" onPointerDown={keepFieldFocus} onClick={cancelEdit}>Отмена</ActionButton>
      </Box> : <>{!alwaysExpanded && <Button className="details-edit-button" type="button" onClick={startEdit}><Icon name="edit" /> Редактировать данные</Button>}<DefinitionList className="athlete-summary">
        <Box><DefinitionTerm>Рост</DefinitionTerm><DefinitionValue>{student.height ? `${student.height} см` : 'Не указан'}</DefinitionValue></Box>
        <Box><DefinitionTerm>Вес</DefinitionTerm><DefinitionValue>{student.weight ? `${student.weight} кг` : 'Не указан'}</DefinitionValue></Box>
        <Box><DefinitionTerm>Пол</DefinitionTerm><DefinitionValue>{genderLabel}</DefinitionValue></Box>
        <Box><DefinitionTerm>Телефон</DefinitionTerm><DefinitionValue>{student.phone || 'Не указан'}</DefinitionValue></Box>
        <Box className="athlete-summary-wide"><DefinitionTerm>Противопоказания и особенности</DefinitionTerm><DefinitionValue>{student.contraindications || 'Не указаны'}</DefinitionValue></Box>
      </DefinitionList></>)}
    </Section>
  );
}

function ProfileSettings({ details, summary, accountMode, account, theme, onToggleTheme, onSwitchRole, onReset, onSignOut, onOpenDesignKit, onConnectTelegram, onLoadTelegramConnection }: { details?: ReactNode; summary?: ReactNode; accountMode: boolean; account: { displayName: string; role: 'trainer' | 'student'; email: string }; theme: AppTheme; onToggleTheme: () => void; onSwitchRole?: () => void; onReset: () => void; onSignOut?: () => Promise<void>; onOpenDesignKit?: () => void; onConnectTelegram?: () => Promise<void>; onLoadTelegramConnection?: () => Promise<TelegramConnection> }) {
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [signOutConfirmation, setSignOutConfirmation] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
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

  const signOut = async () => {
    if (!onSignOut || signOutBusy) return;
    setSignOutBusy(true);
    setSignOutError('');
    try {
      await onSignOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Не удалось выйти из аккаунта. Попробуй ещё раз.');
    } finally {
      setSignOutBusy(false);
    }
  };

  return (
    <>
    <Section className="profile-identity-card" aria-label="Личные данные">
      <Section className="account-details" aria-label="Данные аккаунта"><InitialsAvatar className="account-avatar" name={account.displayName} length={1} /><Box><Strong>{account.displayName}</Strong><Small>{account.role === 'trainer' ? 'Тренер' : 'Ученик'}</Small>{account.email && <Inline>{account.email}</Inline>}</Box></Section>
        {accountMode && onConnectTelegram && (telegramConnection?.connected ? <Box className="telegram-connection-status"><Icon name="check" /><Inline><Strong>Telegram подключён</Strong>{telegramConnection.username && <Small>@{telegramConnection.username}</Small>}</Inline></Box> : <ActionButton variant="secondary" icon="arrow-up-right" disabled={telegramBusy || telegramStatusLoading} onClick={() => void connectTelegram()}>{telegramStatusLoading ? 'Проверяем Telegram…' : telegramBusy ? 'Создаём ссылку…' : 'Подключить Telegram'}</ActionButton>)}
        {telegramError && <FormError>{telegramError}</FormError>}
      {details}
    </Section>
    {summary}
    <Section className="profile-settings section-block" aria-label="Настройки профиля">
      <SectionHeading title="Настройки" />
      <Box className="settings-actions">
        <ActionButton variant="secondary" icon={theme === 'dark' ? 'sun' : 'moon'} onClick={onToggleTheme}>{theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}</ActionButton>
        {onSwitchRole && <ActionButton variant="secondary" icon="change" onClick={onSwitchRole}>Переключиться в роль {account.role === 'trainer' ? 'ученика' : 'тренера'}</ActionButton>}
        {onOpenDesignKit && <ActionButton variant="secondary" icon="workout" onClick={onOpenDesignKit}>Открыть дизайн-кит</ActionButton>}
        {accountMode && <ActionButton variant="secondary" icon="history" onClick={downloadPersistenceDiagnostics}>Скачать журнал сохранений</ActionButton>}
        {signOutError && <FormError>{signOutError}</FormError>}
        {accountMode && onSignOut ? <ActionButton variant="danger" disabled={signOutBusy} onClick={() => setSignOutConfirmation(true)}>{signOutBusy ? 'Выходим…' : 'Выйти из аккаунта'}</ActionButton> : <Button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}><Icon name="trash" /> Сбросить демо-данные</Button>}
      </Box>
      {signOutConfirmation && <ConfirmationModal title="Выйти из аккаунта?" text="Чтобы вернуться, потребуется снова войти." confirmLabel="Выйти" danger onClose={() => setSignOutConfirmation(false)} onConfirm={() => { setSignOutConfirmation(false); void signOut(); }} />}
      {resetConfirmationOpen && <ModalFrame title="Сбросить локальные данные?" className="settings-modal" surface="center" ariaLabel="Сбросить локальные данные?" onClose={() => setResetConfirmationOpen(false)}><Paragraph>Все локальные изменения в учениках, тренировках и расписании будут удалены.</Paragraph><Box className="confirmation-actions"><ActionButton variant="secondary" autoFocus onClick={() => setResetConfirmationOpen(false)}>Остаться</ActionButton><ActionButton variant="danger" onClick={onReset}>Сбросить данные</ActionButton></Box></ModalFrame>}
    </Section>
    </>
  );
}
