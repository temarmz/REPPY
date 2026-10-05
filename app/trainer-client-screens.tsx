import { useEffect, useState } from 'react';
import {
  dateKey,
  findAssignmentWorkout,
  getExerciseSetPlans,
  makeId,
  workoutFromSession,
  type Assignment,
  type DemoState,
  type Student,
  type Workout,
} from './reppy-data';
import Icon from './ui-icon';
import EmptyState from './empty-state';
import { ActionButton, FormError, TextField } from './ui-controls';
import { go } from './navigation';
import PageHeader from './route-page-header';
import { assignmentScheduleLabel, assignmentSortValue, formatScheduleDay } from './schedule-display';
import { clearUiDraft, loadUiDraft, saveUiDraft } from './ui-persistence';

const COPY = { createWorkout: 'Создать тренировку' };

function workoutForRepeat(data: DemoState, assignment: Assignment) {
  const completedSession = data.sessions.find((session) => session.assignmentId === assignment.id && session.completedAt);
  return completedSession ? workoutFromSession(completedSession) : findAssignmentWorkout(data, assignment);
}

function exercisePreview(workout?: Workout, withPlan = false) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises.slice(0, 3).map((exercise) => withPlan ? exercise.name + ' · ' + getExerciseSetPlans(exercise).length + ' подх.' : exercise.name).join(' · ');
  return workout.exercises.length > 3 ? `${preview} · …` : preview;
}

export function InviteStudent({
  onCreate,
  onInvite,
}: {
  onCreate: (student: Student) => void;
  onInvite?: (name: string) => Promise<{ student: Student; token: string; expiresAt: string }>;
}) {
  const draftKey = 'invite-student';
  const [name, setName] = useState(() => loadUiDraft<{ name: string }>(draftKey)?.name ?? '');
  const [created, setCreated] = useState<{ student: Student; token?: string; expiresAt?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteUrl = created && typeof window !== 'undefined'
    ? created.token
      ? `${window.location.origin}${window.location.pathname}#/invite/${encodeURIComponent(created.token)}`
      : `${window.location.origin}${window.location.pathname}#/invite/${created.student.id}/${encodeURIComponent(created.student.name)}`
    : '';

  useEffect(() => {
    if (created || !name.trim()) clearUiDraft(draftKey);
    else saveUiDraft(draftKey, { name });
  }, [created, name]);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      clearUiDraft(draftKey);
      if (onInvite) {
        const invitation = await onInvite(clean);
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
          <p className="field-hint">Мы добавим ученика в список со статусом «Ожидает приглашения».</p>
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="arrow-right" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? 'Создаём…' : 'Продолжить'}</ActionButton>
        </section>
      ) : (
        <section className="invite-ready">
          <div className="success-mark"><Icon name="arrow-up-right" /></div>
          <h2>{created.student.name} почти в команде</h2>
          <p>Отправь эту одноразовую ссылку ученику{created.expiresAt ? ` — она действует до ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(created.expiresAt))}` : ''}.</p>
          <output>{inviteUrl}</output>
          <ActionButton icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</ActionButton>
          <ActionButton variant="secondary" icon="check" onClick={() => go('/trainer/clients')}>Готово</ActionButton>
        </section>
      )}
    </main>
  );
}

export function StudentWorkoutHistory({
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
