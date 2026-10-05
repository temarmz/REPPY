import { lazy, useEffect, useState } from 'react';
import {
  createWorkoutSession,
  dateKey,
  findAssignmentWorkout,
  findSessionWorkout,
  formatCalendarDay,
  formatDay,
  type Assignment,
  type DemoState,
  type MoodRating,
  type Workout,
  type WorkoutSession,
} from './reppy-data';
import type { ReppyCommand } from './reppy-commands';
import Icon from './ui-icon';
import EmptyState from './empty-state';
import { ActionButton } from './ui-controls';
import WorkoutScheduleFields from './workout-schedule-fields';
import NotFound from './not-found';
import RoutePageHeader from './route-page-header';
import ReadOnlyExerciseList from './read-only-exercise-list';
import SessionResult from './session-result';
import { go } from './navigation';
import { MOODS, moodLabel } from './mood';
import {
  assignmentDateTime,
  assignmentSortValue,
  assignmentTimeLabel,
  formatScheduleDay,
} from './schedule-display';
import { subscriptionBalance, subscriptionEntriesFor } from './subscription-ledger';
import { subscriptionBalanceLabel, subscriptionTone } from './workout-display';
import { clearUiDraft, loadUiDraft, saveUiDraft } from './ui-persistence';

const ActiveWorkout = lazy(() => import('./active-workout'));

const STUDENT_COPY = {
  emptyAssignments: 'На ближайшие две недели тренер пока ничего не назначил.',
  emptyHistory: 'Завершённые тренировки появятся здесь.',
};

function exercisePreview(workout?: Workout) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises.slice(0, 3).map((exercise) => exercise.name).join(' · ');
  return workout.exercises.length > 3 ? `${preview} · …` : preview;
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
  const draftKey = `reschedule:${assignment.id}`;
  const [restoredDraft] = useState(() => loadUiDraft<{ requestOpen: boolean; scheduledFor: string; scheduledTime: string }>(draftKey));
  const [requestOpen, setRequestOpen] = useState(restoredDraft?.requestOpen ?? false);
  const [scheduledFor, setScheduledFor] = useState(restoredDraft?.scheduledFor ?? assignment.rescheduleRequest?.scheduledFor ?? assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(restoredDraft?.scheduledTime ?? assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime ?? '18:00');

  useEffect(() => {
    if (requestOpen && !assignment.rescheduleRequest) saveUiDraft(draftKey, { requestOpen, scheduledFor, scheduledTime });
    else clearUiDraft(draftKey);
  }, [assignment.rescheduleRequest, draftKey, requestOpen, scheduledFor, scheduledTime]);

  if (!workout) return <NotFound />;
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const canStart = assignment.format === 'online' || Boolean(activeSession) || assignment.scheduledFor === dateKey();
  const scheduleUnchanged = scheduledFor === assignment.scheduledFor && scheduledTime === assignment.scheduledTime;
  const balance = subscriptionBalance(data.subscriptionEntries, assignment.studentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, assignment.studentId).length > 0;

  return (
    <main className="content-page narrow-page student-assignment-page">
      <RoutePageHeader back="/student" eyebrow="Предстоящая тренировка" title={workout.name.toUpperCase()} />
      <p className="student-assignment-meta"><Icon name={assignment.format === 'online' ? 'workout' : 'calendar'} /><span>{formatScheduleDay(assignment.scheduledFor)}</span><span aria-hidden="true">·</span><time dateTime={assignmentDateTime(assignment)}>{assignment.format === 'online' ? 'Онлайн · в удобное время' : assignmentTimeLabel(assignment)}</time></p>
      {assignment.format === 'in-person' && (assignment.rescheduleRequest ? <section className="student-request-status"><Icon name="check" /><div><strong>Новое время предложено</strong><p>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)} · {assignment.rescheduleRequest.scheduledTime}</p><small>Тренер увидит запрос и подтвердит или отклонит его.</small></div></section> : <ActionButton variant="secondary" className="student-reschedule-button" icon="calendar" aria-expanded={requestOpen} onClick={() => setRequestOpen((current) => !current)}>Предложить другое время</ActionButton>)}

      {assignment.format === 'in-person' && requestOpen && !assignment.rescheduleRequest && <section className="student-reschedule-form">
        <WorkoutScheduleFields dateLabel="Новая дата" timeLabel="Новое время" scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <ActionButton icon="check" disabled={!scheduledFor || !scheduledTime || scheduleUnchanged} onClick={() => { clearUiDraft(draftKey); onRequest(scheduledFor, scheduledTime); setRequestOpen(false); }}>Отправить тренеру</ActionButton>
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
      ) : <EmptyState icon="sun" title="Две недели свободны" text={STUDENT_COPY.emptyAssignments} />}

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


function WorkoutFeedback({ data, session, onComplete }: { data: DemoState; session: WorkoutSession; onComplete: (mood: MoodRating, comment: string) => void }) {
  const draftKey = `feedback:${session.id}`;
  const [restoredDraft] = useState(() => loadUiDraft<{ mood: MoodRating | null; comment: string }>(draftKey));
  const [mood, setMood] = useState<MoodRating | null>(restoredDraft?.mood ?? null);
  const [comment, setComment] = useState(restoredDraft?.comment ?? '');
  const workout = findSessionWorkout(data, session);

  useEffect(() => {
    if (mood || comment.trim()) saveUiDraft(draftKey, { mood, comment });
    else clearUiDraft(draftKey);
  }, [comment, draftKey, mood]);

  return (
    <main className="feedback-page">
      <RoutePageHeader back="/student" eyebrow={workout?.name} title="КАК ПРОШЛО?" />
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
        <ActionButton icon="check" disabled={!mood} onClick={() => { if (!mood) return; clearUiDraft(draftKey); onComplete(mood, comment); }}>Сохранить результат</ActionButton>
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
      ) : <EmptyState icon="history" title="История начнётся здесь" text={STUDENT_COPY.emptyHistory} />}
    </main>
  );
}

export default function StudentRoutes({ path, data, dispatch, showToast }: { path: string; data: DemoState; dispatch: (command: ReppyCommand) => void; showToast: (message: string) => void }) {
  const assignmentDetailsMatch = path.match(/^\/student\/assignments\/([^/]+)$/);
  const activeMatch = path.match(/^\/student\/workout\/([^/]+)$/);
  const historyMatch = path.match(/^\/student\/history\/([^/]+)$/);
  const successMatch = path.match(/^\/student\/success\/([^/]+)$/);
  const finishMatch = path.match(/^\/student\/finish\/([^/]+)$/);

  if (path === '/student/history') return <StudentHistory data={data} />;
  if (assignmentDetailsMatch) {
    const assignment = data.assignments.find((item) => item.id === assignmentDetailsMatch[1] && item.studentId === data.activeStudentId);
    return assignment ? <StudentAssignmentDetails
      data={data}
      assignment={assignment}
      onRequest={(scheduledFor, scheduledTime) => {
        dispatch({ type: 'assignment.update', assignment: { ...assignment, rescheduleRequest: { scheduledFor, scheduledTime, requestedAt: new Date().toISOString() } } });
        showToast('Новое время отправлено тренеру');
      }}
      onStart={() => go(`/student/workout/${assignment.id}`)}
    /> : <NotFound />;
  }
  if (activeMatch) {
    const assignment = data.assignments.find((item) => item.id === activeMatch[1]);
    const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
    const completedSession = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
    const workout = assignment && (session ? findSessionWorkout(data, session) : completedSession ? findSessionWorkout(data, completedSession) : findAssignmentWorkout(data, assignment));
    if (assignment && workout && assignment.status === 'completed' && completedSession) return <WorkoutSuccess data={data} session={completedSession} />;
    if (!assignment || !workout) return <NotFound />;
    return <ActiveWorkout
      workout={workout}
      session={session}
      student={data.students.find((item) => item.id === assignment.studentId)}
      scheduledFor={assignment.scheduledFor}
      scheduledTime={assignment.scheduledTime}
      format={assignment.format}
      backPath="/student"
      onStart={() => {
        if (!session) dispatch({ type: 'session.start', session: createWorkoutSession(assignment, workout, 'student') });
      }}
      onUpdate={(sessionId, results) => dispatch({ type: 'session.progress', sessionId, results })}
      onWorkoutUpdate={(sessionId, workoutSnapshot) => dispatch({ type: 'session.progress', sessionId, workoutSnapshot })}
      onFinish={(sessionId, { chargeSubscription }) => {
        dispatch({ type: 'session.complete', sessionId, assignmentId: assignment.id, completedAt: new Date().toISOString(), chargeSubscription, workoutName: workout.name });
        go(`/student/finish/${sessionId}`);
      }}
    />;
  }
  if (finishMatch) {
    const session = data.sessions.find((item) => item.id === finishMatch[1]);
    return session ? <WorkoutFeedback data={data} session={session} onComplete={(mood, comment) => {
      dispatch({ type: 'session.feedback', sessionId: session.id, mood, comment });
      go(`/student/success/${session.id}`);
    }} /> : <NotFound />;
  }
  if (successMatch) {
    const session = data.sessions.find((item) => item.id === successMatch[1]);
    return session ? <WorkoutSuccess data={data} session={session} /> : <NotFound />;
  }
  if (historyMatch) {
    const session = data.sessions.find((item) => item.id === historyMatch[1]);
    return session ? <SessionResult data={data} session={session} /> : <NotFound />;
  }
  if (path === '/student') return <StudentHome data={data} onOpen={(assignmentId) => go(`/student/assignments/${assignmentId}`)} />;
  return <NotFound />;
}
