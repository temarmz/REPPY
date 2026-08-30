import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  STORAGE_KEY,
  TRAINER_NAME,
  createInitialState,
  dateKey,
  exerciseLibrary,
  formatCalendarDay,
  formatDay,
  makeId,
  migrateDemoState,
  type Assignment,
  type DemoState,
  type MoodRating,
  type SetResult,
  type Student,
  type Workout,
  type WorkoutExercise,
  type WorkoutSession,
} from './reppy-data';
import Icon, { iconAssetPaths, type IconName } from './ui-icon';

const COPY = {
  createWorkout: 'Создать тренировку',
  emptyAssignments: 'На ближайшие две недели тренер пока ничего не назначил.',
  emptyHistory: 'Завершённые тренировки появятся здесь.',
};

const NAVIGATION_EVENT = 'reppy:navigate';

function hashPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.hash.replace(/^#/, '') || '/';
}

function go(path: string) {
  if (hashPath() === path) return;
  const previousState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.pushState({ ...previousState, reppyEntry: true }, '', `#${path}`);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function goBack(fallback: string) {
  if (window.history.state?.reppyEntry) {
    window.history.back();
    return;
  }
  go(fallback);
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

function exercisePreview(workout?: Workout, withPlan = false) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises
    .slice(0, 3)
    .map((exercise) => withPlan ? `${exercise.name} ${exercise.sets}×${exercise.targetReps}` : exercise.name)
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
  'favicon-32.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  ...iconAssetPaths,
];

const ASSET_PRELOAD_TIMEOUT = 5500;

function moodLabel(mood: MoodRating) {
  return MOODS.find((item) => item.value === mood)?.label ?? '';
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
  const [data, setData] = useState<DemoState>(() => createInitialState());
  const [path, setPath] = useState('/');
  const [hydrated, setHydrated] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    let cancelled = false;

    const hydrate = () => {
      let nextData = createInitialState();
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        nextData = migrateDemoState(saved ? (JSON.parse(saved) as DemoState) : nextData);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }

      if (cancelled) return;
      setData(nextData);
      const requestedPath = hashPath();
      if (requestedPath === '/' && nextData.loggedIn) {
        const homePath = nextData.role === 'trainer' ? '/trainer' : '/student';
        window.history.replaceState({ reppyEntry: false }, '', `#${homePath}`);
        setPath(homePath);
      } else {
        setPath(requestedPath);
      }
      setHydrated(true);
    };

    hydrate();

    const handleNavigation = () => setPath(hashPath());
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

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
    if (!window.confirm('Сбросить все изменения и вернуть исходные демо-данные?')) return;
    const initial = createInitialState();
    localStorage.removeItem(STORAGE_KEY);
    setData(initial);
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
    const clientMatch = path.match(/^\/trainer\/clients\/([^/]+)$/);
    const assignmentEditMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/edit$/);
    const assignmentMatch = path.match(/^\/trainer\/assignments\/([^/]+)$/);
    const workoutEditMatch = path.match(/^\/trainer\/workouts\/([^/]+)\/edit$/);
    const workoutAssignMatch = path.match(/^\/trainer\/workouts\/([^/]+)\/assign$/);
    const workoutMatch = path.match(/^\/trainer\/workouts\/([^/]+)$/);
    const sessionMatch = path.match(/^\/trainer\/sessions\/([^/]+)$/);

    if (path === '/trainer/calendar') {
      content = <WorkoutCalendar data={data} area="trainer" />;
    } else if (path === '/trainer/clients') {
      content = <ClientsList data={data} />;
    } else if (path === '/trainer/clients/invite') {
      content = (
        <InviteStudent
          onCreate={(student) => setData((current) => ({ ...current, students: [...current.students, student] }))}
        />
      );
    } else if (clientMatch) {
      content = <StudentProfile data={data} studentId={clientMatch[1]} trainerView onUpdate={(updated) => {
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
            showToast('Дата и время обновлены');
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
          workout={workout}
          students={data.students}
          onAssign={(studentId, scheduledFor, scheduledTime) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              workoutId: workout.id,
              studentId,
              assignedAt: new Date().toISOString(),
              scheduledFor,
              scheduledTime,
              status: 'assigned',
            };
            setData((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
            const name = findStudent(data, studentId)?.name ?? 'ученику';
            showToast(`Тренировка назначена: ${name}`);
            go(`/trainer/clients/${studentId}`);
          }}
        />
      ) : <NotFound />;
    } else if (workoutMatch) {
      const workout = findWorkout(data, workoutMatch[1]);
      content = workout ? <WorkoutDetails workout={workout} /> : <NotFound />;
    } else if (sessionMatch) {
      const session = data.sessions.find((item) => item.id === sessionMatch[1]);
      content = session ? <SessionResult data={data} session={session} trainerView /> : <NotFound />;
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
      const workout = assignment && findWorkout(data, assignment.workoutId);
      const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
      content = assignment && workout ? (
        <ActiveWorkout
          workout={workout}
          session={session}
          onStart={() => {
            if (session) return;
            const results: SetResult[] = workout.exercises.flatMap((exercise) =>
              Array.from({ length: exercise.sets }, (_, index) => ({
                exerciseId: exercise.id,
                setNumber: index + 1,
                actualReps: exercise.targetReps,
                actualWeight: exercise.targetWeight,
                completed: false,
              })),
            );
            const nextSession: WorkoutSession = {
              id: makeId('session'),
              assignmentId: assignment.id,
              studentId: assignment.studentId,
              workoutId: workout.id,
              startedAt: new Date().toISOString(),
              results,
            };
            setData((current) => ({ ...current, sessions: [...current.sessions, nextSession] }));
          }}
          onUpdate={(sessionId, results) => setData((current) => ({
            ...current,
            sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, results } : item),
          }))}
          onFinish={(sessionId) => {
            const currentSession = data.sessions.find((item) => item.id === sessionId);
            const unfinished = currentSession?.results.some((result) => !result.completed);
            if (unfinished && !window.confirm('Есть незавершённые подходы. Всё равно закончить тренировку?')) return;
            go(`/student/finish/${sessionId}`);
          }}
        />
      ) : <NotFound />;
    } else if (finishMatch) {
      const session = data.sessions.find((item) => item.id === finishMatch[1] && !item.completedAt);
      content = session ? (
        <WorkoutFeedback
          data={data}
          session={session}
          onComplete={(mood, comment) => {
            const completedAt = new Date().toISOString();
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === session.assignmentId ? { ...item, status: 'completed' } : item),
              sessions: current.sessions.map((item) => item.id === session.id ? { ...item, completedAt, mood, comment: comment.trim() } : item),
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
          onStart={(assignmentId) => go(`/student/workout/${assignmentId}`)}
          onOpen={(assignmentId) => go(`/student/assignments/${assignmentId}`)}
        />
      );
    }
  }

  return (
    <AppShell
      area={area}
      path={path}
      data={data}
      onSwitchRole={switchRole}
      onSettings={() => setSettingsOpen(true)}
    >
      {content}
      {toast && <div className="toast" role="status"><Icon name="check" /> {toast}</div>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onReset={resetDemo} />}
    </AppShell>
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
            <p className="eyebrow">Тренировки без лишнего шума</p>
            <h1>ТВОЯ КОМАНДА.<br />ТВОЙ ПРОГРЕСС.</h1>
            <p className="welcome-description">REPPY связывает тренера и ученика: план на две недели, результаты каждого подхода и обратная связь находятся в одном месте.</p>
          </div>
          <button className="primary-button" type="button" onClick={onLogin}>
            <Icon name="arrow-right" /> Попробовать REPPY
          </button>
          <p className="demo-note"><span>DEMO</span> Результаты синхронизируются между ролями</p>
        </section>
        <figure className="hero-mascot">
          <img src="logo.png" alt="Маскот REPPY — спортивный динозавр" />
          <figcaption>TRAIN · TRACK · GROW</figcaption>
        </figure>
      </section>

      <section className="landing-section">
        <p className="eyebrow">Один план — две стороны</p>
        <h2>ТРЕНЕР ВЕДЁТ.<br />УЧЕНИК ВИДИТ ПРОГРЕСС.</h2>
        <div className="audience-grid">
          <article><span><Icon name="workout" /></span><p className="eyebrow">Для тренера</p><h3>Команда без таблиц и чатов</h3><p>Собирай тренировки, планируй занятия сразу на две недели, контролируй веса, повторы, самочувствие и противопоказания учеников.</p></article>
          <article><span><Icon name="success" /></span><p className="eyebrow">Для ученика</p><h3>Понятно, что делать сегодня</h3><p>Смотри дату и время занятия, отмечай каждый подход, оставляй комментарий тренеру и сохраняй историю своего прогресса.</p></article>
        </div>
      </section>

      <section className="pricing-section">
        <div><p className="eyebrow">Простая цена</p><h2>БЕЗ ОПЛАТЫ<br />ЗА КАЖДОГО УЧЕНИКА.</h2><p>Стоимость аккаунта тренера не растёт вместе с командой. Можно спокойно масштабировать практику и заранее понимать расходы.</p></div>
        <div className="pricing-grid">
          <article><span>УЧЕНИК</span><strong>0 ₽</strong><p>Бесплатно всегда</p></article>
          <article className="featured"><span>ТРЕНЕР</span><strong>499 ₽<small>/ месяц</small></strong><p>Первый ученик бесплатно. Начиная со второго — одна фиксированная цена без ограничений по количеству учеников.</p></article>
        </div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <button className="brand-mark brand-button" type="button" onClick={() => go('/')} aria-label="REPPY — на стартовый экран">
      <img className="brand-logo" src="logo-full.png" alt="" />
      <span className="brand-word">REPPY</span>
    </button>
  );
}

function AppShell({
  area,
  path,
  data,
  onSwitchRole,
  onSettings,
  children,
}: {
  area: 'trainer' | 'student';
  path: string;
  data: DemoState;
  onSwitchRole: () => void;
  onSettings: () => void;
  children: ReactNode;
}) {
  const student = findStudent(data, data.activeStudentId);
  const trainerNav = [
    { label: 'Главная', icon: 'home' as IconName, route: '/trainer' },
    { label: 'Календарь', icon: 'calendar' as IconName, route: '/trainer/calendar' },
    { label: 'Ученики', icon: 'users' as IconName, route: '/trainer/clients' },
    { label: 'Тренировки', icon: 'workout' as IconName, route: '/trainer/workouts' },
  ];
  const studentNav = [
    { label: 'Сегодня', icon: 'calendar' as IconName, route: '/student' },
    { label: 'Календарь', icon: 'calendar' as IconName, route: '/student/calendar' },
    { label: 'История', icon: 'history' as IconName, route: '/student/history' },
    { label: 'Профиль', icon: 'users' as IconName, route: '/student/profile' },
  ];
  const nav = area === 'trainer' ? trainerNav : studentNav;
  const displayName = area === 'trainer' ? TRAINER_NAME : student?.name ?? 'Ученик';
  const focusMode = /^\/student\/(workout|finish|success)\//.test(path);

  const isActive = (route: string) => {
    if (route.endsWith('/calendar')) return path === route;
    if (route.endsWith('/clients')) return path.startsWith('/trainer/clients');
    if (route.endsWith('/workouts')) return path.startsWith('/trainer/workouts');
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
            {area === 'trainer' ? 'Тренер' : 'Ученик'} <Icon name="change" /> {area === 'trainer' ? 'Ученик' : 'Тренер'}
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
            <button key={item.route} className={isActive(item.route) ? 'active' : ''} type="button" onClick={() => go(item.route)}>
              <span><Icon name={item.icon} /></span>{item.label}
            </button>
          ))}
        </nav>
        <button className="side-demo" type="button" onClick={onSwitchRole}><b>DEMO</b> Переключить роль</button>
      </aside>}

      <div className="page-wrap page-transition" key={path}>{children}</div>

      {!focusMode && <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <button key={item.route} className={isActive(item.route) ? 'active' : ''} type="button" onClick={() => go(item.route)}>
            <span><Icon name={item.icon} /></span><small>{item.label}</small>
          </button>
        ))}
      </nav>}
    </div>
  );
}

function PageHeader({ eyebrow, title, action, back }: { eyebrow?: string; title: string; action?: ReactNode; back?: string }) {
  return (
    <header className="page-header">
      <div>
        {back && <button className="back-button" type="button" onClick={() => goBack(back)}><Icon name="chevron-left" /> Назад</button>}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function WorkoutCalendar({ data, area }: { data: DemoState; area: 'trainer' | 'student' }) {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
  const assignments = data.assignments
    .filter((item) => area === 'trainer' || item.studentId === data.activeStudentId)
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const selectedAssignments = assignments.filter((item) => item.scheduledFor === selectedDay);
  const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(visibleMonth).replace(/\s*г\.$/, '');
  const selectedTitle = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDay}T12:00:00`));

  const moveMonth = (step: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + step, 1);
    setVisibleMonth(next);
    setSelectedDay(dateKey(next));
  };

  return (
    <main className="content-page calendar-page">
      <section className="calendar-card">
        <header className="calendar-toolbar"><button type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><Icon name="chevron-left" /></button><h2>{monthTitle}</h2><button type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц"><Icon name="chevron-right" /></button></header>
        <div className="calendar-weekdays" aria-hidden="true">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = dateKey(day);
            const dayAssignments = assignments.filter((item) => item.scheduledFor === key);
            const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
            return (
              <button className={`${isCurrentMonth ? '' : 'outside'} ${key === selectedDay ? 'selected' : ''} ${key === dateKey(today) ? 'today' : ''}`} key={key} type="button" onClick={() => setSelectedDay(key)} aria-label={`${day.getDate()}, тренировок: ${dayAssignments.length}`}>
                <span>{day.getDate()}</span>{dayAssignments.length > 0 && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="calendar-agenda">
        <div className="section-heading"><h2>{selectedTitle}</h2></div>
        {selectedAssignments.length ? <div className="agenda-list">{selectedAssignments.map((assignment) => {
          const workout = findWorkout(data, assignment.workoutId);
          const student = findStudent(data, assignment.studentId);
          const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
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
    </main>
  );
}

function planDayParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', ''),
    weekday: new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date),
  };
}

function formatScheduleDay(value: string) {
  const formatted = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${value}T12:00:00`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function TrainerPlanRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const workout = findWorkout(data, assignment.workoutId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const completed = assignment.status === 'completed' || Boolean(session);
  const target = completed
    ? session ? `/trainer/sessions/${session.id}` : `/trainer/clients/${assignment.studentId}`
    : `/trainer/assignments/${assignment.id}`;

  return (
    <button className="plan-session-row" type="button" onClick={() => go(target)}>
      <time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}>{assignment.scheduledTime}</time>
      <Avatar student={student} />
      <span><strong>{student?.name}</strong><small>{workout?.name}</small></span>
      <Icon name="chevron-right" />
    </button>
  );
}

function TrainerUpcomingRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const workout = findWorkout(data, assignment.workoutId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const target = session ? `/trainer/sessions/${session.id}` : `/trainer/assignments/${assignment.id}`;

  return (
    <button className="student-upcoming-row trainer-upcoming-row" type="button" onClick={() => go(target)}>
      <time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}><strong>{formatCalendarDay(assignment.scheduledFor)}</strong><small>{assignment.scheduledTime}</small></time>
      <span><strong>{student?.name}</strong><small>{workout?.name}</small></span>
      <Icon name="chevron-right" />
    </button>
  );
}

function TrainerHome({ data }: { data: DemoState }) {
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
  const todayParts = planDayParts(todayKey);

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
          <div><h2>СЕГОДНЯ</h2><p>{todayParts.weekday}, {todayParts.day} {todayParts.month}</p></div>
        </header>
        {todayAssignments.length ? (
          <div className="today-session-list">{todayAssignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</div>
        ) : <div className="today-empty"><Icon name="check" /><strong>Тренировок нет</strong></div>}
      </section>

      <section className="future-schedule">
        <div className="section-heading"><h2>Дальше</h2></div>
        {futureAssignments.length ? <div className="trainer-upcoming-list">{futureAssignments.map((assignment) => <TrainerUpcomingRow key={assignment.id} data={data} assignment={assignment} />)}</div> : <EmptyState icon="calendar" title="Остальные дни свободны" text="На ближайшие две недели больше ничего не назначено." />}
      </section>
    </main>
  );
}

function ClientsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page">
      <button className="list-primary-action" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить ученика</button>
      <section className="client-grid">
        {data.students.map((student) => {
          const assigned = data.assignments
            .filter((item) => item.studentId === student.id && item.status === 'assigned')
            .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`))[0];
          const recent = [...data.sessions].reverse().find((item) => item.studentId === student.id && item.completedAt);
          const status = student.status === 'invited'
            ? 'Ожидает приглашения'
            : assigned
              ? `${formatCalendarDay(assigned.scheduledFor)}, ${assigned.scheduledTime} · ${findWorkout(data, assigned.workoutId)?.name}`
              : recent
                ? `Завершил · ${findWorkout(data, recent.workoutId)?.name}`
                : 'Нет назначений';
          return (
            <button className="client-card" key={student.id} type="button" onClick={() => go(`/trainer/clients/${student.id}`)}>
              <Avatar student={student} />
              <span><strong>{student.name}</strong><small>{status}</small></span>
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
      {trainerView && <PageHeader back="/trainer/clients" title={student.name.toUpperCase()} />}
      {trainerView && <section className="profile-schedule">
        <div className="section-heading"><h2>Предстоящие тренировки</h2></div>
        {trainerView && <button className="list-primary-action" type="button" onClick={() => go('/trainer/workouts')}><Icon name="plus" /> Назначить тренировку</button>}
        {assignments.length ? <div className="connected-list">{assignments.map((assignment) => {
          const workout = findWorkout(data, assignment.workoutId);
          return (
            <button className="workout-row" key={assignment.id} type="button" onClick={() => workout && go(trainerView ? `/trainer/assignments/${assignment.id}` : `/student/workout/${assignment.id}`)}>
              <span><strong>{workout?.name}</strong><small>{formatCalendarDay(assignment.scheduledFor)}, {assignment.scheduledTime}</small></span><i><Icon name="chevron-right" /></i>
            </button>
          );
        })}</div> : trainerView
          ? <EmptyState icon="calendar" title="Пока пусто" text="Выбери готовую тренировку и назначь её ученику." />
          : <EmptyState icon="calendar" title="Пока пусто" text="Тренер ещё не добавил ближайшие занятия." />}
      </section>}

      {trainerView && <section className="section-block">
        <div className="section-heading"><h2>Последняя активность</h2></div>
        {sessions.length ? <div className="connected-list">{sessions.slice(0, 3).map((session) => (
          <button className="session-row" key={session.id} type="button" onClick={() => go(`/trainer/sessions/${session.id}`)}>
            <span className="done-badge"><Icon name="check" /></span><span><strong>{findWorkout(data, session.workoutId)?.name}</strong><small>{formatDay(session.completedAt)}{session.mood ? ` · ${moodLabel(session.mood)}` : ''}</small></span><i><Icon name="chevron-right" /></i>
          </button>
        ))}</div> : <EmptyState icon="circle" title="Ещё нет результатов" text="Завершённые тренировки ученика появятся в этом блоке." />}
      </section>}

      <AthleteDetails student={student} onSave={onUpdate} alwaysExpanded={!trainerView} />
    </main>
  );
}

function AthleteDetails({ student, onSave, alwaysExpanded = false }: { student: Student; onSave: (student: Student) => void; alwaysExpanded?: boolean }) {
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
    <section className="athlete-details section-block">
      <div className="section-heading"><h2>Данные и ограничения</h2>{!alwaysExpanded && <button type="button" onClick={() => { setExpanded((current) => !current); setEditing(false); }}>{expanded ? 'Скрыть' : 'Показать'}</button>}</div>
      {expanded && (editing ? <div className="athlete-form">
        <div className="athlete-form-grid">
          <label><span>Рост, см</span><input type="number" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="182" /></label>
          <label><span>Вес, кг</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="86" /></label>
        </div>
        <label><span>Пол</span><select value={gender} onChange={(event) => setGender(event.target.value as Student['gender'])}><option value="not-specified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
        <label><span>Мобильный телефон</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" /></label>
        <label><span>Противопоказания и особенности</span><textarea value={contraindications} onChange={(event) => setContraindications(event.target.value)} maxLength={800} placeholder="Например: протрузия поясничного отдела, грыжа, болит левое запястье…" /><small>Опиши всё, что тренеру важно учитывать при составлении плана.</small></label>
        <button className="primary-button" type="button" onClick={save}><Icon name="check" /> Сохранить данные</button>
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

function WorkoutForm({ initial, onSave }: { initial?: Workout; onSave: (workout: Workout) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(initial?.exercises ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const filtered = exerciseLibrary.filter((exercise) => exercise.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));

  const addExercise = (exercise: { id: string; name: string }) => {
    setExercises((current) => [...current, {
      id: makeId('exercise'),
      exerciseId: exercise.id,
      name: exercise.name,
      sets: 3,
      targetReps: 10,
      targetWeight: 20,
    }]);
    setPickerOpen(false);
    setSearch('');
    setError('');
  };

  const updateExercise = (id: string, key: 'sets' | 'targetReps' | 'targetWeight', value: number) => {
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, [key]: Math.max(key === 'targetWeight' ? 0 : 1, value || 0) } : exercise));
  };

  const save = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    onSave({ id: initial?.id ?? makeId('workout'), name: name.trim(), exercises, createdAt: initial?.createdAt ?? new Date().toISOString() });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={initial ? `/trainer/workouts/${initial.id}` : '/trainer/workouts'} eyebrow={initial ? 'Редактирование' : 'Новая тренировка'} title={initial ? initial.name.toUpperCase() : 'СОБЕРИ ПЛАН'} />
      <section className="form-card workout-form">
        <label className="field-label" htmlFor="workout-name">Название тренировки</label>
        <input id="workout-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Грудь + плечи" />

        <div className="form-section-heading"><h2>Упражнения</h2></div>
        <button className="add-exercise" type="button" onClick={() => setPickerOpen(true)}><Icon name="plus" /> Добавить упражнение</button>
        <div className="exercise-editor-list">
          {exercises.map((exercise, index) => (
            <article className="exercise-editor" key={exercise.id}>
              <div className="exercise-editor-head"><span>{String(index + 1).padStart(2, '0')}</span><h3>{exercise.name}</h3><button type="button" onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} aria-label={`Удалить ${exercise.name}`}><Icon name="close" /></button></div>
              <div className="metric-grid">
                <MetricInput label="Подходы" value={exercise.sets} onChange={(value) => updateExercise(exercise.id, 'sets', value)} />
                <MetricInput label="Повторы" value={exercise.targetReps} onChange={(value) => updateExercise(exercise.id, 'targetReps', value)} />
                <MetricInput label="Вес, кг" value={exercise.targetWeight} onChange={(value) => updateExercise(exercise.id, 'targetWeight', value)} step={2.5} />
              </div>
            </article>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button save-workout" type="button" onClick={save}><Icon name="check" /> Сохранить тренировку</button>
      </section>

      {pickerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Выбрать упражнение" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" /><div className="sheet-title"><h2>Выбрать упражнение</h2><button type="button" onClick={() => setPickerOpen(false)} aria-label="Закрыть"><Icon name="close" /></button></div>
            <input className="text-input search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск упражнения" autoFocus />
            <div className="picker-list">
              {filtered.map((exercise) => <button key={exercise.id} type="button" onClick={() => addExercise(exercise)}><span><Icon name="plus" /></span>{exercise.name}</button>)}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function MetricInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="metric-input"><span>{label}</span><EditableNumberInput value={value} onChange={onChange} min={0} step={step} inputMode={step < 1 ? 'decimal' : 'numeric'} /></label>
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

  return <input type="number" min={min} step={step} inputMode={inputMode} value={draft ?? String(value)} onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} />;
}

function WorkoutDetails({ workout }: { workout: Workout }) {
  return (
    <main className="content-page narrow-page">
      <PageHeader back="/trainer/workouts" eyebrow="Шаблон тренировки" title={workout.name.toUpperCase()} />
      <div className="workout-detail-actions"><button className="wide-secondary" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/edit`)}><Icon name="edit" /> Редактировать</button><button className="primary-button" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/assign`)}><Icon name="plus" /> Назначить</button></div>
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p></div></article>
        ))}
      </section>
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
  const workout = findWorkout(data, assignment.workoutId);
  if (!student || !workout) return <NotFound />;

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={`${student.name} · ${formatCalendarDay(assignment.scheduledFor)}, ${assignment.scheduledTime}`} title={workout.name.toUpperCase()} />
      {assignment.rescheduleRequest && <section className="reschedule-request-card">
        <div><span>ЗАПРОС НА ПЕРЕНОС</span><h2>{student.name} предлагает другое время</h2><p><strong>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)}</strong><time>{assignment.rescheduleRequest.scheduledTime}</time></p></div>
        <div className="reschedule-request-actions"><button className="wide-secondary" type="button" onClick={onDeclineRequest}><Icon name="close" /> Отклонить</button><button className="primary-button" type="button" onClick={onAcceptRequest}><Icon name="check" /> Подтвердить</button></div>
      </section>}
      {assignment.status === 'assigned' && <button className="wide-secondary assignment-edit-button" type="button" onClick={() => go(`/trainer/assignments/${assignment.id}/edit`)}><Icon name="edit" /> Редактировать назначение</button>}
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p></div></article>
        ))}
      </section>
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
  const workout = findWorkout(data, assignment.workoutId);
  const [requestOpen, setRequestOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(assignment.rescheduleRequest?.scheduledFor ?? assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime);
  if (!workout) return <NotFound />;
  const canStart = assignment.scheduledFor === dateKey();
  const scheduleUnchanged = scheduledFor === assignment.scheduledFor && scheduledTime === assignment.scheduledTime;

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
          <label className="schedule-field"><span>Новая дата</span><input type="date" value={scheduledFor} min={dateKey()} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label className="schedule-field"><span>Новое время</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
        <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime || scheduleUnchanged} onClick={() => { onRequest(scheduledFor, scheduledTime); setRequestOpen(false); }}><Icon name="check" /> Отправить тренеру</button>
      </section>}

      {canStart && <button className="primary-button student-start-button" type="button" onClick={onStart}><Icon name="workout" /> Начать тренировку</button>}
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p></div></article>
        ))}
      </section>
    </main>
  );
}

function AssignWorkout({ workout, students, onAssign }: { workout: Workout; students: Student[]; onAssign: (studentId: string, scheduledFor: string, scheduledTime: string) => void }) {
  const [selected, setSelected] = useState(students.find((student) => student.id === 'artem')?.id ?? students[0]?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const chosen = students.find((student) => student.id === selected);
  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/workouts/${workout.id}`} eyebrow={workout.name} title="КОМУ НАЗНАЧИТЬ?" />
      {students.length ? (
        <section className="select-student-list">
          {students.map((student) => (
            <button className={selected === student.id ? 'selected' : ''} key={student.id} type="button" onClick={() => setSelected(student.id)}>
              <Avatar student={student} /><span><strong>{student.name}</strong>{student.status === 'invited' && <small>Ожидает приглашения</small>}</span><i><Icon name={selected === student.id ? 'check' : 'circle'} /></i>
            </button>
          ))}
          <div className="schedule-fields">
            <label className="schedule-field"><span>Дата тренировки</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
            <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
          </div>
          <button className="primary-button assign-button" type="button" onClick={() => selected && scheduledFor && scheduledTime && onAssign(selected, scheduledFor, scheduledTime)} disabled={!selected || !scheduledFor || !scheduledTime}><Icon name="plus" /> Назначить {chosen?.name ? chosen.name : ''}</button>
        </section>
      ) : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </main>
  );
}

function EditAssignment({ data, assignment, onSave, onDelete }: { data: DemoState; assignment: Assignment; onSave: (assignment: Assignment) => void; onDelete: (assignment: Assignment) => void }) {
  const [scheduledFor, setScheduledFor] = useState(assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.scheduledTime);
  const student = findStudent(data, assignment.studentId);
  const workout = findWorkout(data, assignment.workoutId);
  const remove = () => {
    if (!window.confirm(`Удалить «${workout?.name ?? 'тренировку'}» из расписания ${student?.name ?? 'ученика'}?`)) return;
    onDelete(assignment);
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/assignments/${assignment.id}`} eyebrow={`${student?.name} · ${workout?.name}`} title="ИЗМЕНИТЬ ЗАНЯТИЕ" />
      <section className="assignment-edit-card">
        <div className="assignment-edit-person"><Avatar student={student} large /><div><span>УЧЕНИК</span><strong>{student?.name}</strong><p>{workout?.name} · {exercisePreview(workout)}</p></div></div>
        <div className="schedule-fields">
          <label className="schedule-field"><span>Дата тренировки</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
        <div className="assignment-edit-actions">
          <button className="danger-button" type="button" onClick={remove}><Icon name="close" /> Удалить назначение</button>
          <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime} onClick={() => onSave({ ...assignment, scheduledFor, scheduledTime })}><Icon name="check" /> Сохранить</button>
        </div>
      </section>
    </main>
  );
}

function StudentHome({ data, onStart, onOpen }: { data: DemoState; onStart: (assignmentId: string) => void; onOpen: (assignmentId: string) => void }) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const assignments = data.assignments
    .filter((item) => item.studentId === data.activeStudentId && item.status === 'assigned' && item.scheduledFor >= dateKey() && item.scheduledFor <= dateKey(horizon))
    .sort((a, b) => `${a.scheduledFor} ${a.scheduledTime}`.localeCompare(`${b.scheduledFor} ${b.scheduledTime}`));
  const mainAssignment = assignments[0];
  const mainWorkout = mainAssignment && findWorkout(data, mainAssignment.workoutId);
  const mainSession = mainAssignment && data.sessions.find((item) => item.assignmentId === mainAssignment.id && !item.completedAt);
  const mainCompletedSets = mainSession?.results.filter((item) => item.completed).length ?? 0;
  const mainProgress = mainSession ? Math.round((mainCompletedSets / Math.max(mainSession.results.length, 1)) * 100) : 0;
  const laterAssignments = assignments.slice(1);
  const canStartMain = Boolean(mainSession) || mainAssignment?.scheduledFor === dateKey();

  return (
    <main className="content-page student-page">
      {mainAssignment ? (
        <section className="student-focus-card">
          <div className="student-card-top"><time dateTime={`${mainAssignment.scheduledFor}T${mainAssignment.scheduledTime}`}><strong>{formatScheduleDay(mainAssignment.scheduledFor)}</strong><small>{mainAssignment.scheduledTime}</small></time>{mainSession && <b>{mainProgress}%</b>}</div>
          <div><h2>{mainWorkout?.name}</h2><p>{exercisePreview(mainWorkout)}</p></div>
          {mainSession && <div className="workout-progress"><span style={{ width: `${mainProgress}%` }} /></div>}
          <button type="button" onClick={() => canStartMain ? onStart(mainAssignment.id) : onOpen(mainAssignment.id)}><Icon name={canStartMain ? 'workout' : 'calendar'} /> {mainSession ? 'Продолжить тренировку' : canStartMain ? 'Начать тренировку' : 'Посмотреть тренировку'}</button>
        </section>
      ) : <EmptyState icon="sun" title="Две недели свободны" text={COPY.emptyAssignments} />}

      {laterAssignments.length > 0 && <section className="student-upcoming">
        <div className="section-heading"><h2>Следующие тренировки</h2></div>
        <div>{laterAssignments.map((assignment) => {
          const workout = findWorkout(data, assignment.workoutId);
          return <button className="student-upcoming-row" key={assignment.id} type="button" onClick={() => onOpen(assignment.id)}><time dateTime={`${assignment.scheduledFor}T${assignment.scheduledTime}`}><strong>{formatCalendarDay(assignment.scheduledFor)}</strong><small>{assignment.scheduledTime}</small></time><span><strong>{workout?.name}</strong><small>{exercisePreview(workout)}</small></span><Icon name="chevron-right" /></button>;
        })}</div>
      </section>}
    </main>
  );
}

function ActiveWorkout({
  workout,
  session,
  onStart,
  onUpdate,
  onFinish,
}: {
  workout: Workout;
  session?: WorkoutSession;
  onStart: () => void;
  onUpdate: (sessionId: string, results: SetResult[]) => void;
  onFinish: (sessionId: string) => void;
}) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const startRequested = useRef(false);
  const exercise = workout.exercises[exerciseIndex];

  useEffect(() => {
    if (!session && !startRequested.current) {
      startRequested.current = true;
      onStart();
    }
  }, [session, onStart]);

  if (!session) return <main className="loading-screen"><img className="loading-logo" src="logo-full.png" alt="REPPY" /><p>Готовим тренировку…</p></main>;

  const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
  const completed = session.results.filter((result) => result.completed).length;
  const progress = Math.round((completed / Math.max(session.results.length, 1)) * 100);

  const updateResult = (setNumber: number, patch: Partial<SetResult>) => {
    onUpdate(session.id, session.results.map((result) => result.exerciseId === exercise.id && result.setNumber === setNumber ? { ...result, ...patch } : result));
  };

  return (
    <main className="active-workout-page">
      <header className="active-header"><button type="button" onClick={() => goBack('/student')} aria-label="Закрыть тренировку"><Icon name="close" /></button><div><span>{workout.name}</span><strong>{exerciseIndex + 1} из {workout.exercises.length}</strong></div><b>{progress}%</b></header>
      <div className="active-progress"><span style={{ width: `${progress}%` }} /></div>
      <section className="active-exercise-title"><p>УПРАЖНЕНИЕ {String(exerciseIndex + 1).padStart(2, '0')}</p><h1>{exercise.name}</h1><span>Цель: {exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</span></section>
      <section className="set-list">
        {exerciseResults.map((result) => (
          <article className={`set-card ${result.completed ? 'completed' : ''}`} key={result.setNumber}>
            <div className="set-number"><span>ПОДХОД</span><strong>{result.setNumber}</strong></div>
            <label><span>КГ</span><EditableNumberInput value={result.actualWeight} step={2.5} inputMode="decimal" onChange={(actualWeight) => updateResult(result.setNumber, { actualWeight })} /></label>
            <label><span>ПОВТОРЫ</span><EditableNumberInput value={result.actualReps} inputMode="numeric" onChange={(actualReps) => updateResult(result.setNumber, { actualReps })} /></label>
            <button type="button" onClick={() => updateResult(result.setNumber, { completed: !result.completed })} aria-label={result.completed ? `Отменить подход ${result.setNumber}` : `Завершить подход ${result.setNumber}`}><Icon name={result.completed ? 'check' : 'circle'} /></button>
          </article>
        ))}
      </section>
      <footer className="exercise-navigation">
        <button type="button" disabled={exerciseIndex === 0} onClick={() => setExerciseIndex((current) => current - 1)}><Icon name="chevron-left" /> Назад</button>
        {exerciseIndex < workout.exercises.length - 1 ? (
          <button className="next-exercise" type="button" onClick={() => setExerciseIndex((current) => current + 1)}><Icon name="arrow-right" /> Следующее упражнение</button>
        ) : (
          <button className="finish-workout" type="button" onClick={() => onFinish(session.id)}><Icon name="check" /> Завершить тренировку</button>
        )}
      </footer>
    </main>
  );
}

function WorkoutFeedback({ data, session, onComplete }: { data: DemoState; session: WorkoutSession; onComplete: (mood: MoodRating, comment: string) => void }) {
  const [mood, setMood] = useState<MoodRating | null>(null);
  const [comment, setComment] = useState('');
  const workout = findWorkout(data, session.workoutId);

  return (
    <main className="feedback-page">
      <PageHeader back={`/student/workout/${session.assignmentId}`} eyebrow={workout?.name} title="КАК ПРОШЛО?" />
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
  const workout = findWorkout(data, session.workoutId);
  return (
    <main className="success-screen">
      <div className="success-burst" aria-hidden="true"><Icon name="check" /></div>
      <p className="eyebrow">Результат сохранён</p>
      <h1>ТРЕНИРОВКА<br />ЗАВЕРШЕНА</h1>
      <section><strong>{workout?.name}</strong>{session.mood && <p className="success-mood"><Icon name="sun" /> Самочувствие: {moodLabel(session.mood)}</p>}</section>
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
            const workout = findWorkout(data, session.workoutId);
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

function SessionResult({ data, session, trainerView = false }: { data: DemoState; session: WorkoutSession; trainerView?: boolean }) {
  const workout = findWorkout(data, session.workoutId);
  const student = findStudent(data, session.studentId);
  if (!workout) return <NotFound />;
  return (
    <main className="content-page narrow-page">
      <PageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/history'} eyebrow={`${trainerView ? `${student?.name} · ` : ''}${formatDay(session.completedAt)}`} title={workout.name.toUpperCase()} />
      {(session.mood || session.comment) && <section className="session-feedback"><span>ОБРАТНАЯ СВЯЗЬ УЧЕНИКА</span>{session.mood && <strong><Icon name="sun" /> {moodLabel(session.mood)}</strong>}{session.comment && <p>{session.comment}</p>}</section>}
      <section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <article key={exercise.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><h2>{exercise.name}</h2></header>
              <div>{results.map((result) => <p className={result.completed ? '' : 'not-completed'} key={result.setNumber}><span>Подход {result.setNumber}</span><strong>{result.actualWeight} кг × {result.actualReps}</strong><i><Icon name={result.completed ? 'check' : 'minus'} /></i></p>)}</div>
            </article>
          );
        })}
      </section>
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

function EmptyState({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty-state"><span><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p>{action && <button type="button" onClick={onAction}><Icon name="arrow-right" /> {action}</button>}</div>
  );
}

function SettingsModal({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Настройки демо" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-title"><div><span className="eyebrow">REPPY V0</span><h2>Настройки демо</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
        <p>Сброс вернёт исходных учеников, тренировки и расписание.</p>
        <button className="reset-button" type="button" onClick={onReset}><Icon name="close" /> Сбросить демо-данные</button>
      </section>
    </div>
  );
}

function NotFound() {
  return <main className="content-page"><EmptyState icon="circle" title="Ничего не найдено" text="Этот экран или запись больше не существует." action="На главную" onAction={() => go('/')} /></main>;
}
