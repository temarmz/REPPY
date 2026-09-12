import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  TRAINER_NAME,
  cloneWorkout,
  createWorkoutSession,
  createWorkoutTemplate,
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
import { collectExerciseProgress, progressHref, progressKey } from './exercise-progress';
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

const COPY = {
  createWorkout: 'Создать тренировку',
  emptyAssignments: 'На ближайшие две недели тренер пока ничего не назначил.',
  emptyHistory: 'Завершённые тренировки появятся здесь.',
};

const NAVIGATION_EVENT = 'reppy:navigate';
const MODAL_LAYER_EVENT = 'reppy:modal-layer';
const TRAINER_ALL_DAYS_PREFERENCE = 'reppy-ui:trainer-all-days';
let openModalLayers = 0;
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
        onClose={() => setPendingNavigation(null)}
        onConfirm={discardAndContinue}
      />
    ) : null,
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function findWorkout(data: DemoState, id: string) {
  return data.workouts.find((workout) => workout.id === id);
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
  'logo-text.png',
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
  const { data, hydrated, reset: resetData, setData } = useReppyData();
  const [path, setPath] = useState('/');
  const currentPathRef = useRef('/');
  const hydratedPathReady = useRef(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalLayerOpen, setModalLayerOpen] = useState(false);
  const [toast, setToast] = useState('');

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
      if (event?.type === 'popstate' && openModalLayers > 0) {
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
    if (!hydrated || hydratedPathReady.current) return;
    hydratedPathReady.current = true;

    const requestedPath = hashPath();
    if (requestedPath === '/' && data.loggedIn) {
      const homePath = data.role === 'trainer' ? '/trainer' : '/student';
      window.history.replaceState({ reppyEntry: false, reppyScroll: TOP_SCROLL_POSITION }, '', `#${homePath}`);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
    }
  }, [data.loggedIn, data.role, hydrated]);

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

  const resetDemo = () => {
    resetData();
    setSettingsOpen(false);
    go('/');
  };

  if (!hydrated || !assetsReady) {
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

  if (!data.loggedIn || path === '/') return <WelcomeScreen onLogin={login} />;

  let content: ReactNode;
  const area: 'trainer' | 'student' = path.startsWith('/student') ? 'student' : 'trainer';

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
    const scheduleTemplateMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/template\/([^/]+)$/);
    const scheduleNewMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/new$/);
    const scheduleStudentMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/);
    const workoutEditMatch = path.match(/^\/trainer\/workouts\/([^/]+)\/edit$/);
    const workoutAssignMatch = path.match(/^\/trainer\/workouts\/([^/]+)\/assign$/);
    const workoutMatch = path.match(/^\/trainer\/workouts\/([^/]+)$/);
    const sessionMatch = path.match(/^\/trainer\/sessions\/([^/]+)$/);

    if (progressMatch?.[2]) {
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
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, workoutSnapshot) => {
            const assignment = repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime);
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go('/trainer', true);
          }}
        />
      ) : <NotFound />;
    } else if (scheduleTemplateMatch) {
      const [scheduledFor, studentId, workoutId] = scheduleTemplateMatch.slice(1);
      const student = findStudent(data, studentId);
      const workout = findWorkout(data, workoutId);
      content = student?.status === 'active' && workout && isScheduleDate(scheduledFor) ? (
        <AssignWorkoutToStudent
          student={student}
          workout={workout}
          initialScheduledFor={scheduledFor}
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          onAssign={(nextDate, scheduledTime, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              workoutId: workout.id,
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor: nextDate,
              scheduledTime,
              status: 'assigned',
              workoutSnapshot: { ...cloneWorkout(workoutSnapshot), updatedAt: new Date().toISOString() },
              source: JSON.stringify(workoutSnapshot.exercises) === JSON.stringify(workout.exercises) ? 'template' : 'manual-edit',
            };
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
          onAssign={(nextDate, scheduledTime, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              workoutId: workoutSnapshot.id,
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor: nextDate,
              scheduledTime,
              status: 'assigned',
              workoutSnapshot,
              source: 'manual-edit',
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
          backPath={`/trainer/clients/${student.id}/assign`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, workoutSnapshot) => {
            const assignment = repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime);
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
          onAssign={(scheduledFor, scheduledTime, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              workoutId: workoutSnapshot.id,
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor,
              scheduledTime,
              status: 'assigned',
              workoutSnapshot,
              source: 'manual-edit',
            };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            showToast(`Тренировка назначена: ${student.name}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (clientAssignMatch?.[2]) {
      const student = findStudent(data, clientAssignMatch[1]);
      const workout = findWorkout(data, clientAssignMatch[2]);
      content = student && workout ? (
        <AssignWorkoutToStudent
          student={student}
          workout={workout}
          onAssign={(scheduledFor, scheduledTime, workoutSnapshot) => {
            setData((current) => {
              const currentWorkout = findWorkout(current, workout.id) ?? workout;
              const customizedWorkout = {
                ...cloneWorkout(currentWorkout),
                exercises: workoutSnapshot.exercises.map((exercise) => ({ ...exercise })),
                updatedAt: new Date().toISOString(),
              };
              const assignment: Assignment = {
                id: makeId('assignment'),
                workoutId: currentWorkout.id,
                studentId: student.id,
                assignedAt: new Date().toISOString(),
                scheduledFor,
                scheduledTime,
                status: 'assigned',
                workoutSnapshot: customizedWorkout,
                source: JSON.stringify(customizedWorkout.exercises) === JSON.stringify(currentWorkout.exercises) ? 'template' : 'manual-edit',
              };
              return { ...current, assignments: [...current.assignments, assignment] };
            });
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
    } else if (path === '/trainer/workouts') {
      content = <WorkoutsList data={data} />;
    } else if (path === '/trainer/workouts/new') {
      content = (
        <WorkoutForm
          onSave={(workout) => {
            setData((current) => ({ ...current, workouts: [...current.workouts, workout] }));
            showToast('Тренировка сохранена');
            go(`/trainer/workouts/${workout.id}`);
          }}
        />
      );
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
          onSave={(scheduledFor, scheduledTime, workout) => {
            const next = repeatAssignment(assignment, workout, scheduledFor, scheduledTime);
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
          onFinish={(sessionId, chargeSubscription) => {
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
    } else if (workoutEditMatch) {
      const workout = findWorkout(data, workoutEditMatch[1]);
      content = workout ? (
        <WorkoutForm
          initial={workout}
          onSave={(updated) => {
            setData((current) => ({ ...current, workouts: current.workouts.map((item) => item.id === updated.id ? updated : item) }));
            showToast('Изменения сохранены');
            go(`/trainer/workouts/${updated.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (workoutAssignMatch) {
      const workout = findWorkout(data, workoutAssignMatch[1]);
      content = workout ? (
        <AssignWorkout
          data={data}
          workout={workout}
          onAssign={(studentId, scheduledFor, scheduledTime) => {
            setData((current) => {
              const currentWorkout = findWorkout(current, workout.id) ?? workout;
              const assignment: Assignment = {
                id: makeId('assignment'),
                workoutId: currentWorkout.id,
                studentId,
                assignedAt: new Date().toISOString(),
                scheduledFor,
                scheduledTime,
                status: 'assigned',
                workoutSnapshot: cloneWorkout(currentWorkout),
                source: 'template',
              };
              return { ...current, assignments: [...current.assignments, assignment] };
            });
            const name = findStudent(data, studentId)?.name ?? 'ученику';
            showToast(`Тренировка назначена: ${name}`);
            go(`/trainer/clients/${studentId}`);
          }}
        />
      ) : <NotFound />;
    } else if (workoutMatch) {
      const workout = findWorkout(data, workoutMatch[1]);
      content = workout ? <WorkoutDetails workout={workout} onDuplicate={() => {
        const duplicate = createWorkoutTemplate(workout, `${workout.name} — копия`);
        setData((current) => ({ ...current, workouts: [...current.workouts, duplicate] }));
        showToast('Копия тренировки создана');
        go(`/trainer/workouts/${duplicate.id}/edit`);
      }} /> : <NotFound />;
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
    } else {
      content = <TrainerHome data={data} />;
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
          onFinish={(sessionId) => {
            const completedAt = new Date().toISOString();
            setData((current) => {
              const savedSession = current.sessions.find((item) => item.id === sessionId);
              return {
                ...current,
                assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, status: 'completed' } : item),
                sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt, subscriptionChargeStatus: 'charged' } : item),
                subscriptionEntries: savedSession
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
    } else {
      content = (
        <StudentHome
          data={data}
          onOpen={(assignmentId) => go(`/student/assignments/${assignmentId}`)}
        />
      );
    }
  }

  return (
    <>
      <AppShell
        area={area}
        path={path}
        data={data}
        hideBottomNav={settingsOpen || modalLayerOpen}
        onSwitchRole={switchRole}
        onSettings={() => setSettingsOpen(true)}
      >
        {content}
        {toast && <div className="toast" role="status"><Icon name="check" /> {toast}</div>}
      </AppShell>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onReset={resetDemo} />}
    </>
  );
}

function WelcomeScreen({ onLogin }: { onLogin: () => void }) {
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
            <Icon name="arrow-right" /> Попробовать REPPY
          </button>
          <div className="hero-points" aria-label="Преимущества демо">
            <span>Без регистрации</span><span>Обе роли</span><span>Работает на iPhone</span>
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
          <li><span>01</span><Icon name="calendar" /><div><h3>Тренер назначает</h3><p>Выбирает ученика, дату и время, затем адаптирует готовую программу под занятие.</p></div></li>
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
              <p>До занятия — дата, время и состав. Во время — текущие подходы и таймер. После — понятная история.</p>
              <ul>
                <li><Icon name="check" /><span><strong>Перед тренировкой</strong>Просмотр программы и запрос другого времени без звонков.</span></li>
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
        <div><p className="eyebrow">Посмотри вживую</p><h2>ПРОЙДИ ПУТЬ ТРЕНЕРА И УЧЕНИКА.</h2><p>Демо уже заполнено примерами: можно назначить тренировку, выполнить её и проверить результат с обеих сторон.</p></div>
        <button className="primary-button" type="button" onClick={onLogin}><Icon name="arrow-right" /> Открыть демо</button>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <button className="brand-mark brand-button" type="button" onClick={() => go('/')} aria-label="REPPY — на стартовый экран">
      <img className="brand-logo" src="logo-text.png" alt="" />
    </button>
  );
}

function AppShell({
  area,
  path,
  data,
  hideBottomNav,
  onSwitchRole,
  onSettings,
  children,
}: {
  area: 'trainer' | 'student';
  path: string;
  data: DemoState;
  hideBottomNav: boolean;
  onSwitchRole: () => void;
  onSettings: () => void;
  children: ReactNode;
}) {
  const student = findStudent(data, data.activeStudentId);
  const trainerNav = [
    { label: 'Главная', icon: 'home' as IconName, route: '/trainer' },
    { label: 'Календарь', icon: 'calendar' as IconName, route: '/trainer/calendar' },
    { label: 'Ученики', icon: 'users' as IconName, route: '/trainer/clients' },
  ];
  const studentNav = [
    { label: 'Сегодня', icon: 'calendar' as IconName, route: '/student' },
    { label: 'Календарь', icon: 'calendar' as IconName, route: '/student/calendar' },
    { label: 'История', icon: 'history' as IconName, route: '/student/history' },
    { label: 'Профиль', icon: 'users' as IconName, route: '/student/profile' },
  ];
  const nav = area === 'trainer' ? trainerNav : studentNav;
  const displayName = area === 'trainer' ? TRAINER_NAME : student?.name ?? 'Ученик';
  const focusMode = /^\/student\/(workout|finish|success)\//.test(path) || path.startsWith('/trainer/workout/');

  const isActive = (route: string) => {
    if (route === '/trainer/calendar') return path === route || path.startsWith('/trainer/schedule/') || path.startsWith('/trainer/assignments/') || path.startsWith('/trainer/sessions/');
    if (route.endsWith('/clients')) return path.startsWith('/trainer/clients');
    if (route.endsWith('/history')) return path.startsWith('/student/history');
    return path === route || (route === '/student' && /^\/student\/(workout|assignments)\//.test(path));
  };

  return (
    <div className={`app-shell ${area} ${focusMode ? 'focus-mode' : ''}`}>
      {!focusMode && <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <button className="role-switch" type="button" onClick={onSwitchRole}>
            <span>DEMO</span>
            <span className="role-switch-label">{area === 'trainer' ? 'Тренер' : 'Ученик'}</span>
            <Icon name="change" />
            <span className="role-switch-label">{area === 'trainer' ? 'Ученик' : 'Тренер'}</span>
          </button>
          <button className="avatar-button" type="button" onClick={onSettings} aria-label="Открыть настройки">
            {initials(displayName)}
          </button>
        </div>
      </header>}

      {!focusMode && <aside className="desktop-nav" aria-label="Основная навигация">
        <div className="profile-block">
          <span className="profile-avatar">{initials(displayName)}</span>
          <div><strong>{displayName}</strong><small>{area === 'trainer' ? 'Персональный тренер' : 'Ученик'}</small></div>
        </div>
        <nav>
          {nav.map((item) => (
            <button key={item.route} className={isActive(item.route) ? 'active' : ''} type="button" onClick={() => go(item.route, true)}>
              <span><Icon name={item.icon} /></span>{item.label}
            </button>
          ))}
        </nav>
        <button className="side-demo" type="button" onClick={onSwitchRole}><b>DEMO</b> Переключить роль</button>
      </aside>}

      <div className="page-wrap page-transition" key={path.split('?')[0]}>{children}</div>

      {!focusMode && !hideBottomNav && <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <button key={item.route} className={isActive(item.route) ? 'active' : ''} type="button" onClick={() => go(item.route, true)}>
            <span><Icon name={item.icon} /></span><small>{item.label}</small>
          </button>
        ))}
      </nav>}
    </div>
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
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
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
              <div><strong>{area === 'trainer' ? student?.name : workout?.name}</strong><small>{assignment.scheduledTime} · {area === 'trainer' ? workout?.name : exercisePreview(workout)}</small>{session?.comment && <p>«{session.comment}»</p>}</div>
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

function TrainerPlanRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
  const completed = assignment.status === 'completed' || Boolean(session);
  const target = completed
    ? session ? `/trainer/sessions/${session.id}` : `/trainer/clients/${assignment.studentId}`
    : `/trainer/assignments/${assignment.id}`;

  return (
    <button className="plan-session-row" type="button" onClick={() => go(target)} aria-label={`${student?.name}, ${assignment.scheduledTime}, ${workout?.name}${completed ? ', тренировка завершена' : ''}`}>
      <time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}>{assignment.scheduledTime}</time>
      <Avatar student={student} />
      <span><strong>{student?.name}</strong><small>{workout?.name}</small></span>
      <span className="plan-session-status">{completed && <Icon name="check" />}<Icon name="chevron-right" /></span>
    </button>
  );
}

function ScheduleStudentPicker({ date, students, onClose, onSelect }: { date: string; students: Student[]; onClose: () => void; onSelect: (student: Student) => void }) {
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet schedule-student-picker" role="dialog" aria-modal="true" aria-label={`Кого назначить на ${formatScheduleDay(date)}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-title"><div><span className="eyebrow">{formatScheduleDay(date)}</span><h2>Выбери ученика</h2></div><button type="button" onClick={onClose} aria-label="Закрыть выбор ученика"><Icon name="close" /></button></div>
          {students.length ? <div className="schedule-student-list">{students.map((student) => (
            <button key={student.id} type="button" disabled={student.status === 'invited'} onClick={() => onSelect(student)}>
              <Avatar student={student} />
              <span><strong>{student.name}</strong><small>{student.status === 'invited' ? 'Сначала ученик должен принять приглашение' : 'Выбрать тренировки'}</small></span>
              <Icon name="chevron-right" />
            </button>
          ))}</div> : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
        </section>
      </div>
    </ModalLayer>
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
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
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
            .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`))[0];
          const recent = [...data.sessions].reverse().find((item) => item.studentId === student.id && item.completedAt);
          const status = student.status === 'invited'
            ? 'Ожидает приглашения'
            : assigned
              ? `${formatCalendarDay(assigned.scheduledFor)} · ${assigned.scheduledTime} · ${findAssignmentWorkout(data, assigned)?.name}`
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
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
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
              <span><strong>{workout?.name}</strong><small>{formatCalendarDay(assignment.scheduledFor)} · {assignment.scheduledTime}</small></span><i><Icon name="chevron-right" /></i>
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
        <button className="primary-button" type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}><Icon name="plus" /> {payments.length ? 'Продлить' : 'Добавить абонемент'}</button>
        <button className="wide-secondary" type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription`)}><Icon name="history" /> История</button>
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
        <button className="primary-button" type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}><Icon name="plus" /> Добавить пополнение</button>
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

function DatePickerSheet({ title, value, min, onChange, onClose }: { title: string; value: string; min?: string; onChange: (value: string) => void; onClose: () => void }) {
  const [selectedDate, setSelectedDate] = useState(value);
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet date-picker-sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-title"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Закрыть выбор даты"><Icon name="close" /></button></div>
          <MonthDatePicker value={selectedDate} min={min} onChange={setSelectedDate} className="calendar-picker-card" />
          <button className="primary-button" type="button" onClick={() => { onChange(selectedDate); onClose(); }}><Icon name="check" /> Выбрать дату</button>
        </section>
      </div>
    </ModalLayer>
  );
}

function DatePickerField({ label, value, min, className = '', formatValue = formatSubscriptionDate, onChange }: { label: string; value: string; min?: string; className?: string; formatValue?: (value: string) => string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const displayValue = formatValue(value);
  return <>
    <div className={`date-picker-field ${className}`.trim()}>
      <span>{label}</span>
      <button type="button" aria-label={`${label}: ${displayValue}`} onClick={() => setOpen(true)}><Icon name="calendar" /><strong>{displayValue}</strong><Icon name="chevron-right" /></button>
    </div>
    {open && <DatePickerSheet title={label} value={value} min={min} onChange={onChange} onClose={() => setOpen(false)} />}
  </>;
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="button" onClick={save}><Icon name="check" /> {initial ? 'Сохранить изменения' : 'Добавить пополнение'}</button>
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
      {compact ? <div className="athlete-inline-summary"><div><p>{[student.height ? `${student.height} см` : '', student.weight ? `${student.weight} кг` : '', student.gender && student.gender !== 'not-specified' ? genderLabel : '', student.phone].filter(Boolean).join(' · ') || 'Данные ученика не заполнены'}</p><p>Ограничения: {student.contraindications || 'не указаны'}</p></div><button type="button" className="wide-secondary athlete-edit-icon" aria-label="Редактировать данные ученика" title="Редактировать данные" aria-expanded={editing} onClick={() => { if (editing) { setEditing(false); return; } setHeight(student.height ? String(student.height) : ''); setWeight(student.weight ? String(student.weight) : ''); setGender(student.gender ?? 'not-specified'); setPhone(student.phone ?? ''); setContraindications(student.contraindications ?? ''); setEditing(true); }}><Icon name="edit" /></button></div> : <div className="section-heading"><h2>Данные и ограничения</h2>{!alwaysExpanded && <button type="button" onClick={() => { setExpanded((current) => !current); setEditing(false); }}>{expanded ? 'Скрыть' : 'Показать'}</button>}</div>}
      {(compact ? editing : expanded) && (editing ? <div className="athlete-form">
        <div className="athlete-form-grid">
          <label><span>Рост, см</span><input type="number" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="182" /></label>
          <label><span>Вес, кг</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="86" /></label>
        </div>
        <label><span>Пол</span><select value={gender} onChange={(event) => setGender(event.target.value as Student['gender'])}><option value="not-specified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
        <label><span>Мобильный телефон</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" /></label>
        <label><span>Противопоказания и особенности</span><textarea value={contraindications} onChange={(event) => setContraindications(event.target.value)} maxLength={800} placeholder="Например: протрузия поясничного отдела, грыжа, болит левое запястье…" /><small>Опиши всё, что тренеру важно учитывать при составлении плана.</small></label>
        <button className="primary-button" type="button" onClick={save}><Icon name="check" /> Сохранить данные</button>
        {compact && <button type="button" className="wide-secondary" onClick={() => setEditing(false)}>Отмена</button>}
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

function InviteStudent({ onCreate }: { onCreate: (student: Student) => void }) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<Student | null>(null);
  const [copied, setCopied] = useState(false);
  const inviteUrl = created && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/invite/${created.id}/${encodeURIComponent(created.name)}` : '';

  const create = () => {
    const clean = name.trim();
    if (!clean) return;
    const student: Student = { id: makeId('student'), name: clean, status: 'invited', color: 'orange' };
    onCreate(student);
    setCreated(student);
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
          <label className="field-label" htmlFor="student-name">Имя ученика</label>
          <input id="student-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Сергей" autoFocus />
          <p className="field-hint">Мы добавим ученика в список со статусом «Ожидает приглашения».</p>
          <button className="primary-button" type="button" disabled={!name.trim()} onClick={create}><Icon name="arrow-right" /> Продолжить</button>
        </section>
      ) : (
        <section className="invite-ready">
          <div className="success-mark"><Icon name="arrow-up-right" /></div>
          <h2>{created.name} почти в команде</h2>
          <p>Отправь эту демо-ссылку ученику. На его устройстве откроется персональный кабинет для проверки интерфейса.</p>
          <output>{inviteUrl}</output>
          <button className="primary-button" type="button" onClick={copy}><Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
          <button className="wide-secondary" type="button" onClick={() => go('/trainer/clients')}><Icon name="check" /> Готово</button>
        </section>
      )}
    </main>
  );
}

function WorkoutsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page workouts-page">
      <button className="list-primary-action" type="button" onClick={() => go('/trainer/workouts/new')}><Icon name="plus" /> {COPY.createWorkout}</button>
      <section className="workout-template-list">
        {data.workouts.map((workout, index) => (
            <button className="workout-template-row" key={workout.id} type="button" onClick={() => go(`/trainer/workouts/${workout.id}`)}>
              <span className="template-number">{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{workout.name}</h2><p>{exercisePreview(workout, true)}</p></div>
              <Icon name="chevron-right" />
            </button>
        ))}
      </section>
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
      return `${b.scheduledFor} ${b.scheduledTime}`.localeCompare(`${a.scheduledFor} ${a.scheduledTime}`);
    });
  const visibleAssignments = showAllHistory ? previousAssignments : previousAssignments.slice(0, 8);

  return (
    <main className="content-page workouts-page schedule-workout-picker-page">
      <PageHeader back={backPath} eyebrow={`${student.name} · ${formatScheduleDay(scheduledFor)}`} preserveEyebrowCase title="ВЫБРАТЬ ТРЕНИРОВКУ" />
      <p className="page-lead">Повтори одну из тренировок {student.name} или собери новую с нуля.</p>
      <button className="list-primary-action" type="button" onClick={() => go(`${routeBase}/new`)}><Icon name="plus" /> {COPY.createWorkout}</button>
      {previousAssignments.length ? (
        <>
        <section className="workout-template-list schedule-history-list" aria-label={`Ранее назначенные тренировки ${student.name}`}>
          {visibleAssignments.map((assignment) => {
            const workout = workoutForRepeat(data, assignment);
            if (!workout) return null;
            const completed = assignment.status === 'completed' || data.sessions.some((session) => session.assignmentId === assignment.id && session.completedAt);
            const overdue = !completed && assignment.scheduledFor < dateKey();
            const statusLabel = completed ? 'Завершена' : overdue ? 'Не завершена' : 'Запланирована';
            return (
              <button className="workout-template-row" key={assignment.id} type="button" onClick={() => go(`${routeBase}/copy/${assignment.id}`)}>
                <span className="history-copy-icon"><Icon name="copy" /></span>
                <div><h2>{workout.name}</h2><p><b className={`history-status ${completed ? 'completed' : overdue ? 'overdue' : ''}`}>{statusLabel}</b>{formatCalendarDay(assignment.scheduledFor)} · {assignment.scheduledTime} · {exercisePreview(workout, true)}</p></div>
                <Icon name="chevron-right" />
              </button>
            );
          })}
        </section>
        {previousAssignments.length > 8 && <button className="wide-secondary history-show-more" type="button" onClick={() => setShowAllHistory((current) => !current)}>{showAllHistory ? 'Показать последние' : `Показать ещё ${previousAssignments.length - 8}`}</button>}
        </>
      ) : <EmptyState icon="history" title="Предыдущих тренировок нет" text="Создай первую тренировку для этого ученика — позже её можно будет повторять на новые даты." />}
    </main>
  );
}

function AssignWorkoutToStudent({
  student,
  workout,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
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
  backPath?: string;
  title?: string;
  submitLabel?: string;
  submitIcon?: IconName;
  onAssign: (scheduledFor: string, scheduledTime: string, workoutSnapshot: Workout) => void;
}) {
  const [scheduledFor, setScheduledFor] = useState(initialScheduledFor);
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => workout.exercises.map((exercise) => ({ ...exercise })));
  const [error, setError] = useState('');
  const [initialFormState] = useState(() => JSON.stringify({ scheduledFor: initialScheduledFor, scheduledTime: initialScheduledTime, exercises: workout.exercises }));
  const currentFormState = JSON.stringify({ scheduledFor, scheduledTime, exercises });
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(currentFormState !== initialFormState);

  const assign = () => {
    if (!scheduledFor || !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    allowNextNavigation();
    onAssign(scheduledFor, scheduledTime, {
      ...cloneWorkout(workout),
      exercises: exercises.map((exercise) => ({ ...exercise })),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={backPath ?? `/trainer/clients/${student.id}/assign`} eyebrow={student.name} title={title} />
      <section className="plan-context-card assignment-edit-card">
        <div className="assignment-edit-person"><Avatar student={student} /><div><span>УЧЕНИК</span><strong>{student.name}</strong><p>{workout.name}</p></div></div>
        <div className="schedule-fields">
          <DatePickerField className="schedule-field" label="Дата тренировки" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={(value) => { setScheduledFor(value); setError(''); }} />
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => { setScheduledTime(event.target.value); setError(''); }} /></label>
        </div>
      </section>
      <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="plan-sticky-actions"><button className="primary-button plan-submit-button" type="button" disabled={!scheduledFor || !scheduledTime || !exercises.length} onClick={assign}><Icon name={submitIcon} /> {submitLabel ?? `Назначить ${student.name}`}</button></div>
      {discardPrompt}
    </main>
  );
}

function NewAssignmentForStudent({
  student,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
  backPath,
  onAssign,
}: {
  student: Student;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  backPath: string;
  onAssign: (scheduledFor: string, scheduledTime: string, workoutSnapshot: Workout) => void;
}) {
  const [name, setName] = useState('');
  const [scheduledFor, setScheduledFor] = useState(initialScheduledFor);
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [error, setError] = useState('');
  const currentFormState = JSON.stringify({ name, scheduledFor, scheduledTime, exercises });
  const [initialFormState] = useState(() => JSON.stringify({ name: '', scheduledFor: initialScheduledFor, scheduledTime: initialScheduledTime, exercises: [] }));
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(currentFormState !== initialFormState);

  const assign = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (!scheduledFor || !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    const createdAt = new Date().toISOString();
    allowNextNavigation();
    onAssign(scheduledFor, scheduledTime, {
      id: makeId('workout'),
      name: name.trim(),
      exercises: exercises.map((exercise) => ({ ...exercise })),
      createdAt,
    });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={backPath} eyebrow={student.name} title="СОЗДАТЬ ТРЕНИРОВКУ" />
      <section className="plan-context-card assignment-edit-card new-assignment-card">
        <div className="assignment-edit-person"><Avatar student={student} /><div><span>УЧЕНИК</span><strong>{student.name}</strong></div></div>
        <label className="field-label" htmlFor="new-assignment-name">Название тренировки</label>
        <input id="new-assignment-name" className="text-input" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Например, Грудь + плечи" autoFocus />
        <div className="schedule-fields">
          <DatePickerField className="schedule-field" label="Дата тренировки" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={(value) => { setScheduledFor(value); setError(''); }} />
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => { setScheduledTime(event.target.value); setError(''); }} /></label>
        </div>
      </section>
      <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="plan-sticky-actions"><button className="primary-button plan-submit-button" type="button" disabled={!name.trim() || !scheduledFor || !scheduledTime || !exercises.length} onClick={assign}><Icon name="plus" /> Назначить тренировку</button></div>
      {discardPrompt}
    </main>
  );
}

function WorkoutForm({ initial, onSave, backPath }: { initial?: Workout; onSave: (workout: Workout) => void; backPath?: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => initial?.exercises.map((exercise) => ({ ...exercise })) ?? []);
  const [error, setError] = useState('');
  const [initialFormState] = useState(() => JSON.stringify({ name: initial?.name ?? '', exercises: initial?.exercises ?? [] }));
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(JSON.stringify({ name, exercises }) !== initialFormState);

  const save = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    const now = new Date().toISOString();
    allowNextNavigation();
    onSave({
      id: initial?.id ?? makeId('workout'),
      name: name.trim(),
      exercises: exercises.map((exercise) => ({ ...exercise })),
      createdAt: initial?.createdAt ?? now,
      updatedAt: initial ? now : undefined,
    });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={backPath ?? (initial ? `/trainer/workouts/${initial.id}` : '/trainer/workouts')} eyebrow={initial ? 'Редактирование тренировки' : 'Новая тренировка'} title={initial ? initial.name.toUpperCase() : 'СОЗДАТЬ ТРЕНИРОВКУ'} />
      <section className="plan-context-card workout-name-card">
        <label className="field-label" htmlFor="workout-name">Название тренировки</label>
        <input id="workout-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Грудь + плечи" />
        {initial && <p className="plan-editor-hint">Изменения применятся только к будущим назначениям.</p>}
      </section>
      <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="plan-sticky-actions"><button className="primary-button save-workout" type="button" onClick={save}><Icon name="check" /> Сохранить тренировку</button></div>
      {discardPrompt}
    </main>
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
  return (
    <section className="readonly-exercise-list">
      {workout.exercises.map((exercise, index) => {
        const progressAction = onProgress?.(exercise);
        return (
          <article className="readonly-exercise-card" key={exercise.id}>
            <header>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{exercise.name}</h2><small>{exerciseMetadata(exercise)}</small></div>
            </header>
            <div className="readonly-set-list">
              {getExerciseSetPlans(exercise).map((set, setIndex) => (
                <p key={setIndex}><span>Подход {setIndex + 1}</span><strong>{plannedSetLabel(exercise, set)}</strong></p>
              ))}
            </div>
            {exercise.coachNote && <p className="readonly-coach-note"><Icon name="edit" /> {exercise.coachNote}</p>}
            {progressAction && <button type="button" className="wide-secondary exercise-progress-button" onClick={progressAction}><Icon name="history" /> Прогресс упражнения</button>}
          </article>
        );
      })}
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
  exercises,
  onChange,
  minSetsByExerciseId = {},
}: {
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
      plannedSets: Array.from({ length: 3 }, () => ({ targetReps: choice.measureType === 'duration' ? 30 : 10, targetWeight: loadMode === 'bodyweight' ? 0 : 20 })),
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

  return (
    <section className="workout-plan-editor">
      <div className="form-section-heading"><h2>Упражнения</h2></div>
      {!exercises.length && <button className="add-exercise empty-plan-action" type="button" onClick={() => setPickerAfterId('start')}><Icon name="plus" /> Добавить упражнение</button>}
      <div className="active-exercise-list plan-exercise-list">
        {exercises.map((exercise, index) => (
          <PlanExerciseCard
            key={exercise.id}
            exercise={exercise}
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
            onAddAfter={() => setPickerAfterId(exercise.id)}
          />
        ))}
      </div>

      {pickerAfterId && <ActiveExercisePicker onClose={() => setPickerAfterId(null)} onSelect={addExercise} />}
      {instructionExercise && <ExerciseInstructionModal exercise={instructionExercise} onClose={() => setInstructionExercise(null)} />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        canDeleteExercise={exercises.length > 1 && (minSetsByExerciseId[actionExercise.id] ?? 0) === 0}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          onChange(exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
    </section>
  );
}

function PlanExerciseCard({
  exercise,
  index,
  totalExercises,
  recentlyMoved,
  onShowInstruction,
  onShowActions,
  onMoveUp,
  onMoveDown,
  onNoteChange,
  onSetChange,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
  onAddAfter,
}: {
  exercise: WorkoutExercise;
  index: number;
  totalExercises: number;
  recentlyMoved: boolean;
  onShowInstruction: () => void;
  onShowActions: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNoteChange: (note: string) => void;
  onSetChange: (index: number, patch: Partial<WorkoutSetPlan>) => void;
  onAddSet: () => void;
  canRemoveSet: boolean;
  onRemoveSet: () => void;
  onAddAfter: () => void;
}) {
  const [commentOpen, setCommentOpen] = useState(Boolean(exercise.coachNote));
  const bodyweight = exercise.loadMode === 'bodyweight';
  return (
    <article data-plan-exercise={exercise.id} className={'active-exercise-card plan-exercise-card ' + (recentlyMoved ? 'recently-moved' : '')}>
      <header className="active-exercise-card-header">
        <span className="active-exercise-number">{String(index + 1).padStart(2, '0')}</span>
        <div><h2>{exercise.name}</h2><small className="active-exercise-meta">{exerciseMetadata(exercise)}</small></div>
        <div className="active-exercise-corner-actions">
          <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={onShowInstruction} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
          <button className="exercise-menu" type="button" aria-haspopup="dialog" onClick={onShowActions} aria-label={'Действия — ' + exercise.name}><Icon name="more" /></button>
        </div>
      </header>
      <div className="exercise-toolbar">
        <div className="active-exercise-actions"><button className={exercise.coachNote ? 'has-value' : ''} type="button" aria-expanded={commentOpen} onClick={() => setCommentOpen((current) => !current)}><Icon name="edit" /> {commentOpen ? 'Скрыть комментарий' : exercise.coachNote ? 'Показать комментарий' : 'Добавить комментарий'}</button></div>
        <div className="exercise-order-controls">
          <button className="move-up" type="button" disabled={index === 0} onClick={onMoveUp} aria-label={'Поднять ' + exercise.name + ' выше'}><Icon name="chevron-left" /></button>
          <button className="move-down" type="button" disabled={index === totalExercises - 1} onClick={onMoveDown} aria-label={'Опустить ' + exercise.name + ' ниже'}><Icon name="chevron-right" /></button>
        </div>
      </div>
      {commentOpen && <label className="active-comment-field"><span>Комментарий к упражнению</span><textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => onNoteChange(event.target.value)} placeholder="Например: держи локти вдоль тела" autoFocus /></label>}
      <section className="active-card-sets plan-card-sets">
        {getExerciseSetPlans(exercise).map((set, setIndex) => (
          <article className={'set-card plan-set-card ' + (bodyweight ? 'bodyweight' : '')} key={setIndex}>
            <div className="set-number"><span>ПОДХОД</span><strong>{setIndex + 1}</strong></div>
            <div className={'set-metrics ' + (bodyweight ? 'single-metric' : '')}>
              {!bodyweight && <label><span>КГ</span><EditableNumberInput value={set.targetWeight} step={2.5} inputMode="decimal" onChange={(targetWeight) => onSetChange(setIndex, { targetWeight })} /></label>}
              <label><span>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</span><EditableNumberInput value={set.targetReps} inputMode="numeric" min={1} onChange={(targetReps) => onSetChange(setIndex, { targetReps })} /></label>
            </div>
          </article>
        ))}
      </section>
      <footer className="active-exercise-footer-actions"><SetCountControl exerciseName={exercise.name} count={getExerciseSetPlans(exercise).length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} /><button type="button" onClick={onAddAfter}><Icon name="plus" /> Ещё упражнение</button></footer>
    </article>
  );
}

function EditableNumberInput({ value, onChange, min = 0, step = 1, inputMode = 'numeric' }: { value: number; onChange: (value: number) => void; min?: number; step?: number; inputMode?: 'numeric' | 'decimal' }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const nextDraft = draft ?? String(value);
    if (!nextDraft.trim()) {
      setDraft(null);
      return;
    }
    const parsed = Number(nextDraft.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    const next = Math.max(min, parsed);
    setDraft(null);
    onChange(next);
  };

  return <input type="number" min={min} step={step} inputMode={inputMode} value={draft ?? String(value)} onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }} onChange={(event) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const parsed = Number(nextDraft.replace(',', '.'));
    if (nextDraft.trim() && Number.isFinite(parsed)) onChange(Math.max(min, parsed));
  }} onBlur={commit} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} />;
}


function WorkoutDetails({ workout, onDuplicate }: { workout: Workout; onDuplicate: () => void }) {
  return (
    <main className="content-page narrow-page">
      <PageHeader back="/trainer/workouts" eyebrow="Тренировка" title={workout.name.toUpperCase()} />
      <div className="workout-detail-actions">
        <button className="primary-button" type="button" onClick={() => go('/trainer/workouts/' + workout.id + '/assign')}><Icon name="plus" /> Назначить</button>
        <button className="wide-secondary" type="button" onClick={() => go('/trainer/workouts/' + workout.id + '/edit')}><Icon name="edit" /> Редактировать</button>
        <button className="wide-secondary" type="button" onClick={onDuplicate}><Icon name="copy" /> Дублировать</button>
      </div>
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <ReadOnlyExerciseList workout={workout} />
    </main>
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
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={`${student.name} · ${formatCalendarDay(assignment.scheduledFor)} · ${assignment.scheduledTime}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      {assignment.rescheduleRequest && <section className="reschedule-request-card">
        <div><span>ЗАПРОС НА ПЕРЕНОС</span><h2>{student.name} предлагает другое время</h2><p><strong>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)}</strong><time>{assignment.rescheduleRequest.scheduledTime}</time></p></div>
        <div className="reschedule-request-actions"><button className="wide-secondary" type="button" onClick={onDeclineRequest}><Icon name="close" /> Отклонить</button><button className="primary-button" type="button" onClick={onAcceptRequest}><Icon name="check" /> Подтвердить</button></div>
      </section>}
      {(balance <= 2 || !hasSubscription) && <section className={`subscription-warning ${subscriptionTone(balance, hasSubscription)}`}>
        <Icon name={balance <= 0 || !hasSubscription ? 'minus' : 'history'} />
        <div><strong>{subscriptionBalanceLabel(balance, hasSubscription)}</strong><small>Тренировку можно провести без ограничения.</small></div>
        <button type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>{hasSubscription ? 'Продлить' : 'Добавить'}</button>
      </section>}
      <div className="assignment-detail-actions">
        {assignment.status === 'assigned' && <button className="primary-button assignment-start-button" type="button" onClick={() => go(`/trainer/workout/${assignment.id}`)}><Icon name="workout" /> {activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</button>}
        {assignment.status === 'assigned' && <button className="wide-secondary" type="button" onClick={() => go(`/trainer/assignments/${assignment.id}/edit`)}><Icon name="edit" /> Редактировать</button>}
        <button className="wide-secondary" type="button" onClick={() => go(`/trainer/assignments/${assignment.id}/repeat`)}><Icon name="copy" /> Повторить на другую дату</button>
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
  const [scheduledTime, setScheduledTime] = useState(assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime);
  if (!workout) return <NotFound />;
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const canStart = Boolean(activeSession) || assignment.scheduledFor === dateKey();
  const scheduleUnchanged = scheduledFor === assignment.scheduledFor && scheduledTime === assignment.scheduledTime;
  const balance = subscriptionBalance(data.subscriptionEntries, assignment.studentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, assignment.studentId).length > 0;

  return (
    <main className="content-page narrow-page student-assignment-page">
      <PageHeader back="/student" eyebrow="Предстоящая тренировка" title={workout.name.toUpperCase()} />
      <section className="student-assignment-schedule">
        <span><Icon name="calendar" /></span>
        <div><small>ДАТА И ВРЕМЯ</small><strong>{formatScheduleDay(assignment.scheduledFor)}</strong><time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}>{assignment.scheduledTime}</time></div>
      </section>

      {assignment.rescheduleRequest ? <section className="student-request-status"><Icon name="check" /><div><strong>Новое время предложено</strong><p>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)} · {assignment.rescheduleRequest.scheduledTime}</p><small>Тренер увидит запрос и подтвердит или отклонит его.</small></div></section> : <button className="wide-secondary student-reschedule-button" type="button" onClick={() => setRequestOpen((current) => !current)}><Icon name="calendar" /> Предложить другое время</button>}

      {requestOpen && !assignment.rescheduleRequest && <section className="student-reschedule-form">
        <div className="schedule-fields">
          <DatePickerField className="schedule-field" label="Новая дата" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={setScheduledFor} />
          <label className="schedule-field"><span>Новое время</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
        <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime || scheduleUnchanged} onClick={() => { onRequest(scheduledFor, scheduledTime); setRequestOpen(false); }}><Icon name="check" /> Отправить тренеру</button>
      </section>}

      {balance <= 0 && <section className="subscription-warning debt student-debt-warning">
        <Icon name="minus" />
        <div><strong>{subscriptionBalanceLabel(balance, hasSubscription)}</strong><small>Эту тренировку можно завершить в долг. Занятие спишется как обычно.</small></div>
      </section>}

      {canStart && <button className="primary-button student-start-button" type="button" onClick={onStart}><Icon name="workout" /> {activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</button>}
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
  onSave: (scheduledFor: string, scheduledTime: string, workout: Workout) => void;
}) {
  const student = findStudent(data, assignment.studentId);
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState(assignment.scheduledTime);
  const [exercises, setExercises] = useState(() => sourceWorkout.exercises.map((exercise) => ({ ...exercise })));
  const [initialFormState] = useState(() => JSON.stringify({ scheduledFor: dateKey(), scheduledTime: assignment.scheduledTime, exercises: sourceWorkout.exercises }));
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(JSON.stringify({ scheduledFor, scheduledTime, exercises }) !== initialFormState);
  if (!student) return <NotFound />;

  const copyWorkout = () => {
    if (!scheduledFor || !scheduledTime || !exercises.length) return;
    allowNextNavigation();
    onSave(scheduledFor, scheduledTime, { ...cloneWorkout(sourceWorkout), exercises });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/assignments/${assignment.id}`} eyebrow={student.name} title="ПОВТОРИТЬ ТРЕНИРОВКУ" />
      <section className="plan-context-card repeat-assignment-form">
        <div className="assignment-edit-person"><Avatar student={student} large /><div><span>УЧЕНИК</span><strong>{student.name}</strong><p>{sourceWorkout.name}</p></div></div>
        <div className="schedule-fields">
          <DatePickerField className="schedule-field" label="Новая дата" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={setScheduledFor} />
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
      </section>
      <WorkoutExerciseEditor exercises={exercises} onChange={setExercises} />
      <div className="plan-sticky-actions"><button className="primary-button plan-submit-button" type="button" disabled={!scheduledFor || !scheduledTime || !exercises.length} onClick={copyWorkout}><Icon name="plus" /> Назначить тренировку</button></div>
      {discardPrompt}
    </main>
  );
}


function AssignWorkout({ data, workout, onAssign }: { data: DemoState; workout: Workout; onAssign: (studentId: string, scheduledFor: string, scheduledTime: string) => void }) {
  const { students } = data;
  const [selected, setSelected] = useState(students.find((student) => student.id === 'artem' && student.status === 'active')?.id ?? students.find((student) => student.status === 'active')?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const chosen = students.find((student) => student.id === selected);
  return (
    <main className="content-page narrow-page">
      <PageHeader back={'/trainer/workouts/' + workout.id} eyebrow={workout.name} title="КОМУ НАЗНАЧИТЬ?" />
      {students.length ? (
        <section className="select-student-list">
          {students.map((student) => (
            <button className={selected === student.id ? 'selected' : ''} key={student.id} type="button" disabled={student.status === 'invited'} onClick={() => setSelected(student.id)}>
              <Avatar student={student} /><span><strong>{student.name}</strong>{student.status === 'invited' && <small>Сначала ученик должен принять приглашение</small>}</span><i><Icon name={selected === student.id ? 'check' : 'circle'} /></i>
            </button>
          ))}
          <div className="schedule-fields">
            <DatePickerField className="schedule-field" label="Дата тренировки" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={setScheduledFor} />
            <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
          </div>
          <div className="plan-sticky-actions">
            <button className="primary-button assign-button" type="button" onClick={() => selected && scheduledFor && scheduledTime && onAssign(selected, scheduledFor, scheduledTime)} disabled={!selected || !scheduledFor || !scheduledTime}><Icon name="plus" /> Назначить {chosen?.name ? chosen.name : ''}</button>
          </div>
        </section>
      ) : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </main>
  );
}


function EditAssignment({ data, assignment, onSave, onDelete }: { data: DemoState; assignment: Assignment; onSave: (assignment: Assignment) => void; onDelete: (assignment: Assignment) => void }) {
  const [scheduledFor, setScheduledFor] = useState(assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.scheduledTime);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => assignment.workoutSnapshot.exercises.map((exercise) => ({ ...exercise })));
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const student = findStudent(data, assignment.studentId);
  const workout = findAssignmentWorkout(data, assignment);
  const [initialFormState] = useState(() => JSON.stringify({ scheduledFor: assignment.scheduledFor, scheduledTime: assignment.scheduledTime, exercises: assignment.workoutSnapshot.exercises }));
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(JSON.stringify({ scheduledFor, scheduledTime, exercises }) !== initialFormState);
  const save = () => {
    if (!scheduledFor || !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    if (!workout) return;
    const exercisesChanged = JSON.stringify(exercises) !== JSON.stringify(workout.exercises);
    allowNextNavigation();
    onSave({
      ...assignment,
      scheduledFor,
      scheduledTime,
      workoutSnapshot: exercisesChanged ? {
        ...cloneWorkout(workout),
        exercises: exercises.map((exercise) => ({ ...exercise })),
        updatedAt: new Date().toISOString(),
      } : cloneWorkout(workout),
      source: exercisesChanged ? 'manual-edit' : assignment.source,
    });
  };

  if (!student || !workout) return <NotFound />;

  return (
    <main className="content-page narrow-page">
      <PageHeader back={'/trainer/assignments/' + assignment.id} eyebrow={student.name + ' · ' + workout.name} title="РЕДАКТИРОВАТЬ ТРЕНИРОВКУ" />
      <section className="plan-context-card assignment-edit-card">
        <div className="assignment-edit-person"><Avatar student={student} /><div><span>УЧЕНИК</span><strong>{student.name}</strong><p>{workout.name}</p></div></div>
        <div className="schedule-fields">
          <DatePickerField className="schedule-field" label="Дата тренировки" value={scheduledFor} min={dateKey()} formatValue={formatCalendarDay} onChange={setScheduledFor} />
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
      </section>
      <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="danger-button plan-delete-button" type="button" onClick={() => setDeleteOpen(true)}><Icon name="trash" /> Удалить назначение</button>
      <div className="plan-sticky-actions">
        <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime} onClick={save}><Icon name="check" /> Сохранить изменения</button>
      </div>
      {deleteOpen && <ConfirmationModal
        title="Удалить тренировку?"
        text={`«${workout.name}» исчезнет из расписания ${student.name}.`}
        confirmLabel="Удалить тренировку"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          allowNextNavigation();
          setDeleteOpen(false);
          onDelete(assignment);
        }}
      />}
      {discardPrompt}
    </main>
  );
}

function StudentHome({ data, onOpen }: { data: DemoState; onOpen: (assignmentId: string) => void }) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const assignments = data.assignments
    .filter((item) => item.studentId === data.activeStudentId && item.status === 'assigned' && item.scheduledFor >= dateKey() && item.scheduledFor <= dateKey(horizon))
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
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
          <div className="student-card-top"><time dateTime={`${mainAssignment.scheduledFor}T${mainAssignment.scheduledTime}`}><strong>{formatScheduleDay(mainAssignment.scheduledFor)}</strong><small>{mainAssignment.scheduledTime}</small></time>{mainSession && <b>{mainProgress}%</b>}</div>
          <div><h2>{mainWorkout?.name}</h2><p>{exercisePreview(mainWorkout)}</p></div>
          {mainSession && <div className="workout-progress"><span style={{ width: `${mainProgress}%` }} /></div>}
          <button type="button" onClick={() => onOpen(mainAssignment.id)}><Icon name="calendar" /> Посмотреть тренировку</button>
        </section>
      ) : <EmptyState icon="sun" title="Две недели свободны" text={COPY.emptyAssignments} />}

      {laterAssignments.length > 0 && <section className="student-upcoming">
        <div className="section-heading"><h2>Следующие тренировки</h2></div>
        <div>{laterAssignments.map((assignment) => {
          const workout = findAssignmentWorkout(data, assignment);
          return <button className="student-upcoming-row" key={assignment.id} type="button" onClick={() => onOpen(assignment.id)}><time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}><strong>{formatCalendarDay(assignment.scheduledFor)}</strong><small>{assignment.scheduledTime}</small></time><span><strong>{workout?.name}</strong><small>{exercisePreview(workout)}</small></span><Icon name="chevron-right" /></button>;
        })}</div>
      </section>}
    </main>
  );
}

function ActiveWorkout({
  workout,
  session,
  student,
  scheduledFor,
  scheduledTime,
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
  scheduledTime: string;
  backPath: string;
  onStart: () => void;
  onUpdate: (sessionId: string, results: SetResult[]) => void;
  onWorkoutUpdate: (sessionId: string, workout: Workout) => void;
  onFinish: (sessionId: string, chargeSubscription: boolean) => void;
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
      plannedSets: Array.from({ length: 3 }, () => ({ targetReps: definition.measureType === 'duration' ? 30 : 10, targetWeight: loadMode === 'bodyweight' ? 0 : 20 })),
      coachNote: '',
    });
    const next = workout.exercises.map((exercise) => ({ ...exercise }));
    next.splice(afterIndex + 1, 0, nextExercise);
    updateWorkout(next);
    setPickerAfterId(nextExercise.id);
    focusExercise(nextExercise.id);
  };

  const actionExercise = workout.exercises.find((exercise) => exercise.id === actionExerciseId);
  const actionResults = actionExercise ? session.results.filter((result) => result.exerciseId === actionExercise.id) : [];
  const actionMinimumSets = Math.max(0, ...actionResults.filter((result) => result.completed).map((result) => result.setNumber));

  return (
    <main className="active-workout-page active-workout-list-page">
      <div className="active-sticky-header">
        <header className="active-header">
          <button type="button" onClick={() => goBack(backPath)} aria-label="Вернуться назад"><Icon name="chevron-left" /></button>
          <div className="active-header-copy"><span>{student ? `${student.name} · ${formatCalendarDay(scheduledFor)} · ${scheduledTime}` : `${formatCalendarDay(scheduledFor)} · ${scheduledTime}`}</span><strong>{workout.name} · <i className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Сохраняем…' : 'Сохранено'}</i></strong></div>
          <div className="active-timing"><time dateTime={'PT' + elapsed.elapsedSeconds + 'S'} aria-label={'Прошло ' + elapsed.label}>{elapsed.label}</time><b>{progress}%</b></div>
        </header>
        <div className="active-progress"><span style={{ width: progress + '%' }} /></div>
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
              onAddAfter={() => setPickerAfterId(exercise.id)}
              onMoveUp={() => moveExercise(index, index - 1)}
              onMoveDown={() => moveExercise(index, index + 1)}
            />
          );
        })}
      </section>

      {pickerAfterId && <ActiveExercisePicker onClose={() => setPickerAfterId(null)} onSelect={addExerciseAfter} />}
      {instructionExercise && <ExerciseInstructionModal exercise={instructionExercise} onClose={() => setInstructionExercise(null)} />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        canDeleteExercise={workout.exercises.length > 1 && actionMinimumSets === 0}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          updateWorkout(workout.exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
      {finishOpen && trainerCanWaiveCharge && <FinishWorkoutModal
        balance={balance}
        unfinishedCount={unfinishedCount}
        canWaiveCharge={trainerCanWaiveCharge}
        onClose={() => setFinishOpen(false)}
        onFinish={(chargeSubscription) => {
          setFinishOpen(false);
          onFinish(session.id, chargeSubscription);
        }}
      />}

      <footer className="exercise-navigation single-action">
        <button className="finish-workout" type="button" onClick={() => trainerCanWaiveCharge ? setFinishOpen(true) : onFinish(session.id, false)}><Icon name="check" /> Завершить тренировку</button>
      </footer>
    </main>
  );
}

function FinishWorkoutModal({ balance, unfinishedCount, canWaiveCharge, onClose, onFinish }: { balance: number; unfinishedCount: number; canWaiveCharge: boolean; onClose: () => void; onFinish: (chargeSubscription: boolean) => void }) {
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet finish-workout-sheet" role="dialog" aria-modal="true" aria-label="Завершение тренировки" onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-title"><div>{canWaiveCharge && <span className="eyebrow">АБОНЕМЕНТ</span>}<h2>Завершить тренировку</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
          {unfinishedCount > 0 && <div className="finish-incomplete-warning"><Icon name="minus" /><div><strong>Есть незавершённые подходы</strong><small>Не отмечено: {unfinishedCount}. Результат сохранится в текущем виде.</small></div></div>}
          {canWaiveCharge && <div className={`finish-balance-preview ${subscriptionTone(balance)}`}>
            <span>СЕЙЧАС</span><strong>{subscriptionBalanceLabel(balance)}</strong>
            <Icon name="arrow-right" />
            <span>ПОСЛЕ</span><strong>{subscriptionBalanceLabel(balance - 1)}</strong>
          </div>}
          <div className="finish-subscription-actions">
            <button className="primary-button" type="button" onClick={() => onFinish(true)}><Icon name="check" /> {canWaiveCharge ? 'Завершить и списать занятие' : 'Завершить тренировку'}</button>
            {canWaiveCharge && <button className="wide-secondary" type="button" onClick={() => onFinish(false)}><Icon name="minus" /> Не списывать занятие</button>}
          </div>
        </section>
      </div>
    </ModalLayer>
  );
}

function SetCountControl({
  exerciseName,
  count,
  canRemove,
  onRemove,
  onAdd,
}: {
  exerciseName: string;
  count: number;
  canRemove: boolean;
  onRemove: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="set-count-control" role="group" aria-label={`Подходы — ${exerciseName}`}>
      <span>Подходы</span>
      <button type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Удалить последний подход — ${exerciseName}`}><Icon name="minus" /></button>
      <strong aria-live="polite">{count}</strong>
      <button type="button" onClick={onAdd} aria-label={`Добавить подход — ${exerciseName}`}><Icon name="plus" /></button>
    </div>
  );
}

function ActiveExerciseCard({
  exercise,
  index,
  totalExercises,
  results,
  recentlyMoved,
  onNoteChange,
  onResultChange,
  onShowInstruction,
  onShowActions,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
  onAddAfter,
  onMoveUp,
  onMoveDown,
}: {
  exercise: WorkoutExercise;
  index: number;
  totalExercises: number;
  results: SetResult[];
  recentlyMoved: boolean;
  onNoteChange: (coachNote: string) => void;
  onResultChange: (setNumber: number, patch: Partial<SetResult>) => void;
  onShowInstruction: () => void;
  onShowActions: () => void;
  onAddSet: () => void;
  canRemoveSet: boolean;
  onRemoveSet: () => void;
  onAddAfter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const completedSets = results.filter((result) => result.completed).length;
  const allCompleted = results.length > 0 && completedSets === results.length;

  return (
    <article data-active-exercise={exercise.id} className={'active-exercise-card ' + (allCompleted ? 'completed ' : '') + (recentlyMoved ? 'recently-moved' : '')}>
      <header className="active-exercise-card-header">
        <span className="active-exercise-number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>{exercise.name}</h2>
          <small className="active-exercise-meta">{exerciseMetadata(exercise)}</small>
        </div>
        <div className="active-exercise-corner-actions">
          <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={onShowInstruction} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
          <button className="exercise-menu" type="button" aria-haspopup="dialog" onClick={onShowActions} aria-label={'Действия — ' + exercise.name}><Icon name="more" /></button>
        </div>
      </header>

      <div className="exercise-toolbar">
        <div className="active-exercise-actions">
          <button className={exercise.coachNote ? 'has-value' : ''} type="button" aria-expanded={commentOpen} onClick={() => setCommentOpen((current) => !current)}><Icon name="edit" /> {commentOpen ? 'Скрыть комментарий' : exercise.coachNote ? 'Показать комментарий' : 'Добавить комментарий'}</button>
        </div>
        <div className="exercise-order-controls">
          <button className="move-up" type="button" disabled={index === 0} onClick={onMoveUp} aria-label={'Поднять ' + exercise.name + ' выше'}><Icon name="chevron-left" /></button>
          <button className="move-down" type="button" disabled={index === totalExercises - 1} onClick={onMoveDown} aria-label={'Опустить ' + exercise.name + ' ниже'}><Icon name="chevron-right" /></button>
        </div>
      </div>

      {commentOpen && <label className="active-comment-field">
        <span>Комментарий к упражнению</span>
        <textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => onNoteChange(event.target.value)} placeholder="Например: держи локти вдоль тела" autoFocus />
      </label>}

      <section className="active-card-sets">
        {results.map((result) => (
          <article className={'set-card ' + (result.completed ? 'completed' : '')} key={result.setNumber}>
            <div className="set-number"><span>ПОДХОД</span><strong>{result.setNumber}</strong></div>
            <div className={'set-metrics ' + (exercise.loadMode === 'bodyweight' ? 'single-metric' : '')}>
              {exercise.loadMode !== 'bodyweight' && <label><span>КГ</span><EditableNumberInput value={result.actualWeight} step={2.5} inputMode="decimal" onChange={(actualWeight) => onResultChange(result.setNumber, { actualWeight })} /></label>}
              <label><span>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</span><EditableNumberInput value={result.actualReps} inputMode="numeric" onChange={(actualReps) => onResultChange(result.setNumber, { actualReps })} /></label>
            </div>
            <button type="button" onClick={() => onResultChange(result.setNumber, { completed: !result.completed })} aria-label={(result.completed ? 'Отменить подход ' : 'Завершить подход ') + result.setNumber + ' — ' + exercise.name}><Icon name="check" /></button>
          </article>
        ))}
      </section>

      <footer className="active-exercise-footer-actions">
        <SetCountControl exerciseName={exercise.name} count={results.length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} />
        <button type="button" onClick={onAddAfter}><Icon name="plus" /> Ещё упражнение</button>
      </footer>
    </article>
  );
}

function ExerciseInstructionModal({ exercise, onClose }: { exercise: WorkoutExercise; onClose: () => void }) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const resolvedEquipment = exercise.equipment ?? definition?.equipment;
  const equipment = resolvedEquipment && resolvedEquipment !== 'Свой вес' ? resolvedEquipment : null;
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet exercise-instruction-sheet" role="dialog" aria-modal="true" aria-label={'Как выполнять — ' + exercise.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title"><h2>{exercise.name}</h2><button type="button" onClick={onClose} aria-label="Закрыть описание"><Icon name="close" /></button></div>
        <div className="exercise-instruction-body">
          <div className="exercise-instruction-media"><Icon name="workout" /><span>Видео и изображения появятся здесь</span></div>
          {equipment && <div className="exercise-equipment"><small>ОБОРУДОВАНИЕ</small><strong>{equipment}</strong></div>}
          <h3>Как выполнять</h3>
          <p>Займи устойчивое исходное положение и выполни движение плавно, без рывков. Сохраняй контроль корпуса и комфортную амплитуду на протяжении всего подхода.</p>
          <ul>
            <li>Перед рабочим весом сделай разминочный подход.</li>
            <li>Выдыхай на усилии и не задерживай дыхание.</li>
            <li>Остановись, если появляется резкая боль или теряется техника.</li>
          </ul>
        </div>
        </section>
      </div>
    </ModalLayer>
  );
}

function ExerciseActionsModal({
  exercise,
  canDeleteExercise,
  onClose,
  onDeleteExercise,
}: {
  exercise: WorkoutExercise;
  canDeleteExercise: boolean;
  onClose: () => void;
  onDeleteExercise: () => void;
}) {
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet exercise-actions-sheet" role="dialog" aria-modal="true" aria-label={'Действия — ' + exercise.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title"><h2>{exercise.name}</h2><button type="button" onClick={onClose} aria-label="Закрыть действия"><Icon name="close" /></button></div>
        <div className="exercise-action-list">
          <button className="danger" type="button" disabled={!canDeleteExercise} onClick={onDeleteExercise}>
            <Icon name="trash" />
            <span><strong>Удалить упражнение</strong><small>{canDeleteExercise ? 'Упражнение исчезнет из этой тренировки' : 'Сначала отмени выполненные подходы'}</small></span>
          </button>
        </div>
        </section>
      </div>
    </ModalLayer>
  );
}

function ActiveExercisePicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (exercise: ExercisePickerChoice) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>('all');
  const [customLoadMode, setCustomLoadMode] = useState<'external' | 'bodyweight'>('external');
  const [customMeasureType, setCustomMeasureType] = useState<'reps' | 'duration'>('reps');
  const [addedIds, setAddedIds] = useState(() => new Set<string>());
  const [addedCount, setAddedCount] = useState(0);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = search.trim();
  const canCreateCustom = customName.length >= 2 && !exerciseLibrary.some((exercise) => exercise.name.toLocaleLowerCase('ru') === normalizedSearch);
  const filtered = exerciseLibrary.filter((exercise) => {
    const matchesMuscle = selectedMuscle === 'all' || exercise.primaryMuscle === selectedMuscle;
    const haystack = (exercise.name + ' ' + exercise.primaryMuscle + ' ' + exercise.equipment).toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });
  const selectExercise = (exercise: ExercisePickerChoice, custom = false) => {
    if (!custom && addedIds.has(exercise.id)) return;
    onSelect(exercise);
    setAddedCount((count) => count + 1);
    if (custom) {
      setSearch('');
      return;
    }
    setAddedIds((current) => new Set(current).add(exercise.id));
  };

  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet exercise-picker-sheet" role="dialog" aria-modal="true" aria-label="Добавить упражнения" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title"><div><h2>Добавить упражнения</h2><p>Выбери несколько — окно останется открытым</p></div><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
        <input className="text-input search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
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
            const added = addedIds.has(exercise.id);
            return <button className={added ? 'added' : ''} key={exercise.id} type="button" disabled={added} aria-pressed={added} onClick={() => selectExercise(exercise)}><span><Icon name={added ? 'check' : 'plus'} /></span><div><strong>{exercise.name}</strong><small>{added ? 'Добавлено' : `${exercise.primaryMuscle} · ${exercise.equipment}`}</small></div></button>;
          })}
          {!filtered.length && !canCreateCustom && <p className="picker-empty">Ничего не найдено. Введи хотя бы два символа, чтобы добавить своё упражнение.</p>}
        </div>
        <footer className="picker-footer"><span aria-live="polite">{addedCount ? `Добавлено: ${addedCount}` : 'Можно выбрать несколько'}</span><button className="primary-button" type="button" onClick={onClose}><Icon name="check" /> Готово</button></footer>
        </section>
      </div>
    </ModalLayer>
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
        <button className="primary-button" type="button" disabled={!mood} onClick={() => mood && onComplete(mood, comment)}><Icon name="check" /> Сохранить результат</button>
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
      <button className="primary-button" type="button" onClick={() => go('/student')}><Icon name="check" /> Готово</button>
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
  const progress = trainerView ? collectExerciseProgress(data.sessions, session.studentId) : [];
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
        <button className="wide-secondary" type="button" onClick={onRepeat}><Icon name="copy" /> Повторить на другую дату</button>
        <button className="danger-button" type="button" onClick={() => setDeleteOpen(true)}><Icon name="trash" /> Удалить тренировку</button>
      </div>}
      <section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <article key={exercise.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><small className="result-exercise-meta">{exerciseMetadata(exercise)}</small>{exercise.coachNote && <small className="result-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></header>
              {trainerView && progress.some((group) => group.key === progressKey(exercise)) && <button type="button" className="wide-secondary exercise-progress-button" onClick={() => go(progressHref(session.studentId, exercise))}><Icon name="history" /> Прогресс упражнения <Icon name="arrow-right" /></button>}
              <div>{results.map((result) => <p className={result.completed ? '' : 'not-completed'} key={result.setNumber}><span>Подход {result.setNumber}</span><strong>{actualSetLabel(exercise, result)}</strong><i><Icon name={result.completed ? 'check' : 'minus'} /></i></p>)}</div>
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
        <button className="primary-button" type="button" onClick={() => onAccept(student)}><Icon name="check" /> Принять приглашение</button>
      </section>
    </main>
  );
}

function SettingsModal({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Настройки демо" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-title"><div><span className="eyebrow">REPPY V0</span><h2>{resetConfirmationOpen ? 'Сбросить демо-данные?' : 'Настройки демо'}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
        <p>{resetConfirmationOpen ? 'Все изменения в учениках, тренировках и расписании будут удалены.' : 'Сброс вернёт исходных учеников, тренировки и расписание.'}</p>
        {resetConfirmationOpen ? <div className="confirmation-actions"><button className="wide-secondary" type="button" onClick={() => setResetConfirmationOpen(false)}>Остаться</button><button className="danger-button" type="button" onClick={onReset}>Сбросить данные</button></div> : <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}><Icon name="trash" /> Сбросить демо-данные</button>}
        </section>
      </div>
    </ModalLayer>
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
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="bottom-sheet confirmation-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-title"><h2 id="confirmation-title">{title}</h2><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
          <p id="confirmation-description">{text}</p>
          <div className="confirmation-actions">
            <button className="wide-secondary" type="button" onClick={onClose}>Остаться</button>
            <button className={danger ? 'danger-button' : 'primary-button'} type="button" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </section>
      </div>
    </ModalLayer>
  );
}

function ModalLayer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const historyCleanupTimer = useRef<number | null>(null);
  const [modalId] = useState(() => makeId('modal'));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (historyCleanupTimer.current) {
      window.clearTimeout(historyCleanupTimer.current);
      historyCleanupTimer.current = null;
    }
    openModalLayers += 1;
    document.body.classList.add('modal-open');
    window.dispatchEvent(new CustomEvent(MODAL_LAYER_EVENT, { detail: true }));
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    if (appShell) {
      appShell.inert = true;
      appShell.setAttribute('aria-hidden', 'true');
    }
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    if (currentState.reppyModal !== modalId) {
      window.history.pushState({ ...currentState, reppyModal: modalId }, '', window.location.href);
    }
    let focusFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const root = layerRef.current;
        const target = root?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
        target?.focus({ preventScroll: true });
      });
    });

    const focusableElements = () => Array.from(layerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleHistoryBack = (event: PopStateEvent) => {
      if (event.state?.reppyModal === modalId) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handleHistoryBack, { capture: true });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleHistoryBack, { capture: true });
      openModalLayers = Math.max(0, openModalLayers - 1);
      document.body.classList.toggle('modal-open', openModalLayers > 0);
      window.dispatchEvent(new CustomEvent(MODAL_LAYER_EVENT, { detail: openModalLayers > 0 }));
      if (appShell && openModalLayers === 0) {
        appShell.inert = false;
        appShell.removeAttribute('aria-hidden');
      }
      historyCleanupTimer.current = window.setTimeout(() => {
        historyCleanupTimer.current = null;
        if (window.history.state?.reppyModal === modalId) window.history.back();
      }, 0);
      returnFocus?.focus({ preventScroll: true });
    };
  }, [modalId]);

  return createPortal(<div className="modal-layer-root" ref={layerRef}>{children}</div>, document.body);
}

function NotFound() {
  return <main className="content-page"><EmptyState icon="circle" title="Ничего не найдено" text="Этот экран или запись больше не существует." action="На главную" onAction={() => go('/')} /></main>;
}
