import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  TRAINER_NAME,
  cloneWorkout,
  createWorkoutSession,
  createWorkoutTemplate,
  dateKey,
  exerciseLibrary,
  findAssignmentWorkout,
  findSessionWorkout,
  findStudentWorkoutVersion,
  formatCalendarDay,
  formatDay,
  makeId,
  muscleGroups,
  repeatAssignment,
  resolveAssignmentWorkout,
  resolveEditedAssignmentSource,
  updateSessionWorkout,
  upsertStudentWorkoutVersion,
  type Assignment,
  type DemoState,
  type MoodRating,
  type MuscleGroup,
  type SetResult,
  type Student,
  type Workout,
  type WorkoutExercise,
  type WorkoutSession,
} from './reppy-data';
import Icon, { iconAssetPaths, type IconName } from './ui-icon';
import { useReppyData } from './use-reppy-data';

const COPY = {
  createWorkout: 'Создать шаблон',
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
  const hydratedPathReady = useRef(false);
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
    const handleNavigation = () => setPath(hashPath());
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    return () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || hydratedPathReady.current) return;
    hydratedPathReady.current = true;

    const requestedPath = hashPath();
    if (requestedPath === '/' && data.loggedIn) {
      const homePath = data.role === 'trainer' ? '/trainer' : '/student';
      window.history.replaceState({ reppyEntry: false }, '', `#${homePath}`);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
    }
  }, [data.loggedIn, data.role, hydrated]);

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
    const clientMatch = path.match(/^\/trainer\/clients\/([^/]+)$/);
    const assignmentEditMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/edit$/);
    const assignmentRepeatMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/repeat$/);
    const assignmentMatch = path.match(/^\/trainer\/assignments\/([^/]+)$/);
    const trainerActiveMatch = path.match(/^\/trainer\/workout\/([^/]+)$/);
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
            showToast('Шаблон сохранён');
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
          onSave={(updated, rememberForStudent) => {
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === updated.id ? updated : item),
              studentWorkoutVersions: rememberForStudent
                ? upsertStudentWorkoutVersion(current.studentWorkoutVersions, updated.studentId, updated.workoutId, updated.workoutSnapshot)
                : current.studentWorkoutVersions,
            }));
            showToast(rememberForStudent ? 'Назначение и версия ученика сохранены' : 'Назначение сохранено');
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
      const completedSession = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
      const sourceWorkout = assignment && (completedSession
        ? findSessionWorkout(data, completedSession)
        : findAssignmentWorkout(data, assignment));
      content = assignment && sourceWorkout ? (
        <RepeatAssignment
          data={data}
          assignment={assignment}
          sourceWorkout={sourceWorkout}
          onSave={(scheduledFor, scheduledTime, workout) => {
            const next = repeatAssignment(assignment, workout, scheduledFor, scheduledTime);
            setData((current) => ({ ...current, assignments: [...current.assignments, next] }));
            showToast('Тренировка скопирована на новую дату');
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
          backPath={`/trainer/assignments/${assignment.id}`}
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
          onFinish={(sessionId) => {
            const currentSession = data.sessions.find((item) => item.id === sessionId);
            const unfinished = currentSession?.results.some((result) => !result.completed);
            if (unfinished && !window.confirm('Есть незавершённые подходы. Всё равно закончить тренировку?')) return;
            const completedAt = new Date().toISOString();
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, status: 'completed' } : item),
              sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt } : item),
            }));
            showToast('Результат тренировки сохранён');
            go(`/trainer/sessions/${sessionId}`);
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
          onAssign={(studentId, scheduledFor, scheduledTime, useOriginalTemplate) => {
            setData((current) => {
              const currentWorkout = findWorkout(current, workout.id) ?? workout;
              const resolved = resolveAssignmentWorkout(current, studentId, currentWorkout, useOriginalTemplate);
              const assignment: Assignment = {
                id: makeId('assignment'),
                workoutId: currentWorkout.id,
                studentId,
                assignedAt: new Date().toISOString(),
                scheduledFor,
                scheduledTime,
                status: 'assigned',
                ...resolved,
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
        showToast('Копия шаблона создана');
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
          if (!window.confirm('Удалить завершённую тренировку и её результат? Это действие нельзя отменить.')) return;
          setData((current) => ({
            ...current,
            assignments: current.assignments.filter((item) => item.id !== session.assignmentId),
            sessions: current.sessions.filter((item) => item.assignmentId !== session.assignmentId),
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
            const currentSession = data.sessions.find((item) => item.id === sessionId);
            const unfinished = currentSession?.results.some((result) => !result.completed);
            if (unfinished && !window.confirm('Есть незавершённые подходы. Всё равно закончить тренировку?')) return;
            const completedAt = new Date().toISOString();
            setData((current) => ({
              ...current,
              assignments: current.assignments.map((item) => item.id === assignment.id ? { ...item, status: 'completed' } : item),
              sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt } : item),
            }));
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
  const focusMode = /^\/student\/(workout|finish|success)\//.test(path) || path.startsWith('/trainer/workout/');

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

function TrainerUpcomingRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
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
              ? `${formatCalendarDay(assigned.scheduledFor)}, ${assigned.scheduledTime} · ${findAssignmentWorkout(data, assigned)?.name}`
              : recent
                ? `Завершил · ${findSessionWorkout(data, recent)?.name}`
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
          const workout = findAssignmentWorkout(data, assignment);
          return (
            <button className="workout-row" key={assignment.id} type="button" onClick={() => workout && go(trainerView ? `/trainer/assignments/${assignment.id}` : `/student/assignments/${assignment.id}`)}>
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
            <span className="done-badge"><Icon name="check" /></span><span><strong>{findSessionWorkout(data, session)?.name}</strong><small>{formatDay(session.completedAt)}{session.mood ? ` · ${moodLabel(session.mood)}` : ''}</small></span><i><Icon name="chevron-right" /></i>
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
    <section className={`athlete-details section-block ${alwaysExpanded ? 'always-expanded' : ''}`}>
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
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => initial?.exercises.map((exercise) => ({ ...exercise })) ?? []);
  const [error, setError] = useState('');

  const save = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    const now = new Date().toISOString();
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
      <PageHeader back={initial ? `/trainer/workouts/${initial.id}` : '/trainer/workouts'} eyebrow={initial ? 'Редактирование шаблона' : 'Новый шаблон'} title={initial ? initial.name.toUpperCase() : 'СОБЕРИ ШАБЛОН'} />
      <section className="form-card workout-form">
        {initial && <p className="template-edit-note"><Icon name="edit" /> Ты редактируешь шаблон. Уже назначенные тренировки и история не изменятся.</p>}
        <label className="field-label" htmlFor="workout-name">Название тренировки</label>
        <input id="workout-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Грудь + плечи" />
        <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button save-workout" type="button" onClick={save}><Icon name="check" /> Сохранить шаблон</button>
      </section>
    </main>
  );
}

function WorkoutExerciseEditor({
  exercises,
  onChange,
  minSetsByExerciseId = {},
}: {
  exercises: WorkoutExercise[];
  onChange: (exercises: WorkoutExercise[]) => void;
  minSetsByExerciseId?: Record<string, number>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>('all');
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const filtered = exerciseLibrary.filter((exercise) => {
    const matchesMuscle = selectedMuscle === 'all' || exercise.primaryMuscle === selectedMuscle;
    const haystack = `${exercise.name} ${exercise.primaryMuscle} ${exercise.equipment}`.toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });

  const addExercise = (exercise: (typeof exerciseLibrary)[number]) => {
    onChange([...exercises, {
      id: makeId('exercise'),
      exerciseId: exercise.id,
      name: exercise.name,
      sets: 3,
      targetReps: 10,
      targetWeight: 20,
      coachNote: '',
    }]);
    setPickerOpen(false);
    setSearch('');
  };

  const updateExercise = (id: string, key: 'sets' | 'targetReps' | 'targetWeight', value: number) => {
    const minimum = key === 'sets' ? Math.max(1, minSetsByExerciseId[id] ?? 0) : key === 'targetWeight' ? 0 : 1;
    onChange(exercises.map((exercise) => exercise.id === id ? { ...exercise, [key]: Math.max(minimum, value || 0) } : exercise));
  };

  const updateCoachNote = (id: string, coachNote: string) => {
    onChange(exercises.map((exercise) => exercise.id === id ? { ...exercise, coachNote } : exercise));
  };

  return (
    <>
      <div className="form-section-heading"><h2>Упражнения</h2></div>
      <button className="add-exercise" type="button" onClick={() => setPickerOpen(true)}><Icon name="plus" /> Добавить упражнение</button>
      <div className="exercise-editor-list">
        {exercises.map((exercise, index) => {
          const lockedSets = minSetsByExerciseId[exercise.id] ?? 0;
          return (
            <article className="exercise-editor" key={exercise.id}>
              <div className="exercise-editor-head">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{exercise.name}</h3>
                <button type="button" disabled={lockedSets > 0} title={lockedSets > 0 ? 'Сначала отмени выполненные подходы' : undefined} onClick={() => onChange(exercises.filter((item) => item.id !== exercise.id))} aria-label={`Удалить ${exercise.name}`}><Icon name="close" /></button>
              </div>
              <div className="metric-grid">
                <MetricInput label="Подходы" value={exercise.sets} min={Math.max(1, lockedSets)} onChange={(value) => updateExercise(exercise.id, 'sets', value)} />
                <MetricInput label="Повторы" value={exercise.targetReps} min={1} onChange={(value) => updateExercise(exercise.id, 'targetReps', value)} />
                <MetricInput label="Вес, кг" value={exercise.targetWeight} onChange={(value) => updateExercise(exercise.id, 'targetWeight', value)} step={2.5} />
              </div>
              <label className="coach-note-field">
                <span>Подсказка по технике <small>необязательно</small></span>
                <textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => updateCoachNote(exercise.id, event.target.value)} placeholder="Например: держи локти вдоль тела" />
              </label>
            </article>
          );
        })}
      </div>

      {pickerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <section className="bottom-sheet exercise-picker-sheet" role="dialog" aria-modal="true" aria-label="Выбрать упражнение" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" /><div className="sheet-title"><h2>Выбрать упражнение</h2><button type="button" onClick={() => setPickerOpen(false)} aria-label="Закрыть"><Icon name="close" /></button></div>
            <input className="text-input search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" autoFocus />
            <div className="muscle-filter" aria-label="Фильтр по основной мышце">
              <button className={selectedMuscle === 'all' ? 'selected' : ''} type="button" onClick={() => setSelectedMuscle('all')} aria-pressed={selectedMuscle === 'all'}>Все</button>
              {muscleGroups.map((muscle) => <button className={selectedMuscle === muscle ? 'selected' : ''} key={muscle} type="button" onClick={() => setSelectedMuscle(muscle)} aria-pressed={selectedMuscle === muscle}>{muscle}</button>)}
            </div>
            <div className="picker-list">
              {filtered.map((exercise) => <button key={exercise.id} type="button" onClick={() => addExercise(exercise)}><span><Icon name="plus" /></span><div><strong>{exercise.name}</strong><small>{exercise.primaryMuscle} · {exercise.equipment}</small></div></button>)}
              {!filtered.length && <p className="picker-empty">Ничего не найдено. Попробуй другую категорию или запрос.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MetricInput({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label className="metric-input"><span>{label}</span><EditableNumberInput value={value} onChange={onChange} min={min} step={step} inputMode={step < 1 ? 'decimal' : 'numeric'} /></label>
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

function WorkoutDetails({ workout, onDuplicate }: { workout: Workout; onDuplicate: () => void }) {
  return (
    <main className="content-page narrow-page">
      <PageHeader back="/trainer/workouts" eyebrow="Шаблон тренировки" title={workout.name.toUpperCase()} />
      <div className="workout-detail-actions"><button className="wide-secondary" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/edit`)}><Icon name="edit" /> Редактировать</button><button className="wide-secondary" type="button" onClick={onDuplicate}><Icon name="copy" /> Дублировать</button><button className="primary-button" type="button" onClick={() => go(`/trainer/workouts/${workout.id}/assign`)}><Icon name="plus" /> Назначить</button></div>
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
  const workout = findAssignmentWorkout(data, assignment);
  const template = findWorkout(data, assignment.workoutId);
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  if (!student || !workout) return <NotFound />;
  const sourceLabel = assignment.source === 'student-version'
    ? `Персональная версия для ${student.name}`
    : assignment.source === 'manual-edit'
      ? 'Адаптировано только для этого назначения'
      : assignment.source === 'repeated'
        ? 'Скопировано из предыдущей тренировки этого ученика'
        : `Основано на шаблоне «${template?.name ?? workout.name}»`;

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={`${student.name} · ${formatCalendarDay(assignment.scheduledFor)}, ${assignment.scheduledTime}`} title={workout.name.toUpperCase()} />
      {assignment.rescheduleRequest && <section className="reschedule-request-card">
        <div><span>ЗАПРОС НА ПЕРЕНОС</span><h2>{student.name} предлагает другое время</h2><p><strong>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)}</strong><time>{assignment.rescheduleRequest.scheduledTime}</time></p></div>
        <div className="reschedule-request-actions"><button className="wide-secondary" type="button" onClick={onDeclineRequest}><Icon name="close" /> Отклонить</button><button className="primary-button" type="button" onClick={onAcceptRequest}><Icon name="check" /> Подтвердить</button></div>
      </section>}
      <section className="assignment-source"><Icon name={assignment.source === 'template' ? 'workout' : assignment.source === 'repeated' ? 'copy' : 'edit'} /><div><small>СОСТАВ ТРЕНИРОВКИ</small><strong>{sourceLabel}</strong></div></section>
      <div className="assignment-detail-actions">
        {assignment.status === 'assigned' && <button className="primary-button assignment-start-button" type="button" onClick={() => go(`/trainer/workout/${assignment.id}`)}><Icon name="workout" /> {activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</button>}
        {assignment.status === 'assigned' && <button className="wide-secondary" type="button" onClick={() => go(`/trainer/assignments/${assignment.id}/edit`)}><Icon name="edit" /> Редактировать</button>}
        <button className="wide-secondary" type="button" onClick={() => go(`/trainer/assignments/${assignment.id}/repeat`)}><Icon name="copy" /> Повторить на другую дату</button>
      </div>
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p>{exercise.coachNote && <small className="exercise-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></article>
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
  const workout = findAssignmentWorkout(data, assignment);
  const [requestOpen, setRequestOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(assignment.rescheduleRequest?.scheduledFor ?? assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime);
  if (!workout) return <NotFound />;
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const canStart = Boolean(activeSession) || assignment.scheduledFor === dateKey();
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

      {canStart && <button className="primary-button student-start-button" type="button" onClick={onStart}><Icon name="workout" /> {activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</button>}
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <section className="exercise-plan-list">
        {workout.exercises.map((exercise, index) => (
          <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.sets} × {exercise.targetReps} · {exercise.targetWeight} кг</p>{exercise.coachNote && <small className="exercise-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></article>
        ))}
      </section>
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
  const [scheduledFor, setScheduledFor] = useState(() => {
    const nextDate = new Date(`${assignment.scheduledFor}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 7);
    return dateKey(nextDate) < dateKey() ? dateKey() : dateKey(nextDate);
  });
  const [scheduledTime, setScheduledTime] = useState(assignment.scheduledTime);
  const [exercises, setExercises] = useState(() => sourceWorkout.exercises.map((exercise) => ({ ...exercise })));
  if (!student) return <NotFound />;

  const copyWorkout = () => {
    if (!scheduledFor || !scheduledTime || !exercises.length) return;
    onSave(scheduledFor, scheduledTime, { ...cloneWorkout(sourceWorkout), exercises });
  };

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/assignments/${assignment.id}`} eyebrow={student.name} title="ПОВТОРИТЬ ТРЕНИРОВКУ" />
      <section className="assignment-source repeat-source">
        <Icon name="copy" />
        <div><small>КОПИЯ ДЛЯ ТОГО ЖЕ УЧЕНИКА</small><strong>{sourceWorkout.name}</strong><p>Состав и нагрузки уже перенесены. При необходимости поправь их до сохранения.</p></div>
      </section>
      <section className="form-card repeat-assignment-form">
        <div className="schedule-fields">
          <label className="schedule-field"><span>Новая дата</span><input type="date" value={scheduledFor} min={dateKey()} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
        <WorkoutExerciseEditor exercises={exercises} onChange={setExercises} />
        <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime || !exercises.length} onClick={copyWorkout}><Icon name="copy" /> Скопировать тренировку</button>
      </section>
    </main>
  );
}

function AssignWorkout({ data, workout, onAssign }: { data: DemoState; workout: Workout; onAssign: (studentId: string, scheduledFor: string, scheduledTime: string, useOriginalTemplate: boolean) => void }) {
  const { students } = data;
  const [selected, setSelected] = useState(students.find((student) => student.id === 'artem')?.id ?? students[0]?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [useOriginalTemplate, setUseOriginalTemplate] = useState(false);
  const chosen = students.find((student) => student.id === selected);
  const personalVersion = selected ? findStudentWorkoutVersion(data, selected, workout.id) : undefined;
  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/workouts/${workout.id}`} eyebrow={workout.name} title="КОМУ НАЗНАЧИТЬ?" />
      {students.length ? (
        <section className="select-student-list">
          {students.map((student) => (
            <button className={selected === student.id ? 'selected' : ''} key={student.id} type="button" onClick={() => { setSelected(student.id); setUseOriginalTemplate(false); }}>
              <Avatar student={student} /><span><strong>{student.name}</strong>{student.status === 'invited' ? <small>Ожидает приглашения</small> : findStudentWorkoutVersion(data, student.id, workout.id) && <small>Есть персональная версия</small>}</span><i><Icon name={selected === student.id ? 'check' : 'circle'} /></i>
            </button>
          ))}
          {personalVersion && <section className="personal-version-note"><span><Icon name="check" /></span><div><strong>Для {chosen?.name} есть сохранённая версия</strong><p>{useOriginalTemplate ? 'Будет назначен исходный шаблон.' : 'По умолчанию назначаем персональные упражнения и нагрузки.'}</p><button type="button" onClick={() => setUseOriginalTemplate((current) => !current)}>{useOriginalTemplate ? 'Использовать персональную версию' : 'Назначить исходный шаблон'}</button></div></section>}
          <div className="schedule-fields">
            <label className="schedule-field"><span>Дата тренировки</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
            <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
          </div>
          <button className="primary-button assign-button" type="button" onClick={() => selected && scheduledFor && scheduledTime && onAssign(selected, scheduledFor, scheduledTime, useOriginalTemplate)} disabled={!selected || !scheduledFor || !scheduledTime}><Icon name="plus" /> Назначить {chosen?.name ? chosen.name : ''}</button>
        </section>
      ) : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </main>
  );
}

function EditAssignment({ data, assignment, onSave, onDelete }: { data: DemoState; assignment: Assignment; onSave: (assignment: Assignment, rememberForStudent: boolean) => void; onDelete: (assignment: Assignment) => void }) {
  const [scheduledFor, setScheduledFor] = useState(assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(assignment.scheduledTime);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => assignment.workoutSnapshot.exercises.map((exercise) => ({ ...exercise })));
  const [rememberForStudent, setRememberForStudent] = useState(false);
  const [error, setError] = useState('');
  const student = findStudent(data, assignment.studentId);
  const workout = findAssignmentWorkout(data, assignment);
  const existingVersion = findStudentWorkoutVersion(data, assignment.studentId, assignment.workoutId);
  const remove = () => {
    if (!window.confirm(`Удалить «${workout?.name ?? 'тренировку'}» из расписания ${student?.name ?? 'ученика'}?`)) return;
    onDelete(assignment);
  };
  const save = () => {
    if (!scheduledFor || !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    if (!workout) return;
    const exercisesChanged = JSON.stringify(exercises) !== JSON.stringify(workout.exercises);
    onSave({
      ...assignment,
      scheduledFor,
      scheduledTime,
      workoutSnapshot: exercisesChanged ? {
        ...cloneWorkout(workout),
        exercises: exercises.map((exercise) => ({ ...exercise })),
        updatedAt: new Date().toISOString(),
      } : cloneWorkout(workout),
      source: resolveEditedAssignmentSource(assignment.source, exercisesChanged, rememberForStudent),
    }, rememberForStudent);
  };

  if (!student || !workout) return <NotFound />;

  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/assignments/${assignment.id}`} eyebrow={`${student?.name} · ${workout?.name}`} title="ИЗМЕНИТЬ ЗАНЯТИЕ" />
      <section className="assignment-edit-card">
        <div className="assignment-edit-person"><Avatar student={student} large /><div><span>УЧЕНИК</span><strong>{student?.name}</strong><p>{workout?.name} · {exercisePreview(workout)}</p></div></div>
        <div className="schedule-fields">
          <label className="schedule-field"><span>Дата тренировки</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <label className="schedule-field"><span>Время начала</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        </div>
        <WorkoutExerciseEditor exercises={exercises} onChange={(next) => { setExercises(next); setError(''); }} />
        <label className="remember-version-toggle"><input type="checkbox" checked={rememberForStudent} onChange={(event) => setRememberForStudent(event.target.checked)} /><span><strong>Запомнить как версию для {student.name}</strong><small>{existingVersion ? 'Сохранённая персональная версия будет обновлена и применится к будущим назначениям.' : 'Эти упражнения и нагрузки будут автоматически подставляться в будущие назначения этого шаблона.'}</small></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="assignment-edit-actions">
          <button className="danger-button" type="button" onClick={remove}><Icon name="close" /> Удалить назначение</button>
          <button className="primary-button" type="button" disabled={!scheduledFor || !scheduledTime} onClick={save}><Icon name="check" /> Сохранить</button>
        </div>
      </section>
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

  return (
    <main className="content-page student-page">
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
  backPath,
  onStart,
  onUpdate,
  onWorkoutUpdate,
  onFinish,
}: {
  workout: Workout;
  session?: WorkoutSession;
  backPath: string;
  onStart: () => void;
  onUpdate: (sessionId: string, results: SetResult[]) => void;
  onWorkoutUpdate: (sessionId: string, workout: Workout) => void;
  onFinish: (sessionId: string) => void;
}) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [pickerAfterId, setPickerAfterId] = useState<string | null>(null);
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const moveHighlightTimer = useRef<number | null>(null);
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
  }, []);

  if (!session || !workout.exercises.length) {
    return <main className="loading-screen"><img className="loading-logo" src="logo-full.png" alt="REPPY" /><p>Готовим тренировку…</p></main>;
  }

  const completed = session.results.filter((result) => result.completed).length;
  const progress = Math.round((completed / Math.max(session.results.length, 1)) * 100);
  const elapsed = formatElapsedTime(session.startedAt, currentTime);

  const updateWorkout = (exercises: WorkoutExercise[]) => {
    if (!exercises.length) return;
    onWorkoutUpdate(session.id, { ...cloneWorkout(workout), exercises });
  };

  const updateExercisePlan = (
    exerciseId: string,
    key: 'sets' | 'targetReps' | 'targetWeight' | 'coachNote',
    value: number | string,
  ) => {
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, [key]: value } : exercise));
  };

  const updateResult = (exerciseId: string, setNumber: number, patch: Partial<SetResult>) => {
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

  const addExerciseAfter = (definition: { id: string; name: string }) => {
    if (!pickerAfterId) return;
    const afterIndex = workout.exercises.findIndex((exercise) => exercise.id === pickerAfterId);
    const nextExercise: WorkoutExercise = {
      id: makeId('exercise'),
      exerciseId: definition.id,
      name: definition.name,
      sets: 3,
      targetReps: 10,
      targetWeight: 20,
      coachNote: '',
    };
    const next = workout.exercises.map((exercise) => ({ ...exercise }));
    next.splice(afterIndex + 1, 0, nextExercise);
    updateWorkout(next);
    setPickerAfterId(null);
    focusExercise(nextExercise.id);
  };

  const actionExercise = workout.exercises.find((exercise) => exercise.id === actionExerciseId);
  const actionResults = actionExercise ? session.results.filter((result) => result.exerciseId === actionExercise.id) : [];
  const actionMinimumSets = Math.max(0, ...actionResults.filter((result) => result.completed).map((result) => result.setNumber));

  return (
    <main className="active-workout-page active-workout-list-page">
      <div className="active-sticky-header">
        <header className="active-header">
          <button type="button" onClick={() => goBack(backPath)} aria-label="Закрыть тренировку"><Icon name="close" /></button>
          <div className="active-header-copy"><span>{workout.name}</span><strong>{workout.exercises.length} упражнений</strong></div>
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
          return (
            <ActiveExerciseCard
              key={exercise.id}
              exercise={exercise}
              index={index}
              totalExercises={workout.exercises.length}
              results={exerciseResults}
              recentlyMoved={recentlyMovedId === exercise.id}
              onPlanChange={(key, value) => updateExercisePlan(exercise.id, key, value)}
              onResultChange={(setNumber, patch) => updateResult(exercise.id, setNumber, patch)}
              onShowInstruction={() => setInstructionExercise(exercise)}
              onShowActions={() => setActionExerciseId(exercise.id)}
              onAddSet={() => updateExercisePlan(exercise.id, 'sets', exercise.sets + 1)}
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
        canRemoveSet={actionExercise.sets > Math.max(1, actionMinimumSets)}
        canDeleteExercise={workout.exercises.length > 1 && actionMinimumSets === 0}
        onClose={() => setActionExerciseId(null)}
        onRemoveSet={() => {
          updateExercisePlan(actionExercise.id, 'sets', actionExercise.sets - 1);
          setActionExerciseId(null);
        }}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          if (!window.confirm(`Удалить упражнение «${actionExercise.name}» из этой тренировки?`)) return;
          updateWorkout(workout.exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}

      <footer className="exercise-navigation single-action">
        <button className="finish-workout" type="button" onClick={() => onFinish(session.id)}><Icon name="check" /> Завершить тренировку</button>
      </footer>
    </main>
  );
}

function ActiveExerciseCard({
  exercise,
  index,
  totalExercises,
  results,
  recentlyMoved,
  onPlanChange,
  onResultChange,
  onShowInstruction,
  onShowActions,
  onAddSet,
  onAddAfter,
  onMoveUp,
  onMoveDown,
}: {
  exercise: WorkoutExercise;
  index: number;
  totalExercises: number;
  results: SetResult[];
  recentlyMoved: boolean;
  onPlanChange: (key: 'sets' | 'targetReps' | 'targetWeight' | 'coachNote', value: number | string) => void;
  onResultChange: (setNumber: number, patch: Partial<SetResult>) => void;
  onShowInstruction: () => void;
  onShowActions: () => void;
  onAddSet: () => void;
  onAddAfter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const completedSets = results.filter((result) => result.completed).length;
  const allCompleted = results.length > 0 && completedSets === results.length;

  return (
    <article data-active-exercise={exercise.id} className={'active-exercise-card ' + (allCompleted ? 'completed ' : '') + (recentlyMoved ? 'recently-moved' : '')}>
      <header className="active-exercise-card-header">
        <span className="active-exercise-number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>{exercise.name}</h2>
          <small className="active-exercise-meta">{definition ? definition.primaryMuscle + ' · ' + definition.equipment : 'Пользовательское упражнение'}</small>
        </div>
        <div className="active-exercise-corner-actions">
          <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={onShowInstruction} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
          <button className="exercise-menu" type="button" aria-haspopup="dialog" onClick={onShowActions} aria-label={'Действия — ' + exercise.name}><Icon name="more" /></button>
        </div>
      </header>

      <div className="exercise-toolbar">
        <div className="active-exercise-actions">
          <button className={exercise.coachNote ? 'has-value' : ''} type="button" aria-expanded={commentOpen} onClick={() => setCommentOpen((current) => !current)}><Icon name="edit" /> {exercise.coachNote ? 'Комментарий' : 'Добавить комментарий'}</button>
        </div>
        <div className="exercise-order-controls">
          <button className="move-up" type="button" disabled={index === 0} onClick={onMoveUp} aria-label={'Поднять ' + exercise.name + ' выше'}><Icon name="chevron-left" /></button>
          <button className="move-down" type="button" disabled={index === totalExercises - 1} onClick={onMoveDown} aria-label={'Опустить ' + exercise.name + ' ниже'}><Icon name="chevron-right" /></button>
        </div>
      </div>

      {commentOpen && <label className="active-comment-field">
        <span>Комментарий к упражнению</span>
        <textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => onPlanChange('coachNote', event.target.value)} placeholder="Например: держи локти вдоль тела" autoFocus />
      </label>}

      <section className="active-card-sets">
        {results.map((result) => (
          <article className={'set-card ' + (result.completed ? 'completed' : '')} key={result.setNumber}>
            <div className="set-number"><span>ПОДХОД</span><strong>{result.setNumber}</strong></div>
            <div className="set-metrics">
              <label><span>КГ</span><EditableNumberInput value={result.actualWeight} step={2.5} inputMode="decimal" onChange={(actualWeight) => onResultChange(result.setNumber, { actualWeight })} /></label>
              <label><span>ПОВТОРЫ</span><EditableNumberInput value={result.actualReps} inputMode="numeric" onChange={(actualReps) => onResultChange(result.setNumber, { actualReps })} /></label>
            </div>
            <button type="button" onClick={() => onResultChange(result.setNumber, { completed: !result.completed })} aria-label={(result.completed ? 'Отменить подход ' : 'Завершить подход ') + result.setNumber + ' — ' + exercise.name}><Icon name="check" /></button>
          </article>
        ))}
      </section>

      <footer className="active-exercise-footer-actions">
        <button className="add-set-action" type="button" onClick={onAddSet}><Icon name="plus" /> Ещё подход</button>
        <button type="button" onClick={onAddAfter}><Icon name="plus" /> Ещё упражнение</button>
      </footer>
    </article>
  );
}

function ExerciseInstructionModal({ exercise, onClose }: { exercise: WorkoutExercise; onClose: () => void }) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const equipment = definition?.equipment && definition.equipment !== 'Свой вес' ? definition.equipment : null;
  return (
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
  );
}

function ExerciseActionsModal({
  exercise,
  canRemoveSet,
  canDeleteExercise,
  onClose,
  onRemoveSet,
  onDeleteExercise,
}: {
  exercise: WorkoutExercise;
  canRemoveSet: boolean;
  canDeleteExercise: boolean;
  onClose: () => void;
  onRemoveSet: () => void;
  onDeleteExercise: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="bottom-sheet exercise-actions-sheet" role="dialog" aria-modal="true" aria-label={'Действия — ' + exercise.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title"><h2>{exercise.name}</h2><button type="button" onClick={onClose} aria-label="Закрыть действия"><Icon name="close" /></button></div>
        <div className="exercise-action-list">
          <button type="button" disabled={!canRemoveSet} onClick={onRemoveSet}>
            <Icon name="minus" />
            <span><strong>Удалить подход</strong><small>{canRemoveSet ? 'Будет удалён последний подход' : 'Нельзя удалить выполненный или единственный подход'}</small></span>
          </button>
          <button className="danger" type="button" disabled={!canDeleteExercise} onClick={onDeleteExercise}>
            <Icon name="trash" />
            <span><strong>Удалить упражнение</strong><small>{canDeleteExercise ? 'Упражнение исчезнет из этой тренировки' : 'Сначала отмени выполненные подходы'}</small></span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ActiveExercisePicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (exercise: { id: string; name: string }) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>('all');
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = search.trim();
  const canCreateCustom = customName.length >= 2 && !exerciseLibrary.some((exercise) => exercise.name.toLocaleLowerCase('ru') === normalizedSearch);
  const filtered = exerciseLibrary.filter((exercise) => {
    const matchesMuscle = selectedMuscle === 'all' || exercise.primaryMuscle === selectedMuscle;
    const haystack = (exercise.name + ' ' + exercise.primaryMuscle + ' ' + exercise.equipment).toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="bottom-sheet exercise-picker-sheet" role="dialog" aria-modal="true" aria-label="Добавить упражнение после выбранного" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title"><h2>Добавить упражнение ниже</h2><button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></div>
        <input className="text-input search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
        <div className="muscle-filter" aria-label="Фильтр по основной мышце">
          <button className={selectedMuscle === 'all' ? 'selected' : ''} type="button" onClick={() => setSelectedMuscle('all')} aria-pressed={selectedMuscle === 'all'}>Все</button>
          {muscleGroups.map((muscle) => <button className={selectedMuscle === muscle ? 'selected' : ''} key={muscle} type="button" onClick={() => setSelectedMuscle(muscle)} aria-pressed={selectedMuscle === muscle}>{muscle}</button>)}
        </div>
        <div className="picker-list">
          {canCreateCustom && <button className="custom-exercise-option" type="button" onClick={() => onSelect({ id: makeId('custom-exercise'), name: customName })}><span><Icon name="plus" /></span><div><strong>Добавить «{customName}»</strong><small>Пользовательское упражнение</small></div></button>}
          {filtered.map((exercise) => <button key={exercise.id} type="button" onClick={() => onSelect(exercise)}><span><Icon name="plus" /></span><div><strong>{exercise.name}</strong><small>{exercise.primaryMuscle} · {exercise.equipment}</small></div></button>)}
          {!filtered.length && !canCreateCustom && <p className="picker-empty">Ничего не найдено. Введи хотя бы два символа, чтобы добавить своё упражнение.</p>}
        </div>
      </section>
    </div>
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
  return (
    <main className="success-screen">
      <img className="success-illustration" src="good-sm.png" alt="" />
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
  if (!workout) return <NotFound />;
  return (
    <main className="content-page narrow-page">
      <PageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/history'} eyebrow={`${trainerView ? `${student?.name} · ` : ''}${formatDay(session.completedAt)}`} title={workout.name.toUpperCase()} />
      <section className="session-recorded-by"><Icon name={session.recordedBy === 'trainer' ? 'users' : 'workout'} /><span><small>РЕЗУЛЬТАТ ЗАПОЛНИЛ</small><strong>{session.recordedBy === 'trainer' ? 'Тренер во время офлайн-занятия' : 'Ученик'}</strong></span></section>
      {(session.mood || session.comment) && <section className="session-feedback"><span>ОБРАТНАЯ СВЯЗЬ УЧЕНИКА</span>{session.mood && <strong><Icon name="sun" /> {moodLabel(session.mood)}</strong>}{session.comment && <p>{session.comment}</p>}</section>}
      {trainerView && <div className="session-result-actions">
        <button className="wide-secondary" type="button" onClick={onRepeat}><Icon name="copy" /> Повторить на другую дату</button>
        <button className="danger-button" type="button" onClick={onDelete}><Icon name="close" /> Удалить тренировку</button>
      </div>}
      <section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <article key={exercise.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2>{exercise.coachNote && <small className="result-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></header>
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
