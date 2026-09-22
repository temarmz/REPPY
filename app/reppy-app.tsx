import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TRAINER_NAME,
  cloneWorkout,
  createWorkoutSession,
  dateKey,
  exerciseLibrary,
  findAssignmentWorkout,
  getExerciseSetPlans,
  findSessionWorkout,
  workoutFromSession,
  formatCalendarDay,
  formatDay,
  makeId,
  muscleGroups,
  normalizeWorkoutExercise,
  repeatAssignment,
  updateSessionWorkout,
  withExerciseSetPlans,
  type Assignment,
  type DemoState,
  type MoodRating,
  type MuscleGroup,
  type PaymentMethod,
  type SetResult,
  type Student,
  type SubscriptionEntry,
  type TrainingFormat,
  type Workout,
  type WorkoutExercise,
  type WorkoutSetPlan,
  type WorkoutSession,
} from './reppy-data';
import Icon, { iconAssetPaths, type IconName } from './ui-icon';
import { useReppyData } from './use-reppy-data';
import ExerciseProgressView, { StudentExerciseProgress } from './exercise-progress-view';
import SharedPageHeader from './page-header';
import EmptyState from './empty-state';
import MonthDatePicker from './month-date-picker';
import AppShell, { type AppTheme } from './app-shell';
import { AppStatusBanner, DataLoadError, useOnlineStatus } from './app-status';
import ModalFrame, { MODAL_LAYER_EVENT, hasOpenModalLayers } from './modal-frame';
import WorkoutScheduleFields, { DatePickerField } from './workout-schedule-fields';
import { ActionButton, FormError, TextField } from './ui-controls';
import { ActiveExerciseCard, PlanExerciseCard } from './workout-exercise-card';
import { progressHref } from './exercise-progress';
import {
  chargeSubscriptionForSession,
  createSubscriptionPayment,
  isSessionCharged,
  recentSubscriptionPayments,
  refundSubscriptionForSession,
  subscriptionBalance,
  subscriptionEntriesFor,
  updateSubscriptionPayment,
  type PaymentInput,
} from './subscription-ledger';
import {
  cleanupOrphanedInstructionVideos,
  clearInstructionVideos,
  loadInstructionVideo,
  saveInstructionVideo,
} from './instruction-video-repository';
import { useReppyAuth, type TelegramConnection } from './reppy-auth';
import { AccountScreen, MissingProfileScreen, SupabaseInvitationScreen } from './auth-screens';
import { getSupabaseClient } from './supabase-client';
import { createSupabaseRepository } from './supabase-repository';

const COPY = {
  createWorkout: 'Создать тренировку',
  emptyAssignments: 'На ближайшие две недели тренер пока ничего не назначил.',
  emptyHistory: 'Завершённые тренировки появятся здесь.',
};

const NAVIGATION_EVENT = 'reppy:navigate';
const TRAINER_ALL_DAYS_PREFERENCE = 'reppy-ui:trainer-all-days';
const THEME_PREFERENCE = 'reppy-ui:theme';
let activeNavigationBlocker: ((proceed: () => void) => void) | null = null;
let restoringBlockedHistory = false;
let pendingHistoryBlocker: ((proceed: () => void) => void) | null = null;
let pendingModalReplacement: string | null = null;

function loadAllDaysPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRAINER_ALL_DAYS_PREFERENCE) === 'true';
  } catch {
    return false;
  }
}

function saveAllDaysPreference(value: boolean) {
  try {
    window.localStorage.setItem(TRAINER_ALL_DAYS_PREFERENCE, String(value));
  } catch {
    // The view still works when storage is unavailable (for example, in private mode).
  }
}

function loadThemePreference(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(THEME_PREFERENCE) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function saveThemePreference(theme: AppTheme) {
  try {
    window.localStorage.setItem(THEME_PREFERENCE, theme);
  } catch {
    // Theme still changes for the current session when storage is unavailable.
  }
}

function hashPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.hash.replace(/^#/, '') || '/';
}

type ReppyScrollPosition = {
  pageTop: number;
  pageLeft: number;
  windowTop: number;
  windowLeft: number;
};

const TOP_SCROLL_POSITION: ReppyScrollPosition = { pageTop: 0, pageLeft: 0, windowTop: 0, windowLeft: 0 };

function currentScrollPosition(): ReppyScrollPosition {
  const page = document.querySelector<HTMLElement>('.page-wrap');
  return {
    pageTop: page?.scrollTop ?? 0,
    pageLeft: page?.scrollLeft ?? 0,
    windowTop: window.scrollY,
    windowLeft: window.scrollX,
  };
}

function saveCurrentScrollPosition() {
  const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.replaceState({ ...currentState, reppyScroll: currentScrollPosition() }, '', window.location.href);
}

function restoreScrollPosition(position: ReppyScrollPosition) {
  document.querySelector<HTMLElement>('.page-wrap')?.scrollTo({ top: position.pageTop, left: position.pageLeft, behavior: 'auto' });
  window.scrollTo({ top: position.windowTop, left: position.windowLeft, behavior: 'auto' });
}
function performNavigation(path: string, replace = false) {
  if (hashPath() === path) {
    restoreScrollPosition(TOP_SCROLL_POSITION);
    saveCurrentScrollPosition();
    return;
  }
  saveCurrentScrollPosition();
  const previousState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const { reppyModal: _modalEntry, ...navigationState } = previousState;
  if (replace && _modalEntry) {
    pendingModalReplacement = path;
    window.history.back();
    return;
  }
  if (replace || _modalEntry) {
    window.history.replaceState({ ...navigationState, reppyEntry: true, reppyScroll: TOP_SCROLL_POSITION }, '', `#${path}`);
  } else {
    window.history.pushState({ ...previousState, reppyEntry: true, reppyScroll: TOP_SCROLL_POSITION }, '', `#${path}`);
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function go(path: string, replace = false) {
  const proceed = () => performNavigation(path, replace);
  if (activeNavigationBlocker) {
    activeNavigationBlocker(proceed);
    return;
  }
  proceed();
}

function goBack(fallback: string) {
  const proceed = () => {
    saveCurrentScrollPosition();
    if (window.history.state?.reppyEntry) {
      window.history.go(window.history.state?.reppyModal ? -2 : -1);
      return;
    }
    performNavigation(fallback);
  };
  if (activeNavigationBlocker) {
    activeNavigationBlocker(proceed);
    return;
  }
  proceed();
}

function useUnsavedNavigationGuard(isDirty: boolean) {
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const blockerRef = useRef<((proceed: () => void) => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const blocker = (proceed: () => void) => setPendingNavigation(() => proceed);
    blockerRef.current = blocker;
    activeNavigationBlocker = blocker;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (activeNavigationBlocker === blocker) activeNavigationBlocker = null;
      blockerRef.current = null;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const allowNextNavigation = () => {
    if (activeNavigationBlocker === blockerRef.current) activeNavigationBlocker = null;
    setPendingNavigation(null);
  };
  const discardAndContinue = () => {
    const proceed = pendingNavigation;
    allowNextNavigation();
    proceed?.();
  };

  return {
    allowNextNavigation,
    discardPrompt: pendingNavigation ? (
      <ConfirmationModal
        title="Выйти без сохранения?"
        text="Изменения на этом экране ещё не сохранены."
        confirmLabel="Выйти без сохранения"
        danger
        onClose={() => setPendingNavigation(null)}
        onConfirm={discardAndContinue}
      />
    ) : null,
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function findStudent(data: DemoState, id: string) {
  return data.students.find((student) => student.id === id);
}

function workoutForRepeat(data: DemoState, assignment: Assignment) {
  const completedSession = data.sessions.find((session) => session.assignmentId === assignment.id && session.completedAt);
  return completedSession ? workoutFromSession(completedSession) : findAssignmentWorkout(data, assignment);
}

function exercisePreview(workout?: Workout, withPlan = false) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises
    .slice(0, 3)
    .map((exercise) => withPlan ? exercise.name + ' · ' + getExerciseSetPlans(exercise).length + ' подх.' : exercise.name)
    .join(' · ');
  return workout.exercises.length > 3 ? `${preview} · …` : preview;
}

const MOODS: Array<{ value: MoodRating; label: string; detail: string; icon: IconName }> = [
  { value: 'great', label: 'Отлично', detail: 'Много сил', icon: 'sun' },
  { value: 'good', label: 'Хорошо', detail: 'Рабочий темп', icon: 'check' },
  { value: 'tired', label: 'Устал', detail: 'Нужен отдых', icon: 'minus' },
  { value: 'hard', label: 'Тяжело', detail: 'Было непросто', icon: 'workout' },
];

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

function moodLabel(mood: MoodRating) {
  return MOODS.find((item) => item.value === mood)?.label ?? '';
}

function formatElapsedTime(startedAt: string, currentTime: number) {
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return {
    elapsedSeconds,
    label: hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}

function lessonWord(count: number) {
  return { zero: 'занятий', one: 'занятие', two: 'занятия', few: 'занятия', many: 'занятий', other: 'занятий' }[new Intl.PluralRules('ru').select(Math.abs(count))];
}

function subscriptionBalanceLabel(balance: number, hasEntries = true) {
  if (!hasEntries) return 'Абонемент не добавлен';
  if (balance > 0) return `Осталось ${balance} ${lessonWord(balance)}`;
  if (balance === 0) return 'Абонемент закончился';
  return `${Math.abs(balance)} ${lessonWord(balance)} в долг`;
}

function subscriptionTone(balance: number, hasEntries = true) {
  if (!hasEntries) return 'empty';
  if (balance <= 0) return 'debt';
  if (balance <= 2) return 'low';
  return 'active';
}

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
  const { data, hydrated, persistencePhase, persistenceError, retryPersistence, reset: resetData, createStudentInvitation, setData } = useReppyData(remoteRepository);
  const online = useOnlineStatus();
  const [path, setPath] = useState('/');
  const currentPathRef = useRef('/');
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
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const commitPath = () => {
      const nextPath = hashPath();
      currentPathRef.current = nextPath;
      setPath(nextPath);
    };
    const handleNavigation = (event?: Event) => {
      if (event?.type === 'hashchange' && restoringBlockedHistory) return;
      if (event?.type === 'popstate' && pendingModalReplacement) {
        const replacementPath = pendingModalReplacement;
        pendingModalReplacement = null;
        const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
        const navigationState = { ...currentState };
        delete navigationState.reppyModal;
        window.history.replaceState({ ...navigationState, reppyEntry: true, reppyScroll: TOP_SCROLL_POSITION }, '', `#${replacementPath}`);
        commitPath();
        return;
      }
      if (event?.type === 'popstate' && hasOpenModalLayers()) {
        commitPath();
        return;
      }
      if (event?.type === 'popstate' && restoringBlockedHistory) {
        restoringBlockedHistory = false;
        const blocker = pendingHistoryBlocker;
        pendingHistoryBlocker = null;
        commitPath();
        blocker?.(() => window.history.go(window.history.state?.reppyModal ? -2 : -1));
        return;
      }
      if (event?.type === 'popstate' && activeNavigationBlocker && hashPath() !== currentPathRef.current) {
        restoringBlockedHistory = true;
        pendingHistoryBlocker = activeNavigationBlocker;
        window.history.forward();
        return;
      }
      commitPath();
    };
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    return () => {
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
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

    const homePath = activeRole === 'trainer' ? '/trainer' : '/student';
    window.history.replaceState({ reppyEntry: false, reppyScroll: TOP_SCROLL_POSITION }, '', `#${homePath}`);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }, [auth.enabled, auth.profile, auth.status, data.loggedIn, data.role, hydrated, path]);

  useEffect(() => {
    if (!auth.enabled || auth.status !== 'authenticated' || !auth.profile || !hydrated) return;
    const wrongArea = auth.profile.role === 'student'
      ? path.startsWith('/trainer')
      : path.startsWith('/student');
    if (wrongArea) go(auth.profile.role === 'student' ? '/student' : '/trainer', true);
  }, [auth.enabled, auth.profile, auth.status, hydrated, path]);

  useEffect(() => {
    if (!hydrated || !assetsReady) return;
    const position = window.history.state?.reppyScroll ?? TOP_SCROLL_POSITION;
    let restoreFrame = 0;
    const renderFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => restoreScrollPosition(position));
    });
    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [path, hydrated, assetsReady]);

  useEffect(() => {
    if (!hydrated || !assetsReady) return;
    const page = document.querySelector<HTMLElement>('.page-wrap');
    let saveFrame = 0;
    const scheduleSave = () => {
      if (saveFrame) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        saveCurrentScrollPosition();
      });
    };
    page?.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('scroll', scheduleSave, { passive: true });
    return () => {
      if (saveFrame) window.cancelAnimationFrame(saveFrame);
      page?.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('scroll', scheduleSave);
    };
  }, [path, hydrated, assetsReady]);
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
    return (
      <main className="loading-screen" aria-busy="true">
        <img className="loading-logo" src="logo-full.png" alt="REPPY" />
        <span className="loading-bar" aria-hidden="true"><i /></span>
        <p>Готовим тренировочный кабинет…</p>
      </main>
    );
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
          onSignIn={auth.signIn}
          onSignUp={auth.signUpStudent}
          onAccept={async (token) => {
            await auth.acceptInvitation(token);
            go('/student', true);
          }}
          onHome={() => go('/', true)}
        />
      );
    }
    return (
      <InvitationScreen
        token={decodeURIComponent(inviteMatch[1])}
        inviteName={inviteMatch[2] ? decodeURIComponent(inviteMatch[2]) : ''}
        data={data}
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

  if (auth.enabled && (path === '/auth/recovery' || auth.recovery)) {
    return <AccountScreen key="recovery" recovery initialError={auth.error} onSignIn={auth.signIn} onSendPasswordReset={auth.sendPasswordReset} onUpdatePassword={async (password) => {
      await auth.updatePassword(password);
      go('/', true);
    }} />;
  }

  if (auth.enabled && auth.status === 'profile-missing') {
    return <MissingProfileScreen onSignOut={auth.signOut} />;
  }

  if (auth.enabled && auth.status === 'anonymous' && path === '/') {
    return <WelcomeScreen accountMode onLogin={() => go('/auth/sign-in')} />;
  }

  if (auth.enabled && auth.status !== 'authenticated') {
    return <AccountScreen key="sign-in" recovery={false} initialError={auth.error} onSignIn={auth.signIn} onSendPasswordReset={auth.sendPasswordReset} onUpdatePassword={auth.updatePassword} />;
  }

  if (auth.enabled && (path === '/' || path === '/auth/sign-in')) {
    return (
      <main className="loading-screen" aria-busy="true">
        <img className="loading-logo" src="logo-full.png" alt="REPPY" />
        <span className="loading-bar" aria-hidden="true"><i /></span>
        <p>Открываем твой кабинет…</p>
      </main>
    );
  }

  const authenticatedRouteMismatch = Boolean(auth.enabled && auth.profile && (
    (auth.profile.role === 'student' && path.startsWith('/trainer'))
    || (auth.profile.role === 'trainer' && path.startsWith('/student'))
  ));
  if (authenticatedRouteMismatch) {
    return (
      <main className="loading-screen" aria-busy="true">
        <img className="loading-logo" src="logo-full.png" alt="REPPY" />
        <span className="loading-bar" aria-hidden="true"><i /></span>
        <p>Открываем твой кабинет…</p>
      </main>
    );
  }

  if (!data.loggedIn || path === '/') return <WelcomeScreen onLogin={login} />;

  let content: ReactNode;
  const area: 'trainer' | 'student' = auth.enabled && auth.profile
    ? auth.profile.role
    : path.startsWith('/student') ? 'student' : 'trainer';

  if (area === 'trainer') {
    const [progressPath, progressSearch = ''] = path.split('?');
    const progressMatch = progressPath.match(/^\/trainer\/clients\/([^/]+)\/progress(?:\/([^/]+))?$/);
    const subscriptionPaymentMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription\/payments\/([^/]+)$/);
    const subscriptionNewMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription\/new$/);
    const subscriptionMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription$/);
    const clientAssignCopyMatch = path.match(/^\/trainer\/clients\/([^/]+)\/assign\/copy\/([^/]+)$/);
    const clientAssignMatch = path.match(/^\/trainer\/clients\/([^/]+)\/assign(?:\/([^/]+))?$/);
    const clientMatch = path.match(/^\/trainer\/clients\/([^/]+)$/);
    const assignmentEditMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/edit$/);
    const assignmentRepeatMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/repeat$/);
    const assignmentMatch = path.match(/^\/trainer\/assignments\/([^/]+)$/);
    const trainerActiveMatch = path.match(/^\/trainer\/workout\/([^/]+)$/);
    const scheduleCopyMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/copy\/([^/]+)$/);
    const scheduleNewMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/new$/);
    const scheduleStudentMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/);
    const sessionMatch = path.match(/^\/trainer\/sessions\/([^/]+)$/);

    if (path === '/trainer/design-kit') {
      content = <DesignKitScreen />;
    } else if (progressMatch?.[2]) {
      content = <ExerciseProgressView key={progressPath} data={data} studentId={progressMatch[1]} exerciseId={progressMatch[2]} search={progressSearch} go={go} back={goBack} />;
    } else if (path === '/trainer/calendar') {
      content = <WorkoutCalendar data={data} area="trainer" />;
    } else if (scheduleCopyMatch) {
      const [scheduledFor, studentId, sourceAssignmentId] = scheduleCopyMatch.slice(1);
      const student = findStudent(data, studentId);
      const sourceAssignment = data.assignments.find((item) => item.id === sourceAssignmentId && item.studentId === studentId);
      const sourceWorkout = sourceAssignment && workoutForRepeat(data, sourceAssignment);
      content = student?.status === 'active' && sourceAssignment && sourceWorkout && isScheduleDate(scheduledFor) ? (
        <AssignWorkoutToStudent
          student={student}
          workout={sourceWorkout}
          initialScheduledFor={scheduledFor}
          initialScheduledTime={sourceAssignment.scheduledTime}
          initialFormat={sourceAssignment.format}
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment = { ...repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime), format };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go('/trainer', true);
          }}
        />
      ) : <NotFound />;
    } else if (scheduleNewMatch) {
      const [scheduledFor, studentId] = scheduleNewMatch.slice(1);
      const student = findStudent(data, studentId);
      content = student?.status === 'active' && isScheduleDate(scheduledFor) ? (
        <NewAssignmentForStudent
          student={student}
          initialScheduledFor={scheduledFor}
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor: nextDate,
              scheduledTime,
              format,
              status: 'assigned',
              workoutSnapshot,
            };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go('/trainer', true);
          }}
        />
      ) : <NotFound />;
    } else if (scheduleStudentMatch) {
      const [scheduledFor, studentId] = scheduleStudentMatch.slice(1);
      const student = findStudent(data, studentId);
      content = student?.status === 'active' && isScheduleDate(scheduledFor)
        ? <StudentWorkoutHistory data={data} student={student} scheduledFor={scheduledFor} backPath="/trainer" routeBase={`/trainer/schedule/${scheduledFor}/${student.id}`} />
        : <NotFound />;
    } else if (path === '/trainer/clients') {
      content = <ClientsList data={data} />;
    } else if (path === '/trainer/clients/invite') {
      content = (
        <InviteStudent
          onCreate={(student) => setData((current) => ({ ...current, students: [...current.students, student] }))}
          onInvite={createStudentInvitation ?? undefined}
        />
      );
    } else if (subscriptionPaymentMatch) {
      const student = findStudent(data, subscriptionPaymentMatch[1]);
      const payment = data.subscriptionEntries.find((entry) => (
        entry.id === subscriptionPaymentMatch[2]
        && entry.studentId === subscriptionPaymentMatch[1]
        && entry.kind === 'payment'
      ));
      content = student && payment ? (
        <SubscriptionPaymentForm
          student={student}
          initial={payment}
          onSave={(input) => {
            setData((current) => ({
              ...current,
              subscriptionEntries: current.subscriptionEntries.map((entry) => (
                entry.id === payment.id ? updateSubscriptionPayment(entry, input) : entry
              )),
            }));
            showToast('Пополнение исправлено');
            go(`/trainer/clients/${student.id}/subscription`);
          }}
        />
      ) : <NotFound />;
    } else if (subscriptionNewMatch) {
      const student = findStudent(data, subscriptionNewMatch[1]);
      const lastPayment = student ? recentSubscriptionPayments(data.subscriptionEntries, student.id, 1)[0] : undefined;
      content = student ? (
        <SubscriptionPaymentForm
          student={student}
          defaults={lastPayment}
          onSave={(input) => {
            setData((current) => ({
              ...current,
              subscriptionEntries: [...current.subscriptionEntries, createSubscriptionPayment(student.id, input)],
            }));
            showToast(`Абонемент пополнен на ${input.lessons} ${lessonWord(input.lessons)}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (subscriptionMatch) {
      const student = findStudent(data, subscriptionMatch[1]);
      content = student ? <SubscriptionHistory data={data} student={student} /> : <NotFound />;
    } else if (clientAssignCopyMatch) {
      const [studentId, sourceAssignmentId] = clientAssignCopyMatch.slice(1);
      const student = findStudent(data, studentId);
      const sourceAssignment = data.assignments.find((item) => item.id === sourceAssignmentId && item.studentId === studentId);
      const sourceWorkout = sourceAssignment && workoutForRepeat(data, sourceAssignment);
      content = student?.status === 'active' && sourceAssignment && sourceWorkout ? (
        <AssignWorkoutToStudent
          student={student}
          workout={sourceWorkout}
          initialScheduledFor={dateKey()}
          initialScheduledTime={sourceAssignment.scheduledTime}
          initialFormat={sourceAssignment.format}
          backPath={`/trainer/clients/${student.id}/assign`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment = { ...repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime), format };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (clientAssignMatch?.[2] === 'new') {
      const student = findStudent(data, clientAssignMatch[1]);
      content = student ? (
        <NewAssignmentForStudent
          student={student}
          backPath={`/trainer/clients/${student.id}/assign`}
          onAssign={(scheduledFor, scheduledTime, format, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor,
              scheduledTime,
              format,
              status: 'assigned',
              workoutSnapshot,
            };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (clientAssignMatch) {
      const student = findStudent(data, clientAssignMatch[1]);
      content = student ? <StudentWorkoutHistory data={data} student={student} scheduledFor={dateKey()} backPath={`/trainer/clients/${student.id}`} routeBase={`/trainer/clients/${student.id}/assign`} /> : <NotFound />;
    } else if (clientMatch || progressMatch) {
      content = <StudentProfile data={data} studentId={(clientMatch ?? progressMatch)![1]} trainerView onUpdate={(updated) => {
        setData((current) => ({ ...current, students: current.students.map((item) => item.id === updated.id ? updated : item) }));
        showToast('Профиль ученика сохранён');
      }} />;
    } else if (assignmentEditMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentEditMatch[1]);
      content = assignment && assignment.status === 'assigned' ? (
        <EditAssignment
          data={data}
          assignment={assignment}
          onSave={(updated) => {
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === updated.id ? updated : item),
            }));
            showToast('Назначение сохранено');
            go(`/trainer/assignments/${updated.id}`);
          }}
          onDelete={(deleted) => {
            setData((current) => ({
              ...current,
              assignments: current.assignments.filter((item) => item.id !== deleted.id),
              sessions: current.sessions.filter((item) => item.assignmentId !== deleted.id),
            }));
            showToast('Тренировка удалена из расписания');
            go(`/trainer/clients/${deleted.studentId}`);
          }}
        />
      ) : <NotFound />;
    } else if (assignmentRepeatMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentRepeatMatch[1]);
      const sourceWorkout = assignment && workoutForRepeat(data, assignment);
      content = assignment && sourceWorkout ? (
        <RepeatAssignment
          data={data}
          assignment={assignment}
          sourceWorkout={sourceWorkout}
          onSave={(scheduledFor, scheduledTime, format, workout) => {
            const next = { ...repeatAssignment(assignment, workout, scheduledFor, scheduledTime), format };
            setData((current) => ({ ...current, assignments: [...current.assignments, next] }));
            showToast('Повтор тренировки назначен');
            go(`/trainer/assignments/${next.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (assignmentMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentMatch[1]);
      content = assignment ? <AssignmentDetails
        data={data}
        assignment={assignment}
        onAcceptRequest={() => {
          const request = assignment.rescheduleRequest;
          if (!request) return;
          setData((current) => ({
            ...current,
            assignments: current.assignments.map((item) => item.id === assignment.id ? {
              ...item,
              scheduledFor: request.scheduledFor,
              scheduledTime: request.scheduledTime,
              rescheduleRequest: undefined,
            } : item),
          }));
          showToast('Новое время подтверждено');
        }}
        onDeclineRequest={() => {
          setData((current) => ({
            ...current,
            assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, rescheduleRequest: undefined } : item),
          }));
          showToast('Запрос отклонён');
        }}
      /> : <NotFound />;
    } else if (trainerActiveMatch) {
      const assignment = data.assignments.find((item) => item.id === trainerActiveMatch[1]);
      const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
      const workout = assignment && (session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment));
      content = assignment && workout && assignment.status === 'assigned' ? (
        <ActiveWorkout
          workout={workout}
          session={session}
          student={findStudent(data, assignment.studentId)}
          scheduledFor={assignment.scheduledFor}
          scheduledTime={assignment.scheduledTime}
          format={assignment.format}
          backPath={`/trainer/assignments/${assignment.id}`}
          trainerCanWaiveCharge
          balance={subscriptionBalance(data.subscriptionEntries, assignment.studentId)}
          onStart={() => {
            if (session) return;
            const nextSession = createWorkoutSession(assignment, workout, 'trainer');
            setData((current) => ({ ...current, sessions: [...current.sessions, nextSession] }));
          }}
          onUpdate={(sessionId, results) => setData((current) => ({
            ...current,
            sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, results } : item),
          }))}
          onWorkoutUpdate={(sessionId, nextWorkout) => setData((current) => ({
            ...current,
            sessions: current.sessions.map((item) => item.id === sessionId ? updateSessionWorkout(item, nextWorkout) : item),
          }))}
          onFinish={(sessionId, { chargeSubscription }) => {
            const completedAt = new Date().toISOString();
            setData((current) => {
              const savedSession = current.sessions.find((item) => item.id === sessionId);
              return {
                ...current,
                assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, status: 'completed' } : item),
                sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt, subscriptionChargeStatus: chargeSubscription ? 'charged' : 'waived' } : item),
                subscriptionEntries: chargeSubscription && savedSession
                  ? chargeSubscriptionForSession(current.subscriptionEntries, savedSession, workout.name, completedAt)
                  : current.subscriptionEntries,
              };
            });
            showToast(chargeSubscription ? 'Тренировка завершена, занятие списано' : 'Тренировка завершена без списания');
            go(`/trainer/sessions/${sessionId}`, true);
          }}
        />
      ) : <NotFound />;
    } else if (sessionMatch) {
      const session = data.sessions.find((item) => item.id === sessionMatch[1]);
      content = session ? <SessionResult
        data={data}
        session={session}
        trainerView
        onRepeat={() => go(`/trainer/assignments/${session.assignmentId}/repeat`)}
        onDelete={() => {
          setData((current) => ({
            ...current,
            assignments: current.assignments.filter((item) => item.id !== session.assignmentId),
            sessions: current.sessions.filter((item) => item.assignmentId !== session.assignmentId),
            subscriptionEntries: refundSubscriptionForSession(current.subscriptionEntries, session, session.workoutSnapshot.name),
          }));
          showToast('Завершённая тренировка удалена');
          go(`/trainer/clients/${session.studentId}`);
        }}
      /> : <NotFound />;
    } else if (path === '/trainer') {
      content = <TrainerHome data={data} />;
    } else {
      content = <NotFound />;
    }
  } else {
    const assignmentDetailsMatch = path.match(/^\/student\/assignments\/([^/]+)$/);
    const activeMatch = path.match(/^\/student\/workout\/([^/]+)$/);
    const historyMatch = path.match(/^\/student\/history\/([^/]+)$/);
    const successMatch = path.match(/^\/student\/success\/([^/]+)$/);
    const finishMatch = path.match(/^\/student\/finish\/([^/]+)$/);

    if (path === '/student/calendar') {
      content = <WorkoutCalendar data={data} area="student" />;
    } else if (path === '/student/profile') {
      content = <StudentProfile data={data} studentId={data.activeStudentId} onUpdate={(updated) => {
        setData((current) => ({ ...current, students: current.students.map((item) => item.id === updated.id ? updated : item) }));
        showToast('Профиль сохранён');
      }} />;
    } else if (path === '/student/history') {
      content = <StudentHistory data={data} />;
    } else if (assignmentDetailsMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentDetailsMatch[1] && item.studentId === data.activeStudentId);
      content = assignment ? <StudentAssignmentDetails
        data={data}
        assignment={assignment}
        onRequest={(scheduledFor, scheduledTime) => {
          setData((current) => ({
            ...current,
            assignments: current.assignments.map((item) => item.id === assignment.id ? {
              ...item,
              rescheduleRequest: { scheduledFor, scheduledTime, requestedAt: new Date().toISOString() },
            } : item),
          }));
          showToast('Новое время отправлено тренеру');
        }}
        onStart={() => go(`/student/workout/${assignment.id}`)}
      /> : <NotFound />;
    } else if (activeMatch) {
      const assignment = data.assignments.find((item) => item.id === activeMatch[1]);
      const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
      const completedSession = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
      const workout = assignment && (session
        ? findSessionWorkout(data, session)
        : completedSession
          ? findSessionWorkout(data, completedSession)
          : findAssignmentWorkout(data, assignment));
      content = assignment && workout && assignment.status === 'completed' && completedSession ? (
        <WorkoutSuccess data={data} session={completedSession} />
      ) : assignment && workout ? (
        <ActiveWorkout
          workout={workout}
          session={session}
          student={findStudent(data, assignment.studentId)}
          scheduledFor={assignment.scheduledFor}
          scheduledTime={assignment.scheduledTime}
          format={assignment.format}
          backPath="/student"
          onStart={() => {
            if (session) return;
            const nextSession = createWorkoutSession(assignment, workout, 'student');
            setData((current) => ({ ...current, sessions: [...current.sessions, nextSession] }));
          }}
          onUpdate={(sessionId, results) => setData((current) => ({
            ...current,
            sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, results } : item),
          }))}
          onWorkoutUpdate={(sessionId, nextWorkout) => setData((current) => ({
            ...current,
            sessions: current.sessions.map((item) => item.id === sessionId ? updateSessionWorkout(item, nextWorkout) : item),
          }))}
          onFinish={(sessionId, { chargeSubscription }) => {
            const completedAt = new Date().toISOString();
            setData((current) => {
              const savedSession = current.sessions.find((item) => item.id === sessionId);
              return {
                ...current,
                assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, status: 'completed' } : item),
                sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt, subscriptionChargeStatus: chargeSubscription ? 'charged' : 'waived' } : item),
                subscriptionEntries: chargeSubscription && savedSession
                  ? chargeSubscriptionForSession(current.subscriptionEntries, savedSession, workout.name, completedAt)
                  : current.subscriptionEntries,
              };
            });
            go(`/student/finish/${sessionId}`);
          }}
        />
      ) : <NotFound />;
    } else if (finishMatch) {
      const session = data.sessions.find((item) => item.id === finishMatch[1]);
      content = session ? (
        <WorkoutFeedback
          data={data}
          session={session}
          onComplete={(mood, comment) => {
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === session.assignmentId ? { ...item, status: 'completed' } : item),
              sessions: current.sessions.map((item) => item.id === session.id ? { ...item, completedAt: item.completedAt ?? new Date().toISOString(), mood, comment: comment.trim() } : item),
            }));
            go(`/student/success/${session.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (successMatch) {
      const session = data.sessions.find((item) => item.id === successMatch[1]);
      content = session ? <WorkoutSuccess data={data} session={session} /> : <NotFound />;
    } else if (historyMatch) {
      const session = data.sessions.find((item) => item.id === historyMatch[1]);
      content = session ? <SessionResult data={data} session={session} /> : <NotFound />;
    } else if (path === '/student') {
      content = (
        <StudentHome
          data={data}
          onOpen={(assignmentId) => go(`/student/assignments/${assignmentId}`)}
        />
      );
    } else {
      content = <NotFound />;
    }
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
        systemStatus={<AppStatusBanner phase={persistencePhase} error={persistenceError} online={online} remote={auth.enabled} onRetry={retryPersistence} />}
      >
        {content}
        {toast && <div className="toast" role="status"><Icon name="check" /> {toast}</div>}
      </AppShell>
      {settingsOpen && <SettingsModal
        accountMode={auth.enabled}
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

function WelcomeScreen({ onLogin, accountMode = false }: { onLogin: () => void; accountMode?: boolean }) {
  return (
    <main className="welcome-page">
      <section className="welcome-screen">
        <div className="welcome-glow" aria-hidden="true" />
        <section className="welcome-card">
          <Brand />
          <div className="welcome-copy">
            <p className="eyebrow">Персональные тренировки без хаоса</p>
            <h1>ВЕДИ УЧЕНИКОВ.<br />ВИДЬ ПРОГРЕСС.</h1>
            <p className="welcome-description">Расписание, программы, результаты подходов и абонементы — в одной понятной связи между тренером и учеником.</p>
          </div>
          <button className="primary-button" type="button" onClick={onLogin}>
            <Icon name="arrow-right" /> {accountMode ? 'Войти в REPPY' : 'Попробовать REPPY'}
          </button>
          <div className="hero-points" aria-label={accountMode ? 'Преимущества REPPY' : 'Преимущества демо'}>
            {accountMode
              ? <><span>Тренер и ученик</span><span>Данные синхронизированы</span><span>Работает на iPhone</span></>
              : <><span>Без регистрации</span><span>Обе роли</span><span>Работает на iPhone</span></>}
          </div>
        </section>
        <figure className="hero-mascot">
          <img src="logo.png" alt="Маскот REPPY — спортивный динозавр" />
          <figcaption>TRAIN · TRACK · GROW</figcaption>
        </figure>
      </section>

      <section className="landing-section landing-flow" aria-labelledby="landing-flow-title">
        <header className="landing-section-heading">
          <p className="eyebrow">От плана до результата</p>
          <h2 id="landing-flow-title">ОДНА ТРЕНИРОВКА.<br />ТРИ ПОНЯТНЫХ ШАГА.</h2>
          <p>Никаких параллельных таблиц, переписок и потерянных результатов.</p>
        </header>
        <ol className="workflow-grid">
          <li><span>01</span><Icon name="calendar" /><div><h3>Тренер назначает</h3><p>Выбирает ученика, дату и формат, затем адаптирует готовую программу под занятие.</p></div></li>
          <li><span>02</span><Icon name="workout" /><div><h3>Ученик выполняет</h3><p>Заранее видит состав, а в зале отмечает подходы, веса и повторы по таймеру.</p></div></li>
          <li><span>03</span><Icon name="success" /><div><h3>Оба видят итог</h3><p>Результат, самочувствие, комментарий и динамика сохраняются сразу после тренировки.</p></div></li>
        </ol>
      </section>

      <section className="landing-section role-section" aria-labelledby="roles-title">
        <header className="landing-section-heading">
          <p className="eyebrow">Каждому — только нужное</p>
          <h2 id="roles-title">ДВА ИНТЕРФЕЙСА.<br />ОДНА АКТУАЛЬНАЯ КАРТИНА.</h2>
        </header>
        <div className="role-showcase-list">
          <article className="role-showcase">
            <div className="role-copy">
              <p className="eyebrow">Для тренера</p>
              <h3>День начинается с расписания</h3>
              <p>Сразу видно, кто и во сколько приходит. Дальше — только действия по конкретному ученику.</p>
              <ul>
                <li><Icon name="check" /><span><strong>Планирование</strong>Шаблоны, назначения и календарь на ближайшие недели.</span></li>
                <li><Icon name="check" /><span><strong>Контекст ученика</strong>Прогресс, ограничения, комментарии и история занятий.</span></li>
                <li><Icon name="check" /><span><strong>Абонементы</strong>Остаток тренировок, оплаты и списание после занятия.</span></li>
              </ul>
            </div>
            <figure className="landing-art-placeholder trainer-art">
              <div aria-hidden="true"><span>ART 01</span><Icon name="calendar" /><b>REPPY</b></div>
              <figcaption><strong>Тренер собирает неделю</strong><small>Место для авторской иллюстрации</small></figcaption>
            </figure>
          </article>

          <article className="role-showcase reverse">
            <div className="role-copy">
              <p className="eyebrow">Для ученика</p>
              <h3>На тренировке ничего не отвлекает</h3>
              <p>До занятия — дата, формат и состав. Во время — текущие подходы, инструкции и таймер. После — понятная история.</p>
              <ul>
                <li><Icon name="check" /><span><strong>Перед тренировкой</strong>Просмотр программы, персональных видео и запрос другого времени без звонков.</span></li>
                <li><Icon name="check" /><span><strong>Во время</strong>Вес, повторы, отметки подходов и общий таймер занятия.</span></li>
                <li><Icon name="check" /><span><strong>После</strong>Самочувствие, комментарий тренеру и личная динамика.</span></li>
              </ul>
            </div>
            <figure className="landing-art-placeholder student-art">
              <div aria-hidden="true"><span>ART 02</span><Icon name="workout" /><b>REPPY</b></div>
              <figcaption><strong>Ученик завершает подход</strong><small>Место для авторской иллюстрации</small></figcaption>
            </figure>
          </article>
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-title">
        <header className="pricing-heading">
          <div><p className="eyebrow">Цена следует за практикой</p><h2 id="pricing-title">ПЛАТИ ЗА МАСШТАБ.<br />НЕ ЗА КАЖДОЕ ДЕЙСТВИЕ.</h2></div>
          <p>Тариф определяется числом активных учеников — тех, кому назначена хотя бы одна тренировка в текущем месяце. Неактивные профили не считаются.</p>
        </header>
        <div className="student-free-note"><Icon name="users" /><span><strong>Для ученика — 0 ₽</strong>Всегда и независимо от тарифа тренера.</span></div>
        <div className="price-tier-grid">
          <article><span>СТАРТ</span><strong>0 ₽<small>/ месяц</small></strong><p><b>1</b> активный ученик</p></article>
          <article className="featured"><span>ПРАКТИКА</span><strong>499 ₽<small>/ месяц</small></strong><p><b>2–5</b> активных учеников</p><i>Для частного тренера</i></article>
          <article><span>КОМАНДА</span><strong>990 ₽<small>/ месяц</small></strong><p><b>6–15</b> активных учеников</p></article>
          <article><span>СТУДИЯ</span><strong>1 490 ₽<small>/ месяц</small></strong><p><b>16+</b> активных учеников</p></article>
        </div>
        <p className="pricing-footnote">Внутри диапазона цена фиксирована. При изменении команды тариф автоматически обновится со следующего месяца.</p>
      </section>

      <section className="landing-cta">
        {accountMode
          ? <div><p className="eyebrow">Уже с нами?</p><h2>ВЕРНИСЬ К ТРЕНИРОВКАМ.</h2><p>Войди в аккаунт — расписание, ученики и результаты уже ждут в твоём кабинете.</p></div>
          : <div><p className="eyebrow">Посмотри вживую</p><h2>ПРОЙДИ ПУТЬ ТРЕНЕРА И УЧЕНИКА.</h2><p>Демо уже заполнено примерами: можно назначить тренировку, выполнить её и проверить результат с обеих сторон.</p></div>}
        <button className="primary-button" type="button" onClick={onLogin}><Icon name="arrow-right" /> {accountMode ? 'Войти в аккаунт' : 'Открыть демо'}</button>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <button className="brand-mark brand-button" type="button" onClick={() => go('/')} aria-label="REPPY — на стартовый экран">
      <img className="brand-logo" src="logo-wordmark.png" alt="" />
    </button>
  );
}

function PageHeader({ eyebrow, preserveEyebrowCase = false, title, action, back }: { eyebrow?: string; preserveEyebrowCase?: boolean; title: string; action?: ReactNode; back?: string }) {
  return <SharedPageHeader eyebrow={eyebrow} preserveEyebrowCase={preserveEyebrowCase} title={title} action={action} onBack={back ? () => goBack(back) : undefined} />;
}

function WorkoutCalendar({ data, area }: { data: DemoState; area: 'trainer' | 'student' }) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
  const [assignDate, setAssignDate] = useState<string | null>(null);
  const assignments = data.assignments
    .filter((item) => area === 'trainer' || item.studentId === data.activeStudentId)
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const assignmentCounts = assignments.reduce((counts, assignment) => {
    counts.set(assignment.scheduledFor, (counts.get(assignment.scheduledFor) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const selectedAssignments = assignments.filter((item) => item.scheduledFor === selectedDay);
  const selectedTitle = formatScheduleDay(selectedDay);

  return (
    <main className="content-page calendar-page">
      <MonthDatePicker
        value={selectedDay}
        onChange={setSelectedDay}
        markedDates={assignmentCounts}
        selectFirstDayOnMonthChange
        dateAriaLabel={(day, count) => {
          const fullDate = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(day);
          return `${fullDate}. ${count ? `Тренировок: ${count}` : 'Тренировок нет'}`;
        }}
      />

      <section className="calendar-agenda">
        <div className="section-heading">
          <h2>{selectedTitle}</h2>
          {area === 'trainer' && isScheduleDate(selectedDay) && <button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${selectedTitle}`} onClick={() => setAssignDate(selectedDay)}><Icon name="plus" /></button>}
        </div>
        {selectedAssignments.length ? <div className="agenda-list">{selectedAssignments.map((assignment) => {
          const student = findStudent(data, assignment.studentId);
          const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
          const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
          const target = area === 'trainer'
            ? session ? `/trainer/sessions/${session.id}` : `/trainer/assignments/${assignment.id}`
            : session ? `/student/history/${session.id}` : `/student/assignments/${assignment.id}`;
          return (
            <button key={assignment.id} type="button" onClick={() => go(target)}>
              <span className={`agenda-status ${assignment.status}`}><Icon name={assignment.status === 'completed' ? 'check' : 'workout'} /></span>
              <div><strong>{area === 'trainer' ? student?.name : workout?.name}</strong><small>{assignmentTimeLabel(assignment)} · {area === 'trainer' ? workout?.name : exercisePreview(workout)}</small>{session?.comment && <p>«{session.comment}»</p>}</div>
              <span className="agenda-tail">{assignment.status === 'completed' && <b>{session?.mood ? moodLabel(session.mood) : 'Готово'}</b>}<Icon name="chevron-right" /></span>
            </button>
          );
        })}</div> : <EmptyState icon="calendar" title="Свободный день" text={area === 'trainer' ? 'У команды нет тренировок в этот день.' : 'На этот день тренировка не запланирована.'} />}
      </section>
      {assignDate && <ScheduleStudentPicker
        date={assignDate}
        students={data.students}
        onClose={() => setAssignDate(null)}
        onSelect={(student) => {
          setAssignDate(null);
          go(`/trainer/schedule/${assignDate}/${student.id}`);
        }}
      />}
    </main>
  );
}

function planDayParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const monthWithDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .formatToParts(date)
    .find((part) => part.type === 'month')?.value ?? '';
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date),
    month: monthWithDay,
    weekday: new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date),
  };
}

function formatScheduleDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date).replace(/\s*г\.$/, '');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value && value >= dateKey();
}

function dateAfter(value: string, days: number) {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}

function assignmentSortValue(assignment: Assignment) {
  return `${assignment.scheduledFor} ${assignment.scheduledTime ?? '23:59'}`;
}

function assignmentTimeLabel(assignment: Assignment) {
  return assignment.format === 'online' ? 'Онлайн' : assignment.scheduledTime ?? 'Без времени';
}

function assignmentScheduleLabel(assignment: Assignment) {
  return `${formatCalendarDay(assignment.scheduledFor)} · ${assignmentTimeLabel(assignment)}`;
}

function assignmentDateTime(assignment: Assignment) {
  return assignment.scheduledTime ? `${assignment.scheduledFor}T${assignment.scheduledTime}` : assignment.scheduledFor;
}

function TrainerPlanRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
  const completed = assignment.status === 'completed' || Boolean(session);
  const target = completed
    ? session ? `/trainer/sessions/${session.id}` : `/trainer/clients/${assignment.studentId}`
    : `/trainer/assignments/${assignment.id}`;

  return (
    <button className={`plan-session-row ${assignment.format === 'online' ? 'online' : ''}`} type="button" onClick={() => go(target)} aria-label={`${student?.name}, ${assignmentTimeLabel(assignment)}, ${workout?.name}${completed ? ', тренировка завершена' : ''}`}>
      <time dateTime={assignmentDateTime(assignment)}>{assignmentTimeLabel(assignment)}</time>
      <Avatar student={student} />
      <span><strong>{student?.name}</strong><small>{workout?.name}</small></span>
      <span className="plan-session-status">{completed && <Icon name="check" />}<Icon name="chevron-right" /></span>
    </button>
  );
}

function ScheduleStudentPicker({ date, students, onClose, onSelect }: { date: string; students: Student[]; onClose: () => void; onSelect: (student: Student) => void }) {
  return (
    <ModalFrame
      title="Выбери ученика"
      eyebrow={formatScheduleDay(date)}
      className="schedule-student-picker"
      ariaLabel={`Кого назначить на ${formatScheduleDay(date)}`}
      closeLabel="Закрыть выбор ученика"
      onClose={onClose}
    >
      {students.length ? <div className="schedule-student-list">{students.map((student) => (
        <button key={student.id} type="button" disabled={student.status === 'invited'} onClick={() => onSelect(student)}>
          <Avatar student={student} />
          <span><strong>{student.name}</strong><small>{student.status === 'invited' ? 'Сначала ученик должен принять приглашение' : 'Выбрать тренировки'}</small></span>
          <Icon name="chevron-right" />
        </button>
      ))}</div> : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </ModalFrame>
  );
}

function TrainerHome({ data }: { data: DemoState }) {
  const [showAllDays, setShowAllDays] = useState(loadAllDaysPreference);
  const [assignDate, setAssignDate] = useState<string | null>(null);
  const todayKey = dateKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const horizonKey = dateKey(horizon);
  const upcoming = data.assignments
    .filter((item) => item.scheduledFor >= todayKey && item.scheduledFor <= horizonKey)
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const todayAssignments = upcoming.filter((item) => item.scheduledFor === todayKey);
  const futureAssignments = upcoming.filter((item) => item.scheduledFor !== todayKey);
  const pendingRequests = data.assignments.filter((item) => item.rescheduleRequest);
  const futureDays = Array.from({ length: 14 }, (_, index) => {
    const date = dateAfter(todayKey, index + 1);
    return { date, assignments: futureAssignments.filter((item) => item.scheduledFor === date) };
  });
  const visibleFutureDays = showAllDays ? futureDays : futureDays.filter((day) => day.assignments.length > 0);
  const startAssignment = (date: string) => setAssignDate(date);
  const toggleAllDays = () => setShowAllDays((current) => {
    const next = !current;
    saveAllDaysPreference(next);
    return next;
  });

  return (
    <main className="content-page trainer-home-page">
      {pendingRequests.length > 0 && <section className="reschedule-inbox">
        <div className="section-heading"><h2>Запросы на перенос</h2></div>
        <div className="connected-list">{pendingRequests.map((assignment) => {
          const student = findStudent(data, assignment.studentId);
          const request = assignment.rescheduleRequest;
          return <button className="reschedule-notification-row" key={assignment.id} type="button" onClick={() => go(`/trainer/assignments/${assignment.id}`)}><span><Icon name="calendar" /></span><div><strong>{student?.name}</strong><small>{request ? `${formatScheduleDay(request.scheduledFor)} · ${request.scheduledTime}` : ''}</small></div><Icon name="chevron-right" /></button>;
        })}</div>
      </section>}

      <section className="today-schedule">
        <header>
          <div><h2>СЕГОДНЯ</h2><p>{formatScheduleDay(todayKey)}</p></div>
          {todayAssignments.length > 0 && <button className="schedule-add-button on-light" type="button" aria-label="Назначить тренировку на сегодня" onClick={() => startAssignment(todayKey)}><Icon name="plus" /></button>}
        </header>
        {todayAssignments.length ? (
          <div className="today-session-list">{todayAssignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</div>
        ) : <button className="today-empty" type="button" onClick={() => startAssignment(todayKey)}><Icon name="plus" /><strong>Тренировок нет</strong><small>Назначить ученика</small></button>}
      </section>

      <section className="future-schedule">
        <div className="future-schedule-heading">
          <div><h2>Дальше</h2><p>Ближайшие две недели</p></div>
          <button className={`schedule-view-toggle ${showAllDays ? 'active' : ''}`} type="button" role="switch" aria-checked={showAllDays} onClick={toggleAllDays}>
            <span className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></span>
            <strong>Все дни</strong>
            <span className="toggle-track" aria-hidden="true"><i /></span>
          </button>
        </div>
        {visibleFutureDays.length ? (
          <div className="schedule-days-list">{visibleFutureDays.map((day) => {
            const parts = planDayParts(day.date);
            if (!day.assignments.length) return (
              <article className="plan-day-card empty-day" key={day.date}>
                <button className="empty-day-action" type="button" aria-label={`Назначить ученика на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}>
                  <time className="plan-day-date" dateTime={day.date}><strong>{parts.day}</strong><span><b>{parts.month}</b><small>{parts.weekday}</small></span></time>
                  <span className="empty-day-plus"><Icon name="plus" /></span>
                </button>
              </article>
            );
            return <article className="plan-day-card" key={day.date}>
              <header>
                <time className="plan-day-date" dateTime={day.date}><strong>{parts.day}</strong><span><b>{parts.month}</b><small>{parts.weekday}</small></span></time>
                <button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}><Icon name="plus" /></button>
              </header>
              <div className="day-session-list">{day.assignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</div>
            </article>;
          })}</div>
        ) : <EmptyState icon="calendar" title="Остальные дни свободны" text="На ближайшие две недели больше ничего не назначено." />}
      </section>
      {assignDate && <ScheduleStudentPicker
        date={assignDate}
        students={data.students}
        onClose={() => setAssignDate(null)}
        onSelect={(student) => {
          setAssignDate(null);
          go(`/trainer/schedule/${assignDate}/${student.id}`);
        }}
      />}
    </main>
  );
}

function ClientsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page">
      <button className="list-primary-action" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить ученика</button>
      <section className="client-grid">
        {data.students.map((student) => {
          const subscriptionEntries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
          const balance = subscriptionBalance(data.subscriptionEntries, student.id);
          const assigned = data.assignments
            .filter((item) => item.studentId === student.id && item.status === 'assigned')
            .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)))[0];
          const recent = [...data.sessions].reverse().find((item) => item.studentId === student.id && item.completedAt);
          const status = student.status === 'invited'
            ? 'Ожидает приглашения'
            : assigned
              ? `${assignmentScheduleLabel(assigned)} · ${findAssignmentWorkout(data, assigned)?.name}`
              : recent
                ? `Завершил · ${findSessionWorkout(data, recent)?.name}`
                : 'Нет назначений';
          return (
            <button className="client-card" key={student.id} type="button" onClick={() => go(`/trainer/clients/${student.id}`)}>
              <Avatar student={student} />
              <span><strong>{student.name}</strong><small>{status}</small><b className={`client-subscription ${subscriptionTone(balance, subscriptionEntries.length > 0)}`}>{subscriptionBalanceLabel(balance, subscriptionEntries.length > 0)}</b></span>
              <i><Icon name="chevron-right" /></i>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function Avatar({ student, large = false }: { student?: Student; large?: boolean }) {
  return <span className={`person-avatar ${student?.color ?? 'lime'} ${large ? 'large' : ''}`}>{student ? initials(student.name) : '?'}</span>;
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
      {trainerView && <div className="student-profile-intro"><PageHeader back="/trainer/clients" title={student.name.toUpperCase()} /><AthleteDetails student={student} onSave={onUpdate} compact /></div>}
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

function SubscriptionHistory({ data, student }: { data: DemoState; student: Student }) {
  const entries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
  const balance = subscriptionBalance(data.subscriptionEntries, student.id);
  const hasEntries = entries.length > 0;
  const balanceAfter = new Map<string, number>();
  let runningBalance = 0;
  [...entries].reverse().forEach((entry) => {
    runningBalance += entry.lessonDelta;
    balanceAfter.set(entry.id, runningBalance);
  });
  return (
    <main className="content-page narrow-page subscription-history-page">
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={student.name} title="ИСТОРИЯ АБОНЕМЕНТА" />
      <section className={`subscription-history-summary ${subscriptionTone(balance, hasEntries)}`}>
        <span>ТЕКУЩИЙ БАЛАНС</span>
        <strong>{subscriptionBalanceLabel(balance, hasEntries)}</strong>
        <ActionButton icon="plus" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>Добавить пополнение</ActionButton>
      </section>
      {entries.length ? <section className="subscription-entry-list" aria-label="Операции абонемента">
        {entries.map((entry) => {
          const isPayment = entry.kind === 'payment';
          const title = isPayment
            ? `Пополнение на ${entry.lessonDelta} ${lessonWord(entry.lessonDelta)}`
            : entry.kind === 'session-refund'
              ? 'Возврат занятия'
              : 'Занятие списано';
          const detail = isPayment
            ? `${formatRubles(entry.amountRub)} · ${paymentMethodLabel(entry.paymentMethod)}`
            : entry.workoutName ?? 'Тренировка';
          const content = <>
            <span className={`subscription-entry-delta ${entry.lessonDelta > 0 ? 'positive' : 'negative'}`}>{entry.lessonDelta > 0 ? '+' : ''}{entry.lessonDelta}</span>
            <div><strong>{title}</strong><small>{detail} · {formatSubscriptionDate(entry.occurredAt)}</small>{entry.comment && <p>{entry.comment}</p>}<i>Баланс после операции: {balanceAfter.get(entry.id)}</i></div>
            {isPayment && <Icon name="edit" />}
          </>;
          return isPayment
            ? <button key={entry.id} type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/payments/${entry.id}`)}>{content}</button>
            : <article key={entry.id}>{content}</article>;
        })}
      </section> : <EmptyState icon="history" title="История пока пуста" text="Добавь первое пополнение абонемента." />}
    </main>
  );
}

function DesignKitScreen() {
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [toggleActive, setToggleActive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <main className="content-page narrow-page design-kit-page">
      <PageHeader back="/trainer" eyebrow="Внутренний экран" title="ДИЗАЙН-КИТ" />
      <p className="design-kit-intro">Контрольная страница основных элементов REPPY. Она не входит в рабочую навигацию и нужна для согласования размеров, состояний и будущих тем.</p>

      <section className="design-kit-section" aria-labelledby="kit-colors-title">
        <div className="section-heading"><h2 id="kit-colors-title">Цвета и поверхности</h2><span>Токены темы</span></div>
        <div className="design-kit-swatches" role="list">
          <div role="listitem"><i className="kit-color-background" /><span><strong>Фон</strong><small>--app-bg</small></span></div>
          <div role="listitem"><i className="kit-color-surface" /><span><strong>Поверхность</strong><small>--surface</small></span></div>
          <div role="listitem"><i className="kit-color-raised" /><span><strong>Выше фона</strong><small>--surface-2</small></span></div>
          <div role="listitem"><i className="kit-color-text" /><span><strong>Текст</strong><small>--text-primary</small></span></div>
          <div role="listitem"><i className="kit-color-muted" /><span><strong>Вторичный</strong><small>--muted</small></span></div>
          <div role="listitem"><i className="kit-color-accent" /><span><strong>Акцент</strong><small>--lime</small></span></div>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-type-title">
        <div className="section-heading"><h2 id="kit-type-title">Типографика</h2><span>Основные уровни</span></div>
        <div className="design-kit-type-samples">
          <p className="eyebrow">Служебная подпись</p>
          <h2>Заголовок секции</h2>
          <p>Основной текст интерфейса для коротких объяснений и значимых сообщений.</p>
          <small>Вторичный текст и уточнение состояния.</small>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-actions-title">
        <div className="section-heading"><h2 id="kit-actions-title">Действия</h2><span>Обычные и опасные</span></div>
        <div className="design-kit-button-grid">
          <ActionButton icon="plus">Основное действие</ActionButton>
          <ActionButton variant="secondary" icon="edit">Вторичное действие</ActionButton>
          <ActionButton variant="danger" icon="trash">Опасное действие</ActionButton>
          <ActionButton variant="secondary" icon="check" disabled>Недоступно</ActionButton>
        </div>
        <div className="design-kit-compact-row">
          <button className="schedule-add-button" type="button" aria-label="Добавить"><Icon name="plus" /></button>
          <button className={`schedule-view-toggle ${toggleActive ? 'active' : ''}`} type="button" role="switch" aria-checked={toggleActive} onClick={() => setToggleActive((current) => !current)}>
            <span className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></span><strong>Переключатель</strong><span className="toggle-track" aria-hidden="true"><i /></span>
          </button>
          <ActionButton variant="secondary" className="design-kit-modal-button" onClick={() => setModalOpen(true)}>Открыть модалку</ActionButton>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-fields-title">
        <div className="section-heading"><h2 id="kit-fields-title">Поля</h2><span>Общие размеры</span></div>
        <TextField id="kit-name" label="Название тренировки" defaultValue="Грудь и плечи" />
        <WorkoutScheduleFields scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <label className="design-kit-textarea-field"><span>Комментарий</span><textarea defaultValue="Держи лопатки сведёнными" /></label>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-states-title">
        <div className="section-heading"><h2 id="kit-states-title">Состояния</h2><span>Короткие статусы</span></div>
        <div className="design-kit-statuses"><span>Запланирована</span><span className="completed">Завершена</span><span className="attention">Требует внимания</span></div>
        <div className="design-kit-system-states" aria-label="Системные состояния">
          <AppStatusBanner phase="loading" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="saving" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="idle" online={false} onRetry={() => undefined} preview />
          <AppStatusBanner phase="error" online onRetry={() => undefined} preview />
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-exercise-title">
        <div className="section-heading"><h2 id="kit-exercise-title">Карточка упражнения</h2><span>Эталон порядка</span></div>
        <section className="readonly-exercise-list" aria-label="Пример упражнения">
          <article className="readonly-exercise-card">
            <header><span>01</span><div><h2>Жим лёжа</h2><small>Грудь · Штанга</small></div></header>
            <div className="readonly-set-list"><p><span>Подход 1</span><strong>80 кг × 8</strong></p><p><span>Подход 2</span><strong>80 кг × 8</strong></p></div>
            <p className="readonly-coach-note"><Icon name="edit" /> Держи лопатки сведёнными</p>
            <ActionButton variant="secondary" className="exercise-progress-button" icon="history">Прогресс упражнения</ActionButton>
          </article>
        </section>
      </section>

      {modalOpen && <ConfirmationModal title="Пример модального окна" text="Здесь проверяются фон, отступы, кнопки и контраст модального слоя." confirmLabel="Подтвердить" onClose={() => setModalOpen(false)} onConfirm={() => setModalOpen(false)} />}
    </main>
  );
}

function SubscriptionPaymentForm({
  student,
  initial,
  defaults,
  onSave,
}: {
  student: Student;
  initial?: SubscriptionEntry;
  defaults?: SubscriptionEntry;
  onSave: (input: PaymentInput) => void;
}) {
  const source = initial ?? defaults;
  const [lessons, setLessons] = useState(String(source?.lessonDelta ?? 8));
  const [amountRub, setAmountRub] = useState(String(source?.amountRub ?? 11400));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(source?.paymentMethod ?? 'cash');
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt.slice(0, 10) ?? dateKey());
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [error, setError] = useState('');
  const save = () => {
    const parsedLessons = Number(lessons);
    const parsedAmount = Number(amountRub);
    if (!Number.isInteger(parsedLessons) || parsedLessons <= 0) return setError('Укажи целое количество занятий больше нуля.');
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return setError('Укажи корректную стоимость.');
    if (!occurredAt) return setError('Укажи дату оплаты.');
    onSave({ lessons: parsedLessons, amountRub: parsedAmount, paymentMethod, occurredAt, comment });
  };
  return (
    <main className="content-page narrow-page subscription-payment-page">
      <PageHeader back={initial ? `/trainer/clients/${student.id}/subscription` : `/trainer/clients/${student.id}`} eyebrow={student.name} title={initial ? 'ИСПРАВИТЬ ПОПОЛНЕНИЕ' : 'ДОБАВИТЬ АБОНЕМЕНТ'} />
      <section className="subscription-payment-form">
        <div className="subscription-form-grid">
          <label><span>Количество занятий</span><input type="number" min="1" step="1" inputMode="numeric" value={lessons} onChange={(event) => { setLessons(event.target.value); setError(''); }} /></label>
          <label><span>Стоимость, ₽</span><input type="number" min="0" step="1" inputMode="numeric" value={amountRub} onChange={(event) => { setAmountRub(event.target.value); setError(''); }} /></label>
        </div>
        <fieldset className="payment-method-field">
          <legend>Способ оплаты</legend>
          <div>
            <button type="button" className={paymentMethod === 'cash' ? 'selected' : ''} aria-pressed={paymentMethod === 'cash'} onClick={() => setPaymentMethod('cash')}><Icon name={paymentMethod === 'cash' ? 'check' : 'circle'} /> Наличные</button>
            <button type="button" className={paymentMethod === 'transfer' ? 'selected' : ''} aria-pressed={paymentMethod === 'transfer'} onClick={() => setPaymentMethod('transfer')}><Icon name={paymentMethod === 'transfer' ? 'check' : 'circle'} /> Перевод</button>
          </div>
        </fieldset>
        <DatePickerField label="Дата оплаты" value={occurredAt} onChange={(value) => { setOccurredAt(value); setError(''); }} />
        <label><span>Комментарий <small>необязательно</small></span><textarea maxLength={240} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: второе пополнение за месяц" /><i>{comment.length}/240</i></label>
        {error && <FormError>{error}</FormError>}
        <ActionButton icon="check" onClick={save}>{initial ? 'Сохранить изменения' : 'Добавить пополнение'}</ActionButton>
      </section>
    </main>
  );
}

function AthleteDetails({ student, onSave, alwaysExpanded = false, compact = false }: { student: Student; onSave: (student: Student) => void; alwaysExpanded?: boolean; compact?: boolean }) {
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const [editing, setEditing] = useState(false);
  const [height, setHeight] = useState(student.height ? String(student.height) : '');
  const [weight, setWeight] = useState(student.weight ? String(student.weight) : '');
  const [gender, setGender] = useState<Student['gender']>(student.gender ?? 'not-specified');
  const [phone, setPhone] = useState(student.phone ?? '');
  const [contraindications, setContraindications] = useState(student.contraindications ?? '');
  const genderLabel = gender === 'male' ? 'Мужской' : gender === 'female' ? 'Женский' : 'Не указан';

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
    setEditing(false);
  };

  return (
    <section className={`athlete-details section-block ${compact ? 'athlete-details-compact' : ''} ${alwaysExpanded ? 'always-expanded' : ''}`}>
      {compact ? <div className="athlete-inline-summary"><div><p>{[student.height ? `${student.height} см` : '', student.weight ? `${student.weight} кг` : '', student.gender && student.gender !== 'not-specified' ? genderLabel : '', student.phone].filter(Boolean).join(' · ') || 'Данные ученика не заполнены'}</p><p>Ограничения: {student.contraindications || 'не указаны'}</p></div><button type="button" className="wide-secondary athlete-edit-icon" aria-label="Редактировать данные ученика" title="Редактировать данные" aria-expanded={editing} onClick={() => { if (editing) { setEditing(false); return; } setHeight(student.height ? String(student.height) : ''); setWeight(student.weight ? String(student.weight) : ''); setGender(student.gender ?? 'not-specified'); setPhone(student.phone ?? ''); setContraindications(student.contraindications ?? ''); setEditing(true); }}><Icon name="edit" /></button></div> : <div className="section-heading"><h2>Данные и ограничения</h2>{!alwaysExpanded && <button type="button" aria-expanded={expanded} onClick={() => { setExpanded((current) => !current); setEditing(false); }}>{expanded ? 'Скрыть' : 'Показать'}</button>}</div>}
      {(compact ? editing : expanded) && (editing ? <div className="athlete-form">
        <div className="athlete-form-grid">
          <label><span>Рост, см</span><input type="number" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="182" /></label>
          <label><span>Вес, кг</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="86" /></label>
        </div>
        <label><span>Пол</span><select value={gender} onChange={(event) => setGender(event.target.value as Student['gender'])}><option value="not-specified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
        <label><span>Мобильный телефон</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" /></label>
        <label><span>Противопоказания и особенности</span><textarea value={contraindications} onChange={(event) => setContraindications(event.target.value)} maxLength={800} placeholder="Например: протрузия поясничного отдела, грыжа, болит левое запястье…" /><small>Опиши всё, что тренеру важно учитывать при составлении плана.</small></label>
        <ActionButton icon="check" onClick={save}>Сохранить данные</ActionButton>
        {compact && <ActionButton variant="secondary" onClick={() => setEditing(false)}>Отмена</ActionButton>}
      </div> : <><button className="details-edit-button" type="button" onClick={() => setEditing(true)}><Icon name="edit" /> Редактировать данные</button><div className="athlete-summary">
        <div><span>Рост</span><strong>{student.height ? `${student.height} см` : 'Не указан'}</strong></div>
        <div><span>Вес</span><strong>{student.weight ? `${student.weight} кг` : 'Не указан'}</strong></div>
        <div><span>Пол</span><strong>{genderLabel}</strong></div>
        <div><span>Телефон</span><strong>{student.phone || 'Не указан'}</strong></div>
        <article><span>Противопоказания и особенности</span><p>{student.contraindications || 'Не указаны'}</p></article>
      </div></>)}
    </section>
  );
}

function InviteStudent({
  onCreate,
  onInvite,
}: {
  onCreate: (student: Student) => void;
  onInvite?: (name: string, email: string) => Promise<{ student: Student; token: string; expiresAt: string }>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ student: Student; token?: string; expiresAt?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteUrl = created && typeof window !== 'undefined'
    ? created.token
      ? `${window.location.origin}${window.location.pathname}#/invite/${encodeURIComponent(created.token)}`
      : `${window.location.origin}${window.location.pathname}#/invite/${created.student.id}/${encodeURIComponent(created.student.name)}`
    : '';

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      if (onInvite) {
        const invitation = await onInvite(clean, email);
        setCreated(invitation);
        return;
      }
      const student: Student = { id: makeId('student'), name: clean, status: 'invited', color: 'orange' };
      onCreate(student);
      setCreated({ student });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать приглашение.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back="/trainer/clients" eyebrow="Новый участник команды" title={created ? 'ССЫЛКА ГОТОВА' : 'ПРИГЛАСИТЬ УЧЕНИКА'} />
      {!created ? (
        <section className="form-card">
          <TextField id="student-name" label="Имя ученика" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Сергей" autoFocus />
          {onInvite && <TextField id="student-email" label="Email ученика" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" />}
          <p className="field-hint">Мы добавим ученика в список со статусом «Ожидает приглашения».</p>
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="arrow-right" disabled={busy || !name.trim() || Boolean(onInvite && !email.trim())} onClick={() => void create()}>{busy ? 'Создаём…' : 'Продолжить'}</ActionButton>
        </section>
      ) : (
        <section className="invite-ready">
          <div className="success-mark"><Icon name="arrow-up-right" /></div>
          <h2>{created.student.name} почти в команде</h2>
          <p>Отправь эту ссылку ученику. Она привязана к указанному email{created.expiresAt ? ` и действует до ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(created.expiresAt))}` : ''}.</p>
          <output>{inviteUrl}</output>
          <ActionButton icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</ActionButton>
          <ActionButton variant="secondary" icon="check" onClick={() => go('/trainer/clients')}>Готово</ActionButton>
        </section>
      )}
    </main>
  );
}

function StudentWorkoutHistory({
  data,
  student,
  scheduledFor,
  backPath,
  routeBase,
}: {
  data: DemoState;
  student: Student;
  scheduledFor: string;
  backPath: string;
  routeBase: string;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const previousAssignments = data.assignments
    .filter((assignment) => assignment.studentId === student.id)
    .sort((a, b) => {
      const aCompleted = a.status === 'completed' || data.sessions.some((session) => session.assignmentId === a.id && session.completedAt);
      const bCompleted = b.status === 'completed' || data.sessions.some((session) => session.assignmentId === b.id && session.completedAt);
      if (aCompleted !== bCompleted) return aCompleted ? -1 : 1;
      return assignmentSortValue(b).localeCompare(assignmentSortValue(a));
    });
  const visibleAssignments = showAllHistory ? previousAssignments : previousAssignments.slice(0, 8);

  return (
    <main className="content-page workout-picker-page schedule-workout-picker-page">
      <PageHeader back={backPath} eyebrow={`${student.name} · ${formatScheduleDay(scheduledFor)}`} preserveEyebrowCase title="ВЫБРАТЬ ТРЕНИРОВКУ" />
      <p className="page-lead">Повтори одну из тренировок {student.name} или собери новую с нуля.</p>
      <button className="list-primary-action" type="button" onClick={() => go(`${routeBase}/new`)}><Icon name="plus" /> {COPY.createWorkout}</button>
      {previousAssignments.length ? (
        <>
        <section className="workout-history-list schedule-history-list" aria-label={`Ранее назначенные тренировки ${student.name}`}>
          {visibleAssignments.map((assignment) => {
            const workout = workoutForRepeat(data, assignment);
            if (!workout) return null;
            const completed = assignment.status === 'completed' || data.sessions.some((session) => session.assignmentId === assignment.id && session.completedAt);
            const overdue = !completed && assignment.scheduledFor < dateKey();
            const statusLabel = completed ? 'Завершена' : overdue ? 'Не завершена' : 'Запланирована';
            return (
              <button className="workout-history-row" key={assignment.id} type="button" onClick={() => go(`${routeBase}/copy/${assignment.id}`)}>
                <span className="history-copy-icon"><Icon name="copy" /></span>
                <div><h2>{workout.name}</h2><p><b className={`history-status ${completed ? 'completed' : overdue ? 'overdue' : ''}`}>{statusLabel}</b>{assignmentScheduleLabel(assignment)} · {exercisePreview(workout, true)}</p></div>
                <Icon name="chevron-right" />
              </button>
            );
          })}
        </section>
        {previousAssignments.length > 8 && <ActionButton variant="secondary" className="history-show-more" onClick={() => setShowAllHistory((current) => !current)}>{showAllHistory ? 'Показать последние' : `Показать ещё ${previousAssignments.length - 8}`}</ActionButton>}
        </>
      ) : <EmptyState icon="history" title="Предыдущих тренировок нет" text="Создай первую тренировку для этого ученика — позже её можно будет повторять на новые даты." />}
    </main>
  );
}

type WorkoutComposerValue = {
  name: string;
  scheduledFor?: string;
  scheduledTime?: string;
  format: TrainingFormat;
  exercises: WorkoutExercise[];
};

function TrainingFormatField({ value, onChange }: { value: TrainingFormat; onChange: (value: TrainingFormat) => void }) {
  return (
    <fieldset className="training-format-field">
      <legend>Формат</legend>
      <div>
        <button type="button" className={value === 'in-person' ? 'selected' : ''} aria-pressed={value === 'in-person'} onClick={() => onChange('in-person')}>Очно</button>
        <button type="button" className={value === 'online' ? 'selected' : ''} aria-pressed={value === 'online'} onClick={() => onChange('online')}>Онлайн</button>
      </div>
      {value === 'online' && <p>Ученик выполнит тренировку самостоятельно в удобное время.</p>}
    </fieldset>
  );
}

type WorkoutComposerDangerAction = {
  label: string;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
};

function WorkoutComposer({
  title,
  eyebrow,
  backPath,
  student,
  workoutLabel,
  initialName,
  nameEditable = false,
  nameInputId = 'workout-name',
  nameAutoFocus = false,
  initialScheduledFor,
  initialScheduledTime,
  initialFormat = 'in-person',
  dateLabel,
  timeLabel,
  contextClassName,
  largeStudentAvatar = false,
  initialExercises,
  submitLabel,
  submitIcon,
  submitClassName = 'plan-submit-button',
  disableSubmitUntilReady = true,
  dangerAction,
  onSubmit,
}: {
  title: string;
  eyebrow: string;
  backPath: string;
  student: Student;
  workoutLabel?: string;
  initialName: string;
  nameEditable?: boolean;
  nameInputId?: string;
  nameAutoFocus?: boolean;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  dateLabel?: string;
  timeLabel?: string;
  contextClassName?: string;
  largeStudentAvatar?: boolean;
  initialExercises: WorkoutExercise[];
  submitLabel: string;
  submitIcon: IconName;
  submitClassName?: string;
  disableSubmitUntilReady?: boolean;
  dangerAction?: WorkoutComposerDangerAction;
  onSubmit: (value: WorkoutComposerValue) => void;
}) {
  const hasSchedule = initialScheduledFor !== undefined;
  const [name, setName] = useState(initialName);
  const [scheduledFor, setScheduledFor] = useState(initialScheduledFor);
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime);
  const [format, setFormat] = useState<TrainingFormat>(initialFormat);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => initialExercises.map((exercise) => ({ ...exercise })));
  const [error, setError] = useState('');
  const [dangerOpen, setDangerOpen] = useState(false);
  const [initialFormState] = useState(() => JSON.stringify({ name: initialName, scheduledFor: initialScheduledFor, scheduledTime: initialScheduledTime, format: initialFormat, exercises: initialExercises }));
  const currentFormState = JSON.stringify({ name, scheduledFor, scheduledTime, format, exercises });
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(currentFormState !== initialFormState);
  const ready = Boolean(name.trim() && exercises.length && (!hasSchedule || (scheduledFor && (format === 'online' || scheduledTime))));

  const clearError = () => setError('');
  const submit = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (hasSchedule && !scheduledFor) return setError('Укажи рекомендованную дату тренировки.');
    if (hasSchedule && format === 'in-person' && !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    allowNextNavigation();
    onSubmit({
      name: name.trim(),
      scheduledFor,
      scheduledTime: format === 'online' ? undefined : scheduledTime,
      format,
      exercises: exercises.map((exercise) => ({ ...exercise })),
    });
  };

  const nameField = nameEditable ? <TextField id={nameInputId} label="Название тренировки" value={name} onChange={(event) => { setName(event.target.value); clearError(); }} placeholder="Например, Грудь + плечи" autoFocus={nameAutoFocus} /> : null;

  return (
    <main className="content-page narrow-page" data-workout-composer>
      <PageHeader back={backPath} eyebrow={eyebrow} title={title} />
      <section className={`plan-context-card ${contextClassName ?? 'assignment-edit-card'}`}>
        <div className="assignment-edit-person"><Avatar student={student} large={largeStudentAvatar} /><div><span>УЧЕНИК</span><strong>{student.name}</strong>{workoutLabel && <p>{workoutLabel}</p>}</div></div>
        {nameField}
        {hasSchedule && <TrainingFormatField value={format} onChange={(value) => { setFormat(value); clearError(); }} />}
        {hasSchedule && <WorkoutScheduleFields dateLabel={format === 'online' ? 'Рекомендованная дата' : dateLabel} timeLabel={timeLabel} scheduledFor={scheduledFor ?? ''} scheduledTime={scheduledTime} showTime={format === 'in-person'} onDateChange={(value) => { setScheduledFor(value); clearError(); }} onTimeChange={(value) => { setScheduledTime(value); clearError(); }} />}
      </section>
      <WorkoutExerciseEditor studentId={student.id} exercises={exercises} onChange={(next) => { setExercises(next); clearError(); }} />
      {error && <FormError>{error}</FormError>}
      {dangerAction && <ActionButton variant="danger" icon="trash" className="plan-delete-button" onClick={() => setDangerOpen(true)}>{dangerAction.label}</ActionButton>}
      <div className="plan-submit-actions"><ActionButton icon={submitIcon} className={submitClassName} disabled={disableSubmitUntilReady && !ready} onClick={submit}>{submitLabel}</ActionButton></div>
      {dangerOpen && dangerAction && <ConfirmationModal
        title={dangerAction.title}
        text={dangerAction.text}
        confirmLabel={dangerAction.confirmLabel}
        danger
        onClose={() => setDangerOpen(false)}
        onConfirm={() => {
          allowNextNavigation();
          setDangerOpen(false);
          dangerAction.onConfirm();
        }}
      />}
      {discardPrompt}
    </main>
  );
}

function AssignWorkoutToStudent({
  student,
  workout,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
  initialFormat = 'in-person',
  backPath,
  title = 'НАЗНАЧИТЬ ТРЕНИРОВКУ',
  submitLabel,
  submitIcon = 'plus',
  onAssign,
}: {
  student: Student;
  workout: Workout;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  backPath?: string;
  title?: string;
  submitLabel?: string;
  submitIcon?: IconName;
  onAssign: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workoutSnapshot: Workout) => void;
}) {
  return (
    <WorkoutComposer
      title={title}
      eyebrow={student.name}
      backPath={backPath ?? `/trainer/clients/${student.id}/assign`}
      student={student}
      workoutLabel={workout.name}
      initialName={workout.name}
      initialScheduledFor={initialScheduledFor}
      initialScheduledTime={initialScheduledTime}
      initialFormat={initialFormat}
      initialExercises={workout.exercises}
      submitLabel={submitLabel ?? `Назначить ${student.name}`}
      submitIcon={submitIcon}
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => onAssign(scheduledFor!, scheduledTime, format, {
        ...cloneWorkout(workout),
        exercises,
        updatedAt: new Date().toISOString(),
      })}
    />
  );
}

function NewAssignmentForStudent({
  student,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
  initialFormat = 'in-person',
  backPath,
  onAssign,
}: {
  student: Student;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  backPath: string;
  onAssign: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workoutSnapshot: Workout) => void;
}) {
  return (
    <WorkoutComposer
      title="СОЗДАТЬ ТРЕНИРОВКУ"
      eyebrow={student.name}
      backPath={backPath}
      student={student}
      initialName=""
      nameEditable
      nameInputId="new-assignment-name"
      nameAutoFocus
      initialScheduledFor={initialScheduledFor}
      initialScheduledTime={initialScheduledTime}
      initialFormat={initialFormat}
      contextClassName="assignment-edit-card new-assignment-card"
      initialExercises={[]}
      submitLabel="Назначить тренировку"
      submitIcon="plus"
      onSubmit={({ name, scheduledFor, scheduledTime, format, exercises }) => onAssign(scheduledFor!, scheduledTime, format, {
        id: makeId('workout'),
        name,
        exercises,
        createdAt: new Date().toISOString(),
      })}
    />
  );
}

function exerciseMetadata(exercise: WorkoutExercise) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const muscle = exercise.primaryMuscle ?? definition?.primaryMuscle;
  const equipment = exercise.equipment ?? definition?.equipment ?? (exercise.loadMode === 'bodyweight' ? 'Свой вес' : undefined);
  if (!definition) {
    const details = [muscle, equipment].filter(Boolean).join(' · ');
    return details ? 'Пользовательское упражнение · ' + details : 'Пользовательское упражнение';
  }
  if (muscle && equipment) return muscle + ' · ' + equipment;
  return muscle ?? equipment ?? 'Упражнение';
}


function plannedSetLabel(exercise: WorkoutExercise, set: WorkoutSetPlan) {
  if (exercise.measureType === 'duration') return set.targetReps + ' сек.';
  if (exercise.loadMode === 'bodyweight') return set.targetReps + ' повторов';
  return set.targetWeight + ' кг × ' + set.targetReps;
}

function actualSetLabel(exercise: WorkoutExercise, result: SetResult) {
  if (exercise.measureType === 'duration') return result.actualReps + ' сек.';
  if (exercise.loadMode === 'bodyweight') return result.actualReps + ' повторов';
  return result.actualWeight + ' кг × ' + result.actualReps;
}

function ReadOnlyExerciseList({ workout, onProgress }: { workout: Workout; onProgress?: (exercise: WorkoutExercise) => (() => void) | undefined }) {
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  return (
    <section className="readonly-exercise-list">
      {workout.exercises.map((exercise, index) => {
        const progressAction = onProgress?.(exercise);
        return (
          <article className="readonly-exercise-card" key={exercise.id}>
            <header>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{exercise.name}</h2><small>{exerciseMetadata(exercise)}</small></div>
              <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={() => setInstructionExercise(exercise)} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
            </header>
            <div className="readonly-set-list">
              {getExerciseSetPlans(exercise).map((set, setIndex) => (
                <p key={setIndex}><span>Подход {setIndex + 1}</span><strong>{plannedSetLabel(exercise, set)}</strong></p>
              ))}
            </div>
            {exercise.coachNote && <p className="readonly-coach-note"><Icon name="edit" /> {exercise.coachNote}</p>}
            {progressAction && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={progressAction}>Прогресс упражнения</ActionButton>}
          </article>
        );
      })}
      {instructionExercise && <ExerciseInstructionModal exercise={instructionExercise} onClose={() => setInstructionExercise(null)} />}
    </section>
  );
}

type ExercisePickerChoice = {
  id: string;
  name: string;
  primaryMuscle?: MuscleGroup;
  equipment?: string;
  loadMode?: 'external' | 'bodyweight';
  measureType?: 'reps' | 'duration';
};

function WorkoutExerciseEditor({
  studentId,
  exercises,
  onChange,
  minSetsByExerciseId = {},
}: {
  studentId: string;
  exercises: WorkoutExercise[];
  onChange: (exercises: WorkoutExercise[]) => void;
  minSetsByExerciseId?: Record<string, number>;
}) {
  const [pickerAfterId, setPickerAfterId] = useState<string | 'start' | null>(null);
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  const focusExercise = (exerciseId: string) => {
    setRecentlyMovedId(exerciseId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector(`[data-plan-exercise="${exerciseId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setRecentlyMovedId(null), 1000);
  };

  const addExercise = (choice: ExercisePickerChoice) => {
    const loadMode = choice.loadMode ?? (choice.equipment === 'Свой вес' ? 'bodyweight' : 'external');
    const nextExercise = normalizeWorkoutExercise({
      id: makeId('exercise'),
      exerciseId: choice.id,
      name: choice.name,
      primaryMuscle: choice.primaryMuscle,
      equipment: choice.equipment,
      loadMode,
      measureType: choice.measureType ?? 'reps',
      plannedSets: [{ targetReps: choice.measureType === 'duration' ? 30 : 10, targetWeight: loadMode === 'bodyweight' ? 0 : 20 }],
      coachNote: '',
    });
    const next = exercises.map((exercise) => ({ ...exercise }));
    const afterIndex = pickerAfterId === 'start' ? -1 : next.findIndex((exercise) => exercise.id === pickerAfterId);
    next.splice(afterIndex + 1, 0, nextExercise);
    onChange(next);
    setPickerAfterId(nextExercise.id);
    focusExercise(nextExercise.id);
  };

  const updateExercise = (id: string, update: (exercise: WorkoutExercise) => WorkoutExercise) => {
    onChange(exercises.map((exercise) => exercise.id === id ? update(exercise) : exercise));
  };

  const moveExercise = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= exercises.length) return;
    const next = exercises.map((exercise) => ({ ...exercise }));
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
    focusExercise(moved.id);
  };

  const actionExercise = exercises.find((exercise) => exercise.id === actionExerciseId);
  const canRemovePickedExercise = (exerciseId: string) => {
    const item = exercises.findLast((exercise) => exercise.exerciseId === exerciseId);
    return Boolean(item && (minSetsByExerciseId[item.id] ?? 0) === 0);
  };
  const removePickedExercise = (exerciseId: string) => {
    const index = exercises.findLastIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || (minSetsByExerciseId[exercises[index].id] ?? 0) > 0) return;
    onChange(exercises.filter((_, current) => current !== index));
    if (pickerAfterId === exercises[index].id) setPickerAfterId(exercises[index - 1]?.id ?? 'start');
  };
  const actionDeleteDisabledReason = actionExercise && (minSetsByExerciseId[actionExercise.id] ?? 0) > 0
    ? 'Сначала отмени выполненные подходы'
    : undefined;

  return (
    <section className="workout-plan-editor">
      <div className="form-section-heading"><h2>Упражнения</h2></div>
      <button className="floating-exercise-add" type="button" onClick={() => setPickerAfterId(exercises.at(-1)?.id ?? 'start')} aria-label="Добавить упражнение"><Icon name="plus" /></button>
      <div className="active-exercise-list plan-exercise-list">
        {exercises.map((exercise, index) => (
          <PlanExerciseCard
            key={exercise.id}
            exercise={exercise}
            metadata={exerciseMetadata(exercise)}
            index={index}
            totalExercises={exercises.length}
            recentlyMoved={recentlyMovedId === exercise.id}
            onShowInstruction={() => setInstructionExercise(exercise)}
            onShowActions={() => setActionExerciseId(exercise.id)}
            onMoveUp={() => moveExercise(index, index - 1)}
            onMoveDown={() => moveExercise(index, index + 1)}
            onNoteChange={(coachNote) => updateExercise(exercise.id, (current) => ({ ...current, coachNote }))}
            onSetChange={(setIndex, patch) => updateExercise(exercise.id, (current) => {
              const plannedSets = getExerciseSetPlans(current).map((set, currentIndex) => currentIndex === setIndex ? { ...set, ...patch } : set);
              return withExerciseSetPlans(current, plannedSets);
            })}
            onAddSet={() => updateExercise(exercise.id, (current) => {
              const plannedSets = getExerciseSetPlans(current);
              plannedSets.push({ ...(plannedSets.at(-1) ?? { targetReps: current.measureType === 'duration' ? 30 : 10, targetWeight: current.loadMode === 'bodyweight' ? 0 : 20 }) });
              return withExerciseSetPlans(current, plannedSets);
            })}
            canRemoveSet={getExerciseSetPlans(exercise).length > Math.max(1, minSetsByExerciseId[exercise.id] ?? 1)}
            onRemoveSet={() => updateExercise(exercise.id, (current) => withExerciseSetPlans(current, getExerciseSetPlans(current).slice(0, -1)))}
          />
        ))}
      </div>

      {pickerAfterId && <ActiveExercisePicker exercises={exercises} onClose={() => setPickerAfterId(null)} onSelect={addExercise} onRemove={removePickedExercise} canRemove={canRemovePickedExercise} />}
      {instructionExercise && <ExerciseInstructionModal
        exercise={instructionExercise}
        studentId={studentId}
        editable
        onClose={() => setInstructionExercise(null)}
        onSave={(patch) => updateExercise(instructionExercise.id, (current) => ({ ...current, ...patch }))}
      />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        deleteDisabledReason={actionDeleteDisabledReason}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          onChange(exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
    </section>
  );
}

function AssignmentDetails({
  data,
  assignment,
  onAcceptRequest,
  onDeclineRequest,
}: {
  data: DemoState;
  assignment: Assignment;
  onAcceptRequest: () => void;
  onDeclineRequest: () => void;
}) {
  const student = findStudent(data, assignment.studentId);
  const workout = findAssignmentWorkout(data, assignment);
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const balance = subscriptionBalance(data.subscriptionEntries, assignment.studentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, assignment.studentId).length > 0;
  if (!student || !workout) return <NotFound />;
  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={`${student.name} · ${assignmentScheduleLabel(assignment)}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      {assignment.format === 'in-person' && assignment.rescheduleRequest && <section className="reschedule-request-card">
        <div><span>ЗАПРОС НА ПЕРЕНОС</span><h2>{student.name} предлагает другое время</h2><p><strong>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)}</strong><time>{assignment.rescheduleRequest.scheduledTime}</time></p></div>
        <div className="reschedule-request-actions"><ActionButton variant="secondary" icon="close" onClick={onDeclineRequest}>Отклонить</ActionButton><ActionButton icon="check" onClick={onAcceptRequest}>Подтвердить</ActionButton></div>
      </section>}
      {(balance <= 2 || !hasSubscription) && <section className={`subscription-warning ${subscriptionTone(balance, hasSubscription)}`}>
        <Icon name={balance <= 0 || !hasSubscription ? 'minus' : 'history'} />
        <div><strong>{subscriptionBalanceLabel(balance, hasSubscription)}</strong><small>Тренировку можно провести без ограничения.</small></div>
        <button type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>{hasSubscription ? 'Продлить' : 'Добавить'}</button>
      </section>}
      <div className="assignment-detail-actions">
        {assignment.status === 'assigned' && assignment.format === 'in-person' && <ActionButton className="assignment-start-button" icon="workout" onClick={() => go(`/trainer/workout/${assignment.id}`)}>{activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</ActionButton>}
        {assignment.status === 'assigned' && <ActionButton variant="secondary" icon="edit" onClick={() => go(`/trainer/assignments/${assignment.id}/edit`)}>Редактировать</ActionButton>}
        <ActionButton variant="secondary" icon="copy" onClick={() => go(`/trainer/assignments/${assignment.id}/repeat`)}>Повторить на другую дату</ActionButton>
      </div>
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <ReadOnlyExerciseList workout={workout} onProgress={(exercise) => () => go(progressHref(student.id, exercise))} />
    </main>
  );
}

function StudentAssignmentDetails({
  data,
  assignment,
  onRequest,
  onStart,
}: {
  data: DemoState;
  assignment: Assignment;
  onRequest: (scheduledFor: string, scheduledTime: string) => void;
  onStart: () => void;
}) {
  const workout = findAssignmentWorkout(data, assignment);
  const [requestOpen, setRequestOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(assignment.rescheduleRequest?.scheduledFor ?? assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime ?? '18:00');
  if (!workout) return <NotFound />;
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const canStart = assignment.format === 'online' || Boolean(activeSession) || assignment.scheduledFor === dateKey();
  const scheduleUnchanged = scheduledFor === assignment.scheduledFor && scheduledTime === assignment.scheduledTime;
  const balance = subscriptionBalance(data.subscriptionEntries, assignment.studentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, assignment.studentId).length > 0;

  return (
    <main className="content-page narrow-page student-assignment-page">
      <PageHeader back="/student" eyebrow="Предстоящая тренировка" title={workout.name.toUpperCase()} />
      <section className="student-assignment-schedule">
        <span><Icon name="calendar" /></span>
        <div><small>{assignment.format === 'online' ? 'ОНЛАЙН · РЕКОМЕНДОВАННАЯ ДАТА' : 'ДАТА И ВРЕМЯ'}</small><strong>{formatScheduleDay(assignment.scheduledFor)}</strong><time dateTime={assignmentDateTime(assignment)}>{assignment.format === 'online' ? 'В удобное время' : assignmentTimeLabel(assignment)}</time></div>
      </section>

      {assignment.format === 'in-person' && (assignment.rescheduleRequest ? <section className="student-request-status"><Icon name="check" /><div><strong>Новое время предложено</strong><p>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)} · {assignment.rescheduleRequest.scheduledTime}</p><small>Тренер увидит запрос и подтвердит или отклонит его.</small></div></section> : <ActionButton variant="secondary" className="student-reschedule-button" icon="calendar" aria-expanded={requestOpen} onClick={() => setRequestOpen((current) => !current)}>Предложить другое время</ActionButton>)}

      {assignment.format === 'in-person' && requestOpen && !assignment.rescheduleRequest && <section className="student-reschedule-form">
        <WorkoutScheduleFields dateLabel="Новая дата" timeLabel="Новое время" scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <ActionButton icon="check" disabled={!scheduledFor || !scheduledTime || scheduleUnchanged} onClick={() => { onRequest(scheduledFor, scheduledTime); setRequestOpen(false); }}>Отправить тренеру</ActionButton>
      </section>}

      {balance <= 0 && <section className="subscription-warning debt student-debt-warning">
        <Icon name="minus" />
        <div><strong>{subscriptionBalanceLabel(balance, hasSubscription)}</strong><small>Эту тренировку можно завершить в долг. Занятие спишется как обычно.</small></div>
      </section>}

      {canStart && <ActionButton className="student-start-button" icon="workout" onClick={onStart}>{activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</ActionButton>}
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <ReadOnlyExerciseList workout={workout} />
    </main>
  );
}

function RepeatAssignment({
  data,
  assignment,
  sourceWorkout,
  onSave,
}: {
  data: DemoState;
  assignment: Assignment;
  sourceWorkout: Workout;
  onSave: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workout: Workout) => void;
}) {
  const student = findStudent(data, assignment.studentId);
  if (!student) return <NotFound />;

  return (
    <WorkoutComposer
      title="ПОВТОРИТЬ ТРЕНИРОВКУ"
      eyebrow={student.name}
      backPath={`/trainer/assignments/${assignment.id}`}
      student={student}
      workoutLabel={sourceWorkout.name}
      initialName={sourceWorkout.name}
      initialScheduledFor={dateKey()}
      initialScheduledTime={assignment.scheduledTime}
      initialFormat={assignment.format}
      dateLabel="Новая дата"
      contextClassName="repeat-assignment-form"
      largeStudentAvatar
      initialExercises={sourceWorkout.exercises}
      submitLabel="Назначить тренировку"
      submitIcon="plus"
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => onSave(scheduledFor!, scheduledTime, format, { ...cloneWorkout(sourceWorkout), exercises })}
    />
  );
}


function EditAssignment({ data, assignment, onSave, onDelete }: { data: DemoState; assignment: Assignment; onSave: (assignment: Assignment) => void; onDelete: (assignment: Assignment) => void }) {
  const student = findStudent(data, assignment.studentId);
  const workout = findAssignmentWorkout(data, assignment);
  if (!student || !workout) return <NotFound />;

  return (
    <WorkoutComposer
      title="РЕДАКТИРОВАТЬ ТРЕНИРОВКУ"
      eyebrow={`${student.name} · ${workout.name}`}
      backPath={`/trainer/assignments/${assignment.id}`}
      student={student}
      workoutLabel={workout.name}
      initialName={workout.name}
      initialScheduledFor={assignment.scheduledFor}
      initialScheduledTime={assignment.scheduledTime}
      initialFormat={assignment.format}
      initialExercises={assignment.workoutSnapshot.exercises}
      submitLabel="Сохранить изменения"
      submitIcon="check"
      submitClassName=""
      dangerAction={{
        label: 'Удалить назначение',
        title: 'Удалить тренировку?',
        text: `«${workout.name}» исчезнет из расписания ${student.name}.`,
        confirmLabel: 'Удалить тренировку',
        onConfirm: () => onDelete(assignment),
      }}
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => {
        const exercisesChanged = JSON.stringify(exercises) !== JSON.stringify(workout.exercises);
        onSave({
          ...assignment,
          scheduledFor: scheduledFor!,
          scheduledTime,
          format,
          rescheduleRequest: format === 'online' ? undefined : assignment.rescheduleRequest,
          workoutSnapshot: exercisesChanged ? {
            ...cloneWorkout(workout),
            exercises,
            updatedAt: new Date().toISOString(),
          } : cloneWorkout(workout),
        });
      }}
    />
  );
}

function StudentHome({ data, onOpen }: { data: DemoState; onOpen: (assignmentId: string) => void }) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const assignments = data.assignments
    .filter((item) => item.studentId === data.activeStudentId && item.status === 'assigned' && (item.format === 'online' || item.scheduledFor >= dateKey()) && item.scheduledFor <= dateKey(horizon))
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const mainAssignment = assignments[0];
  const mainSession = mainAssignment && data.sessions.find((item) => item.assignmentId === mainAssignment.id && !item.completedAt);
  const mainWorkout = mainAssignment && (mainSession ? findSessionWorkout(data, mainSession) : findAssignmentWorkout(data, mainAssignment));
  const mainCompletedSets = mainSession?.results.filter((item) => item.completed).length ?? 0;
  const mainProgress = mainSession ? Math.round((mainCompletedSets / Math.max(mainSession.results.length, 1)) * 100) : 0;
  const laterAssignments = assignments.slice(1);
  const balance = subscriptionBalance(data.subscriptionEntries, data.activeStudentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, data.activeStudentId).length > 0;

  return (
    <main className="content-page student-page">
      {hasSubscription && <section className={`student-subscription-status ${subscriptionTone(balance)}`} aria-label="Остаток абонемента">
        <span><Icon name={balance > 0 ? 'check' : 'minus'} /></span>
        <div><small>АБОНЕМЕНТ</small><strong>{subscriptionBalanceLabel(balance)}</strong></div>
      </section>}
      {mainAssignment ? (
        <section className="student-focus-card">
          <div className="student-card-top"><time dateTime={assignmentDateTime(mainAssignment)}><strong>{formatScheduleDay(mainAssignment.scheduledFor)}</strong><small>{assignmentTimeLabel(mainAssignment)}</small></time>{mainSession && <b>{mainProgress}%</b>}</div>
          <div><h2>{mainWorkout?.name}</h2><p>{exercisePreview(mainWorkout)}</p></div>
          {mainSession && <div className="workout-progress"><span style={{ width: `${mainProgress}%` }} /></div>}
          <button type="button" onClick={() => onOpen(mainAssignment.id)}><Icon name="calendar" /> Посмотреть тренировку</button>
        </section>
      ) : <EmptyState icon="sun" title="Две недели свободны" text={COPY.emptyAssignments} />}

      {laterAssignments.length > 0 && <section className="student-upcoming">
        <div className="section-heading"><h2>Следующие тренировки</h2></div>
        <div>{laterAssignments.map((assignment) => {
          const workout = findAssignmentWorkout(data, assignment);
          return <button className="student-upcoming-row" key={assignment.id} type="button" onClick={() => onOpen(assignment.id)}><time dateTime={assignmentDateTime(assignment)}><strong>{formatCalendarDay(assignment.scheduledFor)}</strong><small>{assignmentTimeLabel(assignment)}</small></time><span><strong>{workout?.name}</strong><small>{exercisePreview(workout)}</small></span><Icon name="chevron-right" /></button>;
        })}</div>
      </section>}
    </main>
  );
}

type WorkoutFinishOptions = {
  chargeSubscription: boolean;
};

function ActiveWorkout({
  workout,
  session,
  student,
  scheduledFor,
  scheduledTime,
  format,
  backPath,
  onStart,
  onUpdate,
  onWorkoutUpdate,
  onFinish,
  trainerCanWaiveCharge = false,
  balance = 0,
}: {
  workout: Workout;
  session?: WorkoutSession;
  student?: Student;
  scheduledFor: string;
  scheduledTime?: string;
  format: TrainingFormat;
  backPath: string;
  onStart: () => void;
  onUpdate: (sessionId: string, results: SetResult[]) => void;
  onWorkoutUpdate: (sessionId: string, workout: Workout) => void;
  onFinish: (sessionId: string, options: WorkoutFinishOptions) => void;
  trainerCanWaiveCharge?: boolean;
  balance?: number;
}) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [pickerAfterId, setPickerAfterId] = useState<string | null>(null);
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saving' | 'saved'>('saved');
  const moveHighlightTimer = useRef<number | null>(null);
  const saveStateTimer = useRef<number | null>(null);
  const startRequested = useRef(false);
  const startedAt = session?.startedAt;

  useEffect(() => {
    if (!session && !startRequested.current) {
      startRequested.current = true;
      onStart();
    }
  }, [session, onStart]);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => () => {
    if (moveHighlightTimer.current) window.clearTimeout(moveHighlightTimer.current);
    if (saveStateTimer.current) window.clearTimeout(saveStateTimer.current);
  }, []);

  if (!session || !workout.exercises.length) {
    return <main className="loading-screen"><img className="loading-logo" src="logo-full.png" alt="REPPY" /><p>Готовим тренировку…</p></main>;
  }

  const completed = session.results.filter((result) => result.completed).length;
  const progress = Math.round((completed / Math.max(session.results.length, 1)) * 100);
  const elapsed = formatElapsedTime(session.startedAt, currentTime);
  const unfinishedCount = session.results.filter((result) => !result.completed).length;

  const markSaving = () => {
    setSaveState('saving');
    if (saveStateTimer.current) window.clearTimeout(saveStateTimer.current);
    saveStateTimer.current = window.setTimeout(() => setSaveState('saved'), 450);
  };

  const updateWorkout = (exercises: WorkoutExercise[]) => {
    if (!exercises.length) return;
    markSaving();
    onWorkoutUpdate(session.id, { ...cloneWorkout(workout), exercises });
  };

  const updateExerciseNote = (exerciseId: string, coachNote: string) => {
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, coachNote } : exercise));
  };

  const updateExerciseSets = (exerciseId: string, update: (plans: WorkoutSetPlan[], exercise: WorkoutExercise) => WorkoutSetPlan[]) => {
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId
      ? withExerciseSetPlans(exercise, update(getExerciseSetPlans(exercise), exercise))
      : exercise));
  };

  const updateResult = (exerciseId: string, setNumber: number, patch: Partial<SetResult>) => {
    markSaving();
    onUpdate(session.id, session.results.map((result) => result.exerciseId === exerciseId && result.setNumber === setNumber ? { ...result, ...patch } : result));
  };

  const focusExercise = (exerciseId: string) => {
    setRecentlyMovedId(exerciseId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector(`[data-active-exercise="${exerciseId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    if (moveHighlightTimer.current) window.clearTimeout(moveHighlightTimer.current);
    moveHighlightTimer.current = window.setTimeout(() => setRecentlyMovedId(null), 1000);
  };

  const moveExercise = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= workout.exercises.length) return;
    const next = workout.exercises.map((exercise) => ({ ...exercise }));
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateWorkout(next);
    focusExercise(moved.id);
  };

  const addExerciseAfter = (definition: ExercisePickerChoice) => {
    if (!pickerAfterId) return;
    const afterIndex = workout.exercises.findIndex((exercise) => exercise.id === pickerAfterId);
    const loadMode = definition.loadMode ?? (definition.equipment === 'Свой вес' ? 'bodyweight' : 'external');
    const nextExercise = normalizeWorkoutExercise({
      id: makeId('exercise'),
      exerciseId: definition.id,
      name: definition.name,
      primaryMuscle: definition.primaryMuscle,
      equipment: definition.equipment,
      loadMode,
      measureType: definition.measureType ?? 'reps',
      plannedSets: [{ targetReps: definition.measureType === 'duration' ? 30 : 10, targetWeight: loadMode === 'bodyweight' ? 0 : 20 }],
      coachNote: '',
    });
    const next = workout.exercises.map((exercise) => ({ ...exercise }));
    next.splice(afterIndex + 1, 0, nextExercise);
    updateWorkout(next);
    setPickerAfterId(nextExercise.id);
    focusExercise(nextExercise.id);
  };

  const actionExercise = workout.exercises.find((exercise) => exercise.id === actionExerciseId);
  const canRemovePickedExercise = (exerciseId: string) => {
    const item = workout.exercises.findLast((exercise) => exercise.exerciseId === exerciseId);
    return Boolean(item && workout.exercises.length > 1 && !session.results.some((result) => result.exerciseId === item.id && result.completed));
  };
  const removePickedExercise = (exerciseId: string) => {
    const index = workout.exercises.findLastIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || workout.exercises.length <= 1) return;
    const item = workout.exercises[index];
    if (session.results.some((result) => result.exerciseId === item.id && result.completed)) return;
    updateWorkout(workout.exercises.filter((_, current) => current !== index));
    if (pickerAfterId === item.id) setPickerAfterId(workout.exercises[index - 1]?.id ?? workout.exercises.find((exercise) => exercise.id !== item.id)?.id ?? null);
  };
  const actionResults = actionExercise ? session.results.filter((result) => result.exerciseId === actionExercise.id) : [];
  const actionMinimumSets = Math.max(0, ...actionResults.filter((result) => result.completed).map((result) => result.setNumber));
  const actionDeleteDisabledReason = actionMinimumSets > 0
    ? 'Сначала отмени выполненные подходы'
    : workout.exercises.length <= 1
      ? 'В тренировке должно остаться хотя бы одно упражнение'
      : undefined;

  return (
    <main className="active-workout-page active-workout-list-page">
      <div className="active-sticky-header">
        <header className="active-header">
          <button type="button" onClick={() => goBack(backPath)} aria-label="Вернуться назад"><Icon name="chevron-left" /></button>
          <div className="active-header-copy"><span>{student ? `${student.name} · ${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}` : `${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}`}</span><strong>{workout.name} · <i className={`save-state ${saveState}`} role="status" aria-live="polite">{saveState === 'saving' ? 'Сохраняем…' : 'Сохранено'}</i></strong></div>
          <button className="active-header-add" type="button" onClick={() => setPickerAfterId(workout.exercises.at(-1)?.id ?? null)} aria-label="Добавить упражнение"><Icon name="plus" /></button>
          <div className="active-timing"><time dateTime={'PT' + elapsed.elapsedSeconds + 'S'} aria-label={'Прошло ' + elapsed.label}>{elapsed.label}</time><b>{progress}%</b></div>
        </header>
        <div className="active-progress" role="progressbar" aria-label="Прогресс тренировки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + '%' }} /></div>
      </div>

      <section className="active-workout-overview">
        <h1>{workout.name}</h1>
      </section>

      <section className="active-exercise-list">
        {workout.exercises.map((exercise, index) => {
          const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
          const minimumSets = Math.max(1, ...exerciseResults.filter((result) => result.completed).map((result) => result.setNumber));
          return (
            <ActiveExerciseCard
              key={exercise.id}
              exercise={exercise}
              metadata={exerciseMetadata(exercise)}
              index={index}
              totalExercises={workout.exercises.length}
              results={exerciseResults}
              recentlyMoved={recentlyMovedId === exercise.id}
              onNoteChange={(coachNote) => updateExerciseNote(exercise.id, coachNote)}
              onResultChange={(setNumber, patch) => updateResult(exercise.id, setNumber, patch)}
              onShowInstruction={() => setInstructionExercise(exercise)}
              onShowActions={() => setActionExerciseId(exercise.id)}
              onAddSet={() => updateExerciseSets(exercise.id, (plans, current) => [...plans, { ...(plans.at(-1) ?? { targetReps: current.measureType === 'duration' ? 30 : 10, targetWeight: current.loadMode === 'bodyweight' ? 0 : 20 }) }])}
              canRemoveSet={getExerciseSetPlans(exercise).length > minimumSets}
              onRemoveSet={() => updateExerciseSets(exercise.id, (plans) => plans.slice(0, -1))}
              onMoveUp={() => moveExercise(index, index - 1)}
              onMoveDown={() => moveExercise(index, index + 1)}
            />
          );
        })}
      </section>

      {pickerAfterId && <ActiveExercisePicker exercises={workout.exercises} onClose={() => setPickerAfterId(null)} onSelect={addExerciseAfter} onRemove={removePickedExercise} canRemove={canRemovePickedExercise} />}
      {instructionExercise && <ExerciseInstructionModal
        exercise={instructionExercise}
        studentId={student?.id}
        editable={trainerCanWaiveCharge}
        onClose={() => setInstructionExercise(null)}
        onSave={(patch) => updateWorkout(workout.exercises.map((exercise) => exercise.id === instructionExercise.id ? { ...exercise, ...patch } : exercise))}
      />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        deleteDisabledReason={actionDeleteDisabledReason}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          updateWorkout(workout.exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
      {finishOpen && <FinishWorkoutModal
        balance={balance}
        unfinishedCount={unfinishedCount}
        canWaiveCharge={trainerCanWaiveCharge}
        onClose={() => setFinishOpen(false)}
        onFinish={(options) => {
          setFinishOpen(false);
          onFinish(session.id, options);
        }}
      />}

      <footer className="exercise-navigation single-action">
        <button className="finish-workout" type="button" onClick={() => setFinishOpen(true)}><Icon name="check" /> Завершить тренировку</button>
      </footer>
    </main>
  );
}

function FinishWorkoutModal({ balance, unfinishedCount, canWaiveCharge, onClose, onFinish }: { balance: number; unfinishedCount: number; canWaiveCharge: boolean; onClose: () => void; onFinish: (options: WorkoutFinishOptions) => void }) {
  return (
    <ModalFrame title="Завершить тренировку" eyebrow={canWaiveCharge ? 'АБОНЕМЕНТ' : undefined} className="finish-workout-sheet" ariaLabel="Завершение тренировки" onClose={onClose}>
      {unfinishedCount > 0 && <div className="finish-incomplete-warning"><Icon name="minus" /><div><strong>Есть незавершённые подходы</strong><small>Не отмечено: {unfinishedCount}. Результат сохранится в текущем виде.</small></div></div>}
      {canWaiveCharge && <div className={`finish-balance-preview ${subscriptionTone(balance)}`}>
        <span>СЕЙЧАС</span><strong>{subscriptionBalanceLabel(balance)}</strong>
        <Icon name="arrow-right" />
        <span>ПОСЛЕ</span><strong>{subscriptionBalanceLabel(balance - 1)}</strong>
      </div>}
      <div className="finish-subscription-actions">
        <ActionButton icon="check" onClick={() => onFinish({ chargeSubscription: true })}>{canWaiveCharge ? 'Завершить и списать занятие' : 'Завершить тренировку'}</ActionButton>
        {canWaiveCharge && <ActionButton variant="secondary" icon="minus" onClick={() => onFinish({ chargeSubscription: false })}>Не списывать занятие</ActionButton>}
      </div>
    </ModalFrame>
  );
}

const MAX_INSTRUCTION_VIDEO_BYTES = 100 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function ExerciseInstructionModal({
  exercise,
  studentId,
  editable = false,
  onClose,
  onSave,
}: {
  exercise: WorkoutExercise;
  studentId?: string;
  editable?: boolean;
  onClose: () => void;
  onSave?: (patch: Pick<WorkoutExercise, 'instructionText' | 'instructionVideo'>) => void;
}) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const resolvedEquipment = exercise.equipment ?? definition?.equipment;
  const equipment = resolvedEquipment && resolvedEquipment !== 'Свой вес' ? resolvedEquipment : null;
  const [instructionText, setInstructionText] = useState(exercise.instructionText ?? '');
  const [instructionVideo, setInstructionVideo] = useState(exercise.instructionVideo);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setVideoMissing(false);
      setVideoUrl(null);
      if (pendingFile) {
        objectUrl = URL.createObjectURL(pendingFile);
        setVideoUrl(objectUrl);
        return;
      }
      if (!instructionVideo) return;
      try {
        const blob = await loadInstructionVideo(instructionVideo.id);
        if (cancelled) return;
        if (!blob) return setVideoMissing(true);
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      } catch {
        if (!cancelled) setVideoMissing(true);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [instructionVideo, pendingFile]);

  const chooseVideo = (file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError('Выбери видеофайл.');
    if (file.size > MAX_INSTRUCTION_VIDEO_BYTES) return setError('Видео должно быть не больше 100 МБ.');
    setPendingFile(file);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const nextVideo = pendingFile ? await saveInstructionVideo(pendingFile, studentId) : instructionVideo;
      onSave?.({ instructionText: instructionText.trim() || undefined, instructionVideo: nextVideo });
      onClose();
    } catch {
      setError('Не удалось сохранить видео. Попробуй ещё раз.');
      setSaving(false);
    }
  };

  const instruction = exercise.instructionText?.trim();
  return (
    <ModalFrame title={exercise.name} className="exercise-instruction-sheet" ariaLabel={'Как выполнять — ' + exercise.name} closeLabel="Закрыть описание" onClose={onClose}>
      <div className="exercise-instruction-body">
        <div className={`exercise-instruction-media ${videoUrl ? 'has-video' : ''}`}>
          {videoUrl
            ? <video controls playsInline preload="metadata" src={videoUrl} aria-label={'Видео упражнения — ' + exercise.name} />
            : <><Icon name="workout" /><span>{videoMissing ? 'Видео недоступно в этом браузере' : editable ? 'Добавь короткое видео с техникой' : 'Тренер пока не добавил видео'}</span></>}
        </div>
        {editable && <div className="instruction-video-actions">
          <label className="wide-secondary">
            <Icon name={instructionVideo || pendingFile ? 'change' : 'plus'} />
            <span>{instructionVideo || pendingFile ? 'Заменить видео' : 'Записать или выбрать видео'}</span>
            <input type="file" accept="video/*" onChange={(event) => chooseVideo(event.target.files?.[0])} />
          </label>
          {(instructionVideo || pendingFile) && <button type="button" className="instruction-video-remove" onClick={() => { setInstructionVideo(undefined); setPendingFile(null); setError(''); }}><Icon name="trash" /> Удалить</button>}
        </div>}
        {(instructionVideo || pendingFile) && <p className="instruction-video-meta">{pendingFile?.name ?? instructionVideo?.name} · {formatFileSize(pendingFile?.size ?? instructionVideo?.size ?? 0)}</p>}
        {editable && <p className="instruction-video-helper">Короткий ролик: 2–3 повтора, до 100 МБ.</p>}
        {equipment && <div className="exercise-equipment"><small>ОБОРУДОВАНИЕ</small><strong>{equipment}</strong></div>}
        <h3>Как выполнять</h3>
        {editable
          ? <textarea className="instruction-textarea" aria-label="Подробное описание упражнения" maxLength={1500} value={instructionText} onChange={(event) => setInstructionText(event.target.value)} placeholder="Опиши исходное положение, движение, дыхание и требования к технике" />
          : instruction
            ? <p className="instruction-copy">{instruction}</p>
            : <p className="instruction-empty">Подробное описание пока не добавлено. Выполняй движение плавно и остановись при резкой боли.</p>}
        {error && <FormError>{error}</FormError>}
        {editable && <ActionButton icon="check" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем…' : 'Сохранить инструкцию'}</ActionButton>}
      </div>
    </ModalFrame>
  );
}

function ExerciseActionsModal({
  exercise,
  deleteDisabledReason,
  onClose,
  onDeleteExercise,
}: {
  exercise: WorkoutExercise;
  deleteDisabledReason?: string;
  onClose: () => void;
  onDeleteExercise: () => void;
}) {
  return (
    <ModalFrame title={exercise.name} className="exercise-actions-sheet" ariaLabel={'Действия — ' + exercise.name} closeLabel="Закрыть действия" onClose={onClose}>
      <div className="exercise-action-list">
        <button className="danger" type="button" disabled={Boolean(deleteDisabledReason)} onClick={onDeleteExercise}>
          <Icon name="trash" />
          <span><strong>Удалить упражнение</strong><small>{deleteDisabledReason ?? 'Упражнение исчезнет из этой тренировки'}</small></span>
        </button>
      </div>
    </ModalFrame>
  );
}

function ActiveExercisePicker({
  exercises,
  onClose,
  onSelect,
  onRemove,
  canRemove,
}: {
  exercises: WorkoutExercise[];
  onClose: () => void;
  onSelect: (exercise: ExercisePickerChoice) => void;
  onRemove: (exerciseId: string) => void;
  canRemove: (exerciseId: string) => boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>('all');
  const [customLoadMode, setCustomLoadMode] = useState<'external' | 'bodyweight'>('external');
  const [customMeasureType, setCustomMeasureType] = useState<'reps' | 'duration'>('reps');
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = search.trim();
  const canCreateCustom = customName.length >= 2 && !exerciseLibrary.some((exercise) => exercise.name.toLocaleLowerCase('ru') === normalizedSearch);
  const filtered = exerciseLibrary.filter((exercise) => {
    const matchesMuscle = selectedMuscle === 'all' || exercise.primaryMuscle === selectedMuscle;
    const haystack = (exercise.name + ' ' + exercise.primaryMuscle + ' ' + exercise.equipment).toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });
  const selectExercise = (exercise: ExercisePickerChoice, custom = false) => {
    onSelect(exercise);
    if (custom) setSearch('');
  };

  return (
    <ModalFrame title="Добавить упражнения" subtitle="Добавляй упражнения по кругу кнопкой +, убирай кнопкой −" className="exercise-picker-sheet" ariaLabel="Добавить упражнения" onClose={onClose}>
      <input className="text-input search-input" type="search" aria-label="Поиск упражнений" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
      <div className="muscle-filter" aria-label="Фильтр по основной мышце">
        <button className={selectedMuscle === 'all' ? 'selected' : ''} type="button" onClick={() => setSelectedMuscle('all')} aria-pressed={selectedMuscle === 'all'}>Все</button>
        {muscleGroups.map((muscle) => <button className={selectedMuscle === muscle ? 'selected' : ''} key={muscle} type="button" onClick={() => setSelectedMuscle(muscle)} aria-pressed={selectedMuscle === muscle}>{muscle}</button>)}
      </div>
      <div className="picker-list">
        {canCreateCustom && <section className="custom-exercise-builder">
          <div><strong>Новое упражнение «{customName}»</strong><small>{selectedMuscle === 'all' ? 'Пользовательское упражнение' : selectedMuscle}</small></div>
          <div className="custom-load-mode" aria-label="Тип нагрузки">
            <button className={customLoadMode === 'external' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('external')} aria-pressed={customLoadMode === 'external'}>С весом</button>
            <button className={customLoadMode === 'bodyweight' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('bodyweight')} aria-pressed={customLoadMode === 'bodyweight'}>Свой вес</button>
          </div>
          <div className="custom-load-mode" aria-label="Способ измерения">
            <button className={customMeasureType === 'reps' ? 'selected' : ''} type="button" onClick={() => setCustomMeasureType('reps')} aria-pressed={customMeasureType === 'reps'}>Повторы</button>
            <button className={customMeasureType === 'duration' ? 'selected' : ''} type="button" onClick={() => { setCustomMeasureType('duration'); setCustomLoadMode('bodyweight'); }} aria-pressed={customMeasureType === 'duration'}>Секунды</button>
          </div>
          <button className="custom-exercise-option" type="button" onClick={() => selectExercise({ id: makeId('custom-exercise'), name: customName, primaryMuscle: selectedMuscle === 'all' ? undefined : selectedMuscle, equipment: customLoadMode === 'bodyweight' ? 'Свой вес' : 'Другое', loadMode: customLoadMode, measureType: customMeasureType }, true)}><Icon name="plus" /> Добавить «{customName}»</button>
        </section>}
        {filtered.map((exercise) => {
          const count = exercises.filter((item) => item.exerciseId === exercise.id).length;
          return <div className="picker-exercise-row" key={exercise.id}>
            <div><strong>{exercise.name}</strong><small>{exercise.primaryMuscle} · {exercise.equipment}</small></div>
            <div className="picker-quantity" role="group" aria-label={exercise.name}>
              <button type="button" disabled={!canRemove(exercise.id)} onClick={() => onRemove(exercise.id)} aria-label={`Убрать ${exercise.name}`}><Icon name="minus" /></button>
              <span aria-live="polite">{count}</span>
              <button type="button" onClick={() => selectExercise(exercise)} aria-label={`Добавить ${exercise.name}`}><Icon name="plus" /></button>
            </div>
          </div>;
        })}
        {!filtered.length && !canCreateCustom && <p className="picker-empty">Ничего не найдено. Введи хотя бы два символа, чтобы добавить своё упражнение.</p>}
      </div>
      <footer className="picker-footer"><span aria-live="polite">В тренировке: {exercises.length}</span><ActionButton icon="check" onClick={onClose}>Готово</ActionButton></footer>
    </ModalFrame>
  );
}

function WorkoutFeedback({ data, session, onComplete }: { data: DemoState; session: WorkoutSession; onComplete: (mood: MoodRating, comment: string) => void }) {
  const [mood, setMood] = useState<MoodRating | null>(null);
  const [comment, setComment] = useState('');
  const workout = findSessionWorkout(data, session);

  return (
    <main className="feedback-page">
      <PageHeader back="/student" eyebrow={workout?.name} title="КАК ПРОШЛО?" />
      <section className="feedback-card">
        <fieldset className="mood-fieldset">
          <legend>Твоё настроение после тренировки</legend>
          <div className="mood-grid">
            {MOODS.map((item) => (
              <button className={mood === item.value ? 'selected' : ''} key={item.value} type="button" onClick={() => setMood(item.value)} aria-pressed={mood === item.value}>
                <span><Icon name={item.icon} /></span><strong>{item.label}</strong><small>{item.detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <label className="comment-field" htmlFor="workout-comment"><span>Комментарий тренеру <small>необязательно</small></span><textarea id="workout-comment" maxLength={280} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: последние подходы дались тяжело, но технику удержал" /><i>{comment.length}/280</i></label>
        <ActionButton icon="check" disabled={!mood} onClick={() => mood && onComplete(mood, comment)}>Сохранить результат</ActionButton>
      </section>
    </main>
  );
}

function WorkoutSuccess({ data, session }: { data: DemoState; session: WorkoutSession }) {
  const workout = findSessionWorkout(data, session);
  const balance = subscriptionBalance(data.subscriptionEntries, session.studentId);
  return (
    <main className="success-screen">
      <img className="success-illustration" src="good-sm.png" alt="" />
      <p className="eyebrow">Результат сохранён</p>
      <h1>ТРЕНИРОВКА<br />ЗАВЕРШЕНА</h1>
      <section><strong>{workout?.name}</strong>{session.mood && <p className="success-mood"><Icon name="sun" /> Самочувствие: {moodLabel(session.mood)}</p>}<p className={`success-subscription ${subscriptionTone(balance)}`}>{subscriptionBalanceLabel(balance)}</p></section>
      <ActionButton icon="check" onClick={() => go('/student')}>Готово</ActionButton>
    </main>
  );
}

function StudentHistory({ data }: { data: DemoState }) {
  const sessions = [...data.sessions].filter((item) => item.studentId === data.activeStudentId && item.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return (
    <main className="content-page student-page">
      {sessions.length ? (
        <section className="history-list">
          {sessions.map((session) => {
            const workout = findSessionWorkout(data, session);
            return (
              <button key={session.id} type="button" onClick={() => go(`/student/history/${session.id}`)}>
                <span className="history-date">{formatDay(session.completedAt)}</span>
                <div><strong>{workout?.name}</strong><small>{session.mood ? moodLabel(session.mood) : 'Результат сохранён'}</small></div>
                <i><Icon name="chevron-right" /></i>
              </button>
            );
          })}
        </section>
      ) : <EmptyState icon="history" title="История начнётся здесь" text={COPY.emptyHistory} />}
    </main>
  );
}

function SessionResult({
  data,
  session,
  trainerView = false,
  onRepeat,
  onDelete,
}: {
  data: DemoState;
  session: WorkoutSession;
  trainerView?: boolean;
  onRepeat?: () => void;
  onDelete?: () => void;
}) {
  const workout = findSessionWorkout(data, session);
  const student = findStudent(data, session.studentId);
  const charged = isSessionCharged(data.subscriptionEntries, session.id);
  const chargeStatus = charged ? 'charged' : session.subscriptionChargeStatus === 'waived' ? 'waived' : undefined;
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (!workout) return <NotFound />;
  const completedSets = session.results.filter((result) => result.completed).length;
  const elapsed = session.completedAt ? formatElapsedTime(session.startedAt, new Date(session.completedAt).getTime()).label : '—';
  return (
    <main className="content-page narrow-page">
      <PageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/history'} eyebrow={`${trainerView ? `${student?.name} · ` : ''}${formatDay(session.completedAt)}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      <section className="session-summary" aria-label="Итоги тренировки">
        <div><small>ДЛИТЕЛЬНОСТЬ</small><strong>{elapsed}</strong></div>
        <div><small>ПОДХОДЫ</small><strong>{completedSets} из {session.results.length}</strong></div>
        <div><small>УПРАЖНЕНИЯ</small><strong>{workout.exercises.length}</strong></div>
      </section>
      {trainerView && chargeStatus && <section className={`session-subscription-status ${chargeStatus}`}><Icon name={chargeStatus === 'charged' ? 'check' : 'minus'} /><span><small>АБОНЕМЕНТ</small><strong>{chargeStatus === 'charged' ? 'Одно занятие списано' : 'Занятие не списано'}</strong></span></section>}
      {(session.mood || session.comment) && <section className="session-feedback"><span>ОБРАТНАЯ СВЯЗЬ УЧЕНИКА</span>{session.mood && <strong><Icon name="sun" /> {moodLabel(session.mood)}</strong>}{session.comment && <p>{session.comment}</p>}</section>}
      {trainerView && <div className="session-result-actions">
        <ActionButton variant="secondary" icon="copy" onClick={onRepeat}>Повторить на другую дату</ActionButton>
        <ActionButton variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>Удалить тренировку</ActionButton>
      </div>}
      <section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <article key={exercise.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><small className="result-exercise-meta">{exerciseMetadata(exercise)}</small>{exercise.coachNote && <small className="result-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></header>
              <div>{results.map((result) => <p className={result.completed ? '' : 'not-completed'} key={result.setNumber}><span>Подход {result.setNumber}</span><strong>{actualSetLabel(exercise, result)}</strong><i><Icon name={result.completed ? 'check' : 'minus'} /></i></p>)}</div>
              {trainerView && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={() => go(progressHref(session.studentId, exercise))}>Прогресс упражнения</ActionButton>}
            </article>
          );
        })}
      </section>
      {deleteOpen && <ConfirmationModal
        title="Удалить завершённую тренировку?"
        text={charged ? 'Результат будет удалён, а одно занятие вернётся в абонемент ученика.' : 'Тренировка и её результат будут удалены без возможности восстановления.'}
        confirmLabel="Удалить тренировку"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete?.();
        }}
      />}
    </main>
  );
}

function InvitationScreen({ token, inviteName, data, onAccept }: { token: string; inviteName: string; data: DemoState; onAccept: (student: Student) => void }) {
  const student = findStudent(data, token) ?? (inviteName ? { id: token, name: inviteName, status: 'invited' as const, color: 'orange' as const } : undefined);
  if (!student) {
    return <main className="invitation-screen"><Brand /><EmptyState icon="close" title="Ссылка не работает" text="Попроси тренера создать новое приглашение." action="На главную" onAction={() => go('/')} /></main>;
  }
  return (
    <main className="invitation-screen">
      <Brand />
      <section className="invitation-card">
        <span className="invite-avatar">{initials(student.name)}</span>
        <p className="eyebrow">Приглашение в REPPY</p>
        <h1>{TRAINER_NAME.toUpperCase()} ЗОВЁТ ТЕБЯ В КОМАНДУ</h1>
        <p>Привет, {student.name}! Здесь ты будешь получать тренировки и отмечать результаты прямо в зале.</p>
        <ActionButton icon="check" onClick={() => onAccept(student)}>Принять приглашение</ActionButton>
      </section>
    </main>
  );
}

function SettingsModal({ accountMode = false, onClose, onReset, onSignOut, onOpenDesignKit, onConnectTelegram, onLoadTelegramConnection }: { accountMode?: boolean; onClose: () => void; onReset: () => void; onSignOut?: () => Promise<void>; onOpenDesignKit?: () => void; onConnectTelegram?: () => Promise<void>; onLoadTelegramConnection?: () => Promise<TelegramConnection> }) {
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
      <p>{resetConfirmationOpen ? 'Все локальные изменения в учениках, тренировках и расписании будут удалены.' : accountMode ? 'Аккаунт защищён Supabase Auth, а данные тренировок синхронизируются через Supabase.' : 'Сброс вернёт исходных учеников, тренировки и расписание.'}</p>
      {resetConfirmationOpen ? <div className="confirmation-actions"><ActionButton variant="secondary" autoFocus onClick={() => setResetConfirmationOpen(false)}>Остаться</ActionButton><ActionButton variant="danger" onClick={onReset}>Сбросить данные</ActionButton></div> : <div className="settings-actions">{accountMode && onConnectTelegram && (telegramConnection?.connected ? <div className="telegram-connection-status"><Icon name="check" /><span><strong>Telegram подключён</strong><small>{telegramConnection.username ? `@${telegramConnection.username}` : telegramConnection.firstName}</small></span></div> : <ActionButton variant="secondary" icon="arrow-up-right" disabled={telegramBusy || telegramStatusLoading} onClick={() => void connectTelegram()}>{telegramStatusLoading ? 'Проверяем Telegram…' : telegramBusy ? 'Создаём ссылку…' : 'Подключить Telegram'}</ActionButton>)}{telegramError && <FormError>{telegramError}</FormError>}{onOpenDesignKit && <ActionButton variant="secondary" icon="workout" onClick={onOpenDesignKit}>Открыть дизайн-кит</ActionButton>}{accountMode && onSignOut ? <ActionButton variant="danger" onClick={() => void onSignOut()}>Выйти из аккаунта</ActionButton> : <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}><Icon name="trash" /> Сбросить демо-данные</button>}</div>}
    </ModalFrame>
  );
}

function ConfirmationModal({
  title,
  text,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={title} description={text} className="confirmation-sheet" role="alertdialog" showHandle={false} onClose={onClose}>
      <div className="confirmation-actions">
        <ActionButton variant="secondary" data-modal-initial-focus onClick={onClose}>Остаться</ActionButton>
        <ActionButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</ActionButton>
      </div>
    </ModalFrame>
  );
}

function NotFound() {
  return <main className="content-page"><EmptyState icon="circle" title="Ничего не найдено" text="Этот экран или запись больше не существует." action="На главную" onAction={() => go('/')} /></main>;
}
