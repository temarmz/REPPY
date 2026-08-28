'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  STORAGE_KEY,
  TRAINER_NAME,
  createInitialState,
  dateKey,
  exerciseLibrary,
  formatCalendarDay,
  formatDay,
  getSharedState,
  makeId,
  migrateDemoState,
  totalSets,
  type Assignment,
  type DemoState,
  type MoodRating,
  type SharedDemoState,
  type SetResult,
  type Student,
  type Workout,
  type WorkoutExercise,
  type WorkoutSession,
} from './reppy-data';
import Icon, { type IconName } from './ui-icon';

const COPY = {
  createWorkout: 'Создать тренировку',
  emptyAssignments: 'Сегодня можно выдохнуть — тренер пока ничего не назначил.',
  emptyHistory: 'Завершённые тренировки появятся здесь.',
};

function hashPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.hash.replace(/^#/, '') || '/';
}

function go(path: string) {
  window.location.hash = path;
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

const MOODS: Array<{ value: MoodRating; label: string; detail: string; icon: IconName }> = [
  { value: 'great', label: 'Отлично', detail: 'Много сил', icon: 'sun' },
  { value: 'good', label: 'Хорошо', detail: 'Рабочий темп', icon: 'check' },
  { value: 'tired', label: 'Устал', detail: 'Нужен отдых', icon: 'minus' },
  { value: 'hard', label: 'Тяжело', detail: 'Было непросто', icon: 'workout' },
];

function moodLabel(mood: MoodRating) {
  return MOODS.find((item) => item.value === mood)?.label ?? '';
}

export default function ReppyApp() {
  const [data, setData] = useState<DemoState>(() => createInitialState());
  const [path, setPath] = useState('/');
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let nextData = createInitialState();
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        nextData = migrateDemoState(saved ? (JSON.parse(saved) as DemoState) : nextData);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }

      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (response.ok) {
          const shared = await response.json() as SharedDemoState;
          nextData = migrateDemoState({ ...nextData, ...shared });
        }
      } catch {
        // Keep the local copy available if the shared store is temporarily unavailable.
      }

      if (cancelled) return;
      setData(nextData);
      const requestedPath = hashPath();
      if (requestedPath === '/' && nextData.loggedIn) {
        go(nextData.role === 'trainer' ? '/trainer' : '/student');
      } else {
        setPath(requestedPath);
      }
      setHydrated(true);
    };

    void hydrate();

    const handleHash = () => setPath(hashPath());
    window.addEventListener('hashchange', handleHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', handleHash);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const timer = window.setTimeout(() => {
      void fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(getSharedState(data)),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const refresh = async () => {
      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) return;
        const shared = await response.json() as SharedDemoState;
        setData((current) => JSON.stringify(getSharedState(current)) === JSON.stringify(shared)
          ? current
          : migrateDemoState({ ...current, ...shared }));
      } catch {
        // The current screen remains usable from its last synchronized copy.
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 12000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [hydrated]);

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

  if (!hydrated) {
    return <main className="loading-screen"><span className="brand-icon">R</span><p>Загружаем REPPY…</p></main>;
  }

  const inviteMatch = path.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch) {
    return (
      <InvitationScreen
        token={decodeURIComponent(inviteMatch[1])}
        data={data}
        onAccept={(studentId) => {
          setData((current) => ({
            ...current,
            loggedIn: true,
            role: 'student',
            activeStudentId: studentId,
            students: current.students.map((student) => student.id === studentId ? { ...student, status: 'active' } : student),
          }));
          go('/student');
        }}
      />
    );
  }

  if (!data.loggedIn || path === '/') return <WelcomeScreen onLogin={login} />;

  let content: ReactNode;
  let area: 'trainer' | 'student' = path.startsWith('/student') ? 'student' : 'trainer';

  if (area === 'trainer') {
    const clientMatch = path.match(/^\/trainer\/clients\/([^/]+)$/);
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
      content = <StudentProfile data={data} studentId={clientMatch[1]} />;
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
          onAssign={(studentId, scheduledFor) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              workoutId: workout.id,
              studentId,
              assignedAt: new Date().toISOString(),
              scheduledFor,
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
      content = workout ? <WorkoutDetails data={data} workout={workout} /> : <NotFound />;
    } else if (sessionMatch) {
      const session = data.sessions.find((item) => item.id === sessionMatch[1]);
      content = session ? <SessionResult data={data} session={session} trainerView /> : <NotFound />;
    } else {
      content = <TrainerHome data={data} />;
    }
  } else {
    const activeMatch = path.match(/^\/student\/workout\/([^/]+)$/);
    const historyMatch = path.match(/^\/student\/history\/([^/]+)$/);
    const successMatch = path.match(/^\/student\/success\/([^/]+)$/);
    const finishMatch = path.match(/^\/student\/finish\/([^/]+)$/);

    if (path === '/student/calendar') {
      content = <WorkoutCalendar data={data} area="student" />;
    } else if (path === '/student/history') {
      content = <StudentHistory data={data} />;
    } else if (activeMatch) {
      const assignment = data.assignments.find((item) => item.id === activeMatch[1]);
      const workout = assignment && findWorkout(data, assignment.workoutId);
      const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
      content = assignment && workout ? (
        <ActiveWorkout
          assignment={assignment}
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
      {settingsOpen && <SettingsModal data={data} onClose={() => setSettingsOpen(false)} onReset={resetDemo} />}
    </AppShell>
  );
}

function WelcomeScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-glow" aria-hidden="true" />
      <section className="welcome-card">
        <Brand />
        <div className="welcome-copy">
          <p className="eyebrow">Тренировки без лишнего шума</p>
          <h1>ТВОЯ КОМАНДА.<br />ТВОЙ ПРОГРЕСС.</h1>
          <p className="welcome-description">Создавай тренировки, назначай их ученикам и следи за каждым подходом.</p>
        </div>
        <button className="primary-button" type="button" onClick={onLogin}>
          Войти как тренер <Icon name="arrow-up-right" />
        </button>
        <p className="demo-note"><span>DEMO</span> Результаты синхронизируются между ролями</p>
      </section>
      <figure className="hero-mascot">
        <img src="logo.png" alt="Маскот REPPY — спортивный динозавр" />
        <figcaption>TRAIN · TRACK · GROW</figcaption>
      </figure>
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
  ];
  const nav = area === 'trainer' ? trainerNav : studentNav;
  const displayName = area === 'trainer' ? TRAINER_NAME : student?.name ?? 'Ученик';

  const isActive = (route: string) => {
    if (route.endsWith('/calendar')) return path === route;
    if (route.endsWith('/clients')) return path.startsWith('/trainer/clients');
    if (route.endsWith('/workouts')) return path.startsWith('/trainer/workouts');
    if (route.endsWith('/history')) return path.startsWith('/student/history');
    return path === route || (route === '/student' && path.startsWith('/student/workout'));
  };

  return (
    <div className={`app-shell ${area}`}>
      <header className="topbar">
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
      </header>

      <aside className="desktop-nav" aria-label="Основная навигация">
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
      </aside>

      <div className="page-wrap">{children}</div>

      <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <button key={item.route} className={isActive(item.route) ? 'active' : ''} type="button" onClick={() => go(item.route)}>
            <span><Icon name={item.icon} /></span><small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function PageHeader({ eyebrow, title, action, back }: { eyebrow?: string; title: string; action?: ReactNode; back?: string }) {
  return (
    <header className="page-header">
      <div>
        {back && <button className="back-button" type="button" onClick={() => go(back)}><Icon name="chevron-left" /> Назад</button>}
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
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
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
  const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const selectedTitle = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDay}T12:00:00`));

  const moveMonth = (step: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + step, 1);
    setVisibleMonth(next);
    setSelectedDay(dateKey(next));
  };

  return (
    <main className="content-page calendar-page">
      <PageHeader eyebrow={area === 'trainer' ? 'Расписание команды' : 'Твой план'} title="КАЛЕНДАРЬ" />
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
                <span>{day.getDate()}</span>{dayAssignments.length > 0 && <i>{dayAssignments.length}</i>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="calendar-agenda">
        <div className="section-heading"><h2>{selectedTitle}</h2><span>{selectedAssignments.length ? `${selectedAssignments.length} в плане` : 'День свободен'}</span></div>
        {selectedAssignments.length ? <div className="agenda-list">{selectedAssignments.map((assignment) => {
          const workout = findWorkout(data, assignment.workoutId);
          const student = findStudent(data, assignment.studentId);
          const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
          const target = area === 'trainer'
            ? session ? `/trainer/sessions/${session.id}` : `/trainer/clients/${assignment.studentId}`
            : session ? `/student/history/${session.id}` : `/student/workout/${assignment.id}`;
          return (
            <button key={assignment.id} type="button" onClick={() => go(target)}>
              <span className={`agenda-status ${assignment.status}`}><Icon name={assignment.status === 'completed' ? 'check' : 'workout'} /></span>
              <div><strong>{workout?.name}</strong><small>{area === 'trainer' ? `${student?.name} · ` : ''}{totalSets(workout)} подходов</small>{session?.comment && <p>«{session.comment}»</p>}</div>
              <b>{assignment.status === 'completed' ? session?.mood ? moodLabel(session.mood) : 'Готово' : 'В плане'}</b>
            </button>
          );
        })}</div> : <EmptyState icon="calendar" title="Свободный день" text={area === 'trainer' ? 'У команды нет тренировок в этот день.' : 'На этот день тренировка не запланирована.'} />}
      </section>
    </main>
  );
}

function TrainerHome({ data }: { data: DemoState }) {
  const pending = data.assignments.filter((item) => item.status === 'assigned');
  const todayAssignments = data.assignments.filter((item) => item.scheduledFor === dateKey());
  const completed = [...data.sessions].filter((item) => item.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const recent = completed[0];
  const recentStudent = recent && findStudent(data, recent.studentId);
  const recentWorkout = recent && findWorkout(data, recent.workoutId);

  return (
    <main className="content-page">
      <PageHeader eyebrow={`Добрый вечер, ${TRAINER_NAME}`} title="ДЕРЖИМ ТЕМП." />
      <section className="stats-row">
        <article className="stat-card lime-card"><span>КОМАНДА</span><strong>{data.students.length}</strong><p>ученика в работе</p></article>
        <article className="stat-card violet-card"><span>В ПЛАНЕ</span><strong>{pending.length}</strong><p>тренировок назначено</p></article>
      </section>

      <section className="section-block">
        <div className="section-heading"><h2>Сегодня</h2><button type="button" onClick={() => go('/trainer/calendar')}>Календарь <Icon name="arrow-right" /></button></div>
        {todayAssignments.length ? (
          <div className="assignment-list">
            {todayAssignments.slice(0, 3).map((assignment) => {
              const student = findStudent(data, assignment.studentId);
              const workout = findWorkout(data, assignment.workoutId);
              return (
                <button className="activity-row" key={assignment.id} type="button" onClick={() => go(`/trainer/clients/${student?.id}`)}>
                  <Avatar student={student} />
                  <span><strong>{student?.name}</strong><small>{workout?.name} · {totalSets(workout)} подходов</small></span>
                  <b>{assignment.status === 'completed' ? 'Готово' : 'Назначено'}</b><i><Icon name="chevron-right" /></i>
                </button>
              );
            })}
          </div>
        ) : <EmptyState icon="calendar" title="План чист" text="На сегодня тренировок нет." action="Открыть календарь" onAction={() => go('/trainer/calendar')} />}
      </section>

      <section className="section-block">
        <div className="section-heading"><h2>Последняя активность</h2></div>
        {recent ? (
          <button className="recent-card" type="button" onClick={() => go(`/trainer/sessions/${recent.id}`)}>
            <div><span>ТРЕНИРОВКА ЗАВЕРШЕНА</span><h3>{recentWorkout?.name}</h3><p>{recentStudent?.name} · {formatDay(recent.completedAt)}{recent.mood ? ` · ${moodLabel(recent.mood)}` : ''}</p></div>
            <div className="completion-ring">100<small>%</small></div>
          </button>
        ) : <EmptyState icon="arrow-up-right" title="Здесь появится прогресс" text="Когда ученик закончит первую тренировку, результат будет виден здесь." />}
      </section>

      <button className="floating-cta" type="button" onClick={() => go('/trainer/workouts/new')}><Icon name="plus" /> {COPY.createWorkout}</button>
    </main>
  );
}

function ClientsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page">
      <PageHeader title="УЧЕНИКИ" action={<button className="compact-primary" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить</button>} />
      <p className="page-lead">Команда растёт вместе с тобой. Нажми на ученика, чтобы увидеть его план и результаты.</p>
      <section className="client-grid">
        {data.students.map((student) => {
          const assigned = data.assignments.find((item) => item.studentId === student.id && item.status === 'assigned');
          const recent = [...data.sessions].reverse().find((item) => item.studentId === student.id && item.completedAt);
          const status = student.status === 'invited'
            ? 'Ожидает приглашения'
            : assigned
              ? `Сегодня · ${findWorkout(data, assigned.workoutId)?.name}`
              : recent
                ? `Завершил · ${findWorkout(data, recent.workoutId)?.name}`
                : 'Нет назначений';
          return (
            <button className="client-card" key={student.id} type="button" onClick={() => go(`/trainer/clients/${student.id}`)}>
              <Avatar student={student} large />
              <span><strong>{student.name}</strong><small>{status}</small></span>
              <i><Icon name="arrow-up-right" /></i>
            </button>
          );
        })}
      </section>
      <button className="wide-secondary" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить ученика</button>
    </main>
  );
}

function Avatar({ student, large = false }: { student?: Student; large?: boolean }) {
  return <span className={`person-avatar ${student?.color ?? 'lime'} ${large ? 'large' : ''}`}>{student ? initials(student.name) : '?'}</span>;
}

function StudentProfile({ data, studentId }: { data: DemoState; studentId: string }) {
  const student = findStudent(data, studentId);
  if (!student) return <NotFound />;
  const assignments = data.assignments.filter((item) => item.studentId === studentId && item.status === 'assigned');
  const sessions = [...data.sessions].filter((item) => item.studentId === studentId && item.completedAt).reverse();

  return (
    <main className="content-page">
      <PageHeader back="/trainer/clients" title={student.name.toUpperCase()} />
      <section className="profile-hero">
        <Avatar student={student} large />
        <div><span>{student.status === 'active' ? 'АКТИВНЫЙ УЧЕНИК' : 'ПРИГЛАШЕНИЕ ОТПРАВЛЕНО'}</span><p>{assignments.length} назначено · {sessions.length} завершено</p></div>
      </section>

      <section className="section-block">
        <div className="section-heading"><h2>Назначено</h2><button type="button" onClick={() => go('/trainer/workouts')}><Icon name="plus" /> Назначить</button></div>
        {assignments.length ? assignments.map((assignment) => {
          const workout = findWorkout(data, assignment.workoutId);
          return (
            <button className="workout-row" key={assignment.id} type="button" onClick={() => workout && go(`/trainer/workouts/${workout.id}`)}>
              <span className="workout-number">{workout?.exercises.length ?? 0}</span>
              <span><strong>{workout?.name}</strong><small>{totalSets(workout)} подходов · {formatCalendarDay(assignment.scheduledFor)}</small></span><i><Icon name="chevron-right" /></i>
            </button>
          );
        }) : <EmptyState icon="plus" title="Пока пусто" text="Выбери готовую тренировку и назначь её ученику." action="Выбрать тренировку" onAction={() => go('/trainer/workouts')} />}
      </section>

      <section className="section-block">
        <div className="section-heading"><h2>Последняя активность</h2></div>
        {sessions.length ? sessions.map((session) => (
          <button className="session-row" key={session.id} type="button" onClick={() => go(`/trainer/sessions/${session.id}`)}>
            <span className="done-badge"><Icon name="check" /></span><span><strong>{findWorkout(data, session.workoutId)?.name}</strong><small>{formatDay(session.completedAt)}{session.mood ? ` · ${moodLabel(session.mood)}` : ''}</small></span><i>Результат <Icon name="arrow-right" /></i>
          </button>
        )) : <EmptyState icon="circle" title="Ещё нет результатов" text="Завершённые тренировки ученика появятся в этом блоке." />}
      </section>
    </main>
  );
}

function InviteStudent({ onCreate }: { onCreate: (student: Student) => void }) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<Student | null>(null);
  const [copied, setCopied] = useState(false);
  const inviteUrl = created && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/invite/${created.id}` : '';

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
          <button className="primary-button" type="button" disabled={!name.trim()} onClick={create}>Продолжить <Icon name="arrow-right" /></button>
        </section>
      ) : (
        <section className="invite-ready">
          <div className="success-mark"><Icon name="arrow-up-right" /></div>
          <h2>{created.name} почти в команде</h2>
          <p>Отправь эту демо-ссылку ученику. Его тренировки и результаты появятся у тренера автоматически.</p>
          <output>{inviteUrl}</output>
          <button className="primary-button" type="button" onClick={copy}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'} <Icon name={copied ? 'check' : 'copy'} /></button>
          <button className="wide-secondary" type="button" onClick={() => go('/trainer/clients')}>Готово</button>
        </section>
      )}
    </main>
  );
}

function WorkoutsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page">
      <PageHeader title="ТРЕНИРОВКИ" action={<button className="compact-primary" type="button" onClick={() => go('/trainer/workouts/new')}><Icon name="plus" /> Создать</button>} />
      <p className="page-lead">Готовые тренировки можно назначать снова — без повторного ввода упражнений.</p>
      <section className="workout-grid">
        {data.workouts.map((workout, index) => {
          const assignments = data.assignments.filter((item) => item.workoutId === workout.id && item.status === 'assigned');
          return (
            <button className={`workout-card tone-${index % 3}`} key={workout.id} type="button" onClick={() => go(`/trainer/workouts/${workout.id}`)}>
              <span className="workout-card-label">{assignments.length ? `НАЗНАЧЕНО · ${assignments.length}` : 'ШАБЛОН'}</span>
              <div><h2>{workout.name}</h2><p>{workout.exercises.length} упражнения · {totalSets(workout)} подходов</p></div>
              <span className="round-arrow"><Icon name="arrow-up-right" /></span>
            </button>
          );
        })}
      </section>
      <button className="wide-secondary" type="button" onClick={() => go('/trainer/workouts/new')}><Icon name="plus" /> {COPY.createWorkout}</button>
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

        <div className="form-section-heading"><h2>Упражнения</h2><span>{exercises.length}</span></div>
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
        <button className="add-exercise" type="button" onClick={() => setPickerOpen(true)}><Icon name="plus" /> Добавить упражнение</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button save-workout" type="button" onClick={save}>Сохранить тренировку <Icon name="arrow-right" /></button>
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
    <label className="metric-input"><span>{label}</span><input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
  );
}

function WorkoutDetails({ data, workout }: { data: DemoState; workout: Workout }) {
  const assignments = data.assignments.filter((item) => item.workoutId === workout.id && item.status === 'assigned');
  return (
    <main className="content-page narrow-page">
      <PageHeader back="/trainer/workouts" eyebrow={`${workout.exercises.length} упражнения · ${totalSets(workout)} подходов`} title={workout.name.toUpperCase()} />
      <section className="workout-summary-hero">
        <span>ПЛАН ТРЕНИРОВКИ</span><strong>{totalSets(workout)}</strong><p>подходов всего</p>
      </section>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p></div></article>
        ))}
      </section>
      {assignments.length > 0 && <p className="assigned-note">Назначено: {assignments.map((item) => findStudent(data, item.studentId)?.name).join(', ')}</p>}
      <div className="sticky-actions"><button className="wide-secondary" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/edit`)}>Редактировать</button><button className="primary-button" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/assign`)}>Назначить <Icon name="arrow-right" /></button></div>
    </main>
  );
}

function AssignWorkout({ workout, students, onAssign }: { workout: Workout; students: Student[]; onAssign: (studentId: string, scheduledFor: string) => void }) {
  const [selected, setSelected] = useState(students.find((student) => student.id === 'artem')?.id ?? students[0]?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const chosen = students.find((student) => student.id === selected);
  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/workouts/${workout.id}`} eyebrow={workout.name} title="КОМУ НАЗНАЧИТЬ?" />
      {students.length ? (
        <section className="select-student-list">
          {students.map((student) => (
            <button className={selected === student.id ? 'selected' : ''} key={student.id} type="button" onClick={() => setSelected(student.id)}>
              <Avatar student={student} /><span><strong>{student.name}</strong><small>{student.status === 'active' ? 'Готов к тренировке' : 'Ожидает приглашения'}</small></span><i><Icon name={selected === student.id ? 'check' : 'circle'} /></i>
            </button>
          ))}
          <label className="schedule-field"><span>Дата тренировки</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <button className="primary-button assign-button" type="button" onClick={() => selected && scheduledFor && onAssign(selected, scheduledFor)} disabled={!selected || !scheduledFor}>Назначить {chosen?.name ? chosen.name : ''}<Icon name="arrow-right" /></button>
        </section>
      ) : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </main>
  );
}

function StudentHome({ data, onStart }: { data: DemoState; onStart: (assignmentId: string) => void }) {
  const student = findStudent(data, data.activeStudentId);
  const assignments = data.assignments
    .filter((item) => item.studentId === data.activeStudentId && item.status === 'assigned')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const date = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <main className="content-page student-page">
      <PageHeader eyebrow={date} title={`ВПЕРЁД, ${student?.name?.toUpperCase() ?? 'АТЛЕТ'}!`} />
      {assignments.length ? (
        <section className="student-assignment-stack">
          {assignments.map((assignment, index) => {
            const workout = findWorkout(data, assignment.workoutId);
            const session = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
            const completedSets = session?.results.filter((item) => item.completed).length ?? 0;
            const progress = session ? Math.round((completedSets / Math.max(session.results.length, 1)) * 100) : 0;
            return (
              <article className={`student-workout-card ${index > 0 ? 'secondary-assignment' : ''}`} key={assignment.id}>
                <div className="student-card-top"><span>{formatCalendarDay(assignment.scheduledFor).toUpperCase()}</span><b>{session ? `${progress}%` : 'ГОТОВ'}</b></div>
                <div><h2>{workout?.name}</h2><p>{workout?.exercises.length} упражнения · {totalSets(workout)} подходов</p></div>
                <div className="workout-progress"><span style={{ width: `${session ? progress : 8}%` }} /></div>
                <button type="button" onClick={() => onStart(assignment.id)}>{session ? 'Продолжить тренировку' : 'Начать тренировку'} <Icon name="arrow-right" /></button>
              </article>
            );
          })}
        </section>
      ) : <EmptyState icon="sun" title="Сегодня отдых" text={COPY.emptyAssignments} />}

      <button className="calendar-shortcut" type="button" onClick={() => go('/student/calendar')}><span><Icon name="calendar" /></span><div><strong>Календарь тренировок</strong><small>Посмотреть план по дням</small></div><Icon name="chevron-right" /></button>

      <section className="student-tip"><span>МЫСЛЬ ДНЯ</span><p>Сильный результат складывается из подходов, которые ты не пропустил.</p></section>
    </main>
  );
}

function ActiveWorkout({
  assignment,
  workout,
  session,
  onStart,
  onUpdate,
  onFinish,
}: {
  assignment: Assignment;
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

  if (!session) return <main className="loading-screen"><span className="brand-icon">R</span><p>Готовим тренировку…</p></main>;

  const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
  const completed = session.results.filter((result) => result.completed).length;
  const progress = Math.round((completed / Math.max(session.results.length, 1)) * 100);

  const updateResult = (setNumber: number, patch: Partial<SetResult>) => {
    onUpdate(session.id, session.results.map((result) => result.exerciseId === exercise.id && result.setNumber === setNumber ? { ...result, ...patch } : result));
  };

  return (
    <main className="active-workout-page">
      <header className="active-header"><button type="button" onClick={() => go('/student')} aria-label="Закрыть тренировку"><Icon name="close" /></button><div><span>{workout.name}</span><strong>{exerciseIndex + 1} из {workout.exercises.length}</strong></div><b>{progress}%</b></header>
      <div className="active-progress"><span style={{ width: `${progress}%` }} /></div>
      <section className="active-exercise-title"><p>УПРАЖНЕНИЕ {String(exerciseIndex + 1).padStart(2, '0')}</p><h1>{exercise.name}</h1><span>Цель: {exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</span></section>
      <section className="set-list">
        {exerciseResults.map((result) => (
          <article className={`set-card ${result.completed ? 'completed' : ''}`} key={result.setNumber}>
            <div className="set-number"><span>ПОДХОД</span><strong>{result.setNumber}</strong></div>
            <label><span>КГ</span><input type="number" inputMode="decimal" value={result.actualWeight} step="2.5" onChange={(event) => updateResult(result.setNumber, { actualWeight: Number(event.target.value) })} /></label>
            <label><span>ПОВТОРЫ</span><input type="number" inputMode="numeric" value={result.actualReps} onChange={(event) => updateResult(result.setNumber, { actualReps: Number(event.target.value) })} /></label>
            <button type="button" onClick={() => updateResult(result.setNumber, { completed: !result.completed })} aria-label={result.completed ? `Отменить подход ${result.setNumber}` : `Завершить подход ${result.setNumber}`}><Icon name={result.completed ? 'check' : 'circle'} /></button>
          </article>
        ))}
      </section>
      <footer className="exercise-navigation">
        <button type="button" disabled={exerciseIndex === 0} onClick={() => setExerciseIndex((current) => current - 1)}><Icon name="chevron-left" /> Назад</button>
        {exerciseIndex < workout.exercises.length - 1 ? (
          <button className="next-exercise" type="button" onClick={() => setExerciseIndex((current) => current + 1)}>Следующее упражнение <Icon name="arrow-right" /></button>
        ) : (
          <button className="finish-workout" type="button" onClick={() => onFinish(session.id)}>Завершить тренировку <Icon name="check" /></button>
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
        <div className="feedback-intro"><span><Icon name="success" /></span><div><h2>Тренировка почти сохранена</h2><p>Оценка и комментарий будут видны тренеру вместе с результатами подходов.</p></div></div>
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
        <button className="primary-button" type="button" disabled={!mood} onClick={() => mood && onComplete(mood, comment)}>Сохранить результат <Icon name="check" /></button>
      </section>
    </main>
  );
}

function WorkoutSuccess({ data, session }: { data: DemoState; session: WorkoutSession }) {
  const workout = findWorkout(data, session.workoutId);
  const completed = session.results.filter((result) => result.completed).length;
  return (
    <main className="success-screen">
      <div className="success-burst" aria-hidden="true"><Icon name="check" /></div>
      <p className="eyebrow">Тренировка готова</p>
      <h1>ЭТО БЫЛО<br />СИЛЬНО.</h1>
      <section><strong>{workout?.name}</strong><div><span><b>{workout?.exercises.length}</b> упражнения</span><span><b>{completed}</b> подходов</span></div>{session.mood && <p className="success-mood"><Icon name="sun" /> Самочувствие: {moodLabel(session.mood)}</p>}</section>
      <button className="primary-button" type="button" onClick={() => go('/student')}>Готово <Icon name="arrow-right" /></button>
      <button className="history-link" type="button" onClick={() => go(`/student/history/${session.id}`)}>Посмотреть результаты</button>
    </main>
  );
}

function StudentHistory({ data }: { data: DemoState }) {
  const sessions = [...data.sessions].filter((item) => item.studentId === data.activeStudentId && item.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return (
    <main className="content-page student-page">
      <PageHeader eyebrow="Твои результаты" title="ИСТОРИЯ" />
      {sessions.length ? (
        <section className="history-list">
          {sessions.map((session) => {
            const workout = findWorkout(data, session.workoutId);
            return (
              <button key={session.id} type="button" onClick={() => go(`/student/history/${session.id}`)}>
                <span className="history-date">{formatDay(session.completedAt)}</span>
                <div><strong>{workout?.name}</strong><small>{workout?.exercises.length} упражнения · {session.results.filter((item) => item.completed).length} подходов</small></div>
                <i><Icon name="check" /></i>
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
      <section className="result-summary"><div><strong>{session.results.filter((item) => item.completed).length}</strong><span>подходов отмечено</span></div><div><strong>{workout.exercises.length}</strong><span>упражнения</span></div></section>
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

function InvitationScreen({ token, data, onAccept }: { token: string; data: DemoState; onAccept: (studentId: string) => void }) {
  const student = findStudent(data, token);
  if (!student) {
    return <main className="invitation-screen"><Brand /><EmptyState icon="close" title="Ссылка не работает" text="Попроси тренера создать новое приглашение." action="На главную" onAction={() => go('/')} /></main>;
  }
  return (
    <main className="invitation-screen">
      <Brand />
      <section className="invitation-card">
        <span className="invite-avatar">А</span>
        <p className="eyebrow">Приглашение в REPPY</p>
        <h1>{TRAINER_NAME.toUpperCase()} ЗОВЁТ ТЕБЯ В КОМАНДУ</h1>
        <p>Привет, {student.name}! Здесь ты будешь получать тренировки и отмечать результаты прямо в зале.</p>
        <button className="primary-button" type="button" onClick={() => onAccept(student.id)}>Принять приглашение <Icon name="arrow-right" /></button>
      </section>
    </main>
  );
}

function EmptyState({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty-state"><span><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p>{action && <button type="button" onClick={onAction}>{action} <Icon name="arrow-right" /></button>}</div>
  );
}

function SettingsModal({ data, onClose, onReset }: { data: DemoState; onClose: () => void; onReset: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Настройки демо" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-title"><div><span className="eyebrow">REPPY V0</span><h2>Настройки демо</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
        <div className="demo-stats"><span><b>{data.students.length}</b> учеников</span><span><b>{data.workouts.length}</b> тренировок</span><span><b>{data.sessions.filter((item) => item.completedAt).length}</b> результатов</span></div>
        <p>Тренировки, расписание и результаты хранятся в общем демо-пространстве и синхронизируются между ролями.</p>
        <button className="reset-button" type="button" onClick={onReset}>Сбросить демо-данные</button>
      </section>
    </div>
  );
}

function NotFound() {
  return <main className="content-page"><EmptyState icon="circle" title="Ничего не найдено" text="Этот экран или запись больше не существует." action="На главную" onAction={() => go('/')} /></main>;
}
