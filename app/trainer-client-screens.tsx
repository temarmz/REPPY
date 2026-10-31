import { ListRow, Badge } from './ui/patterns';
import { Page, Section, Paragraph, Box, Heading, Output, Inline } from './ui/elements';
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
import Icon from './ui/icon';
import EmptyState from './ui/empty-state';
import { ActionButton, FormError, TextField, Button } from './ui/controls';
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
  draftIdentity,
  onCreate,
  onInvite,
}: {
  draftIdentity: string;
  onCreate: (student: Student) => void;
  onInvite?: (name: string) => Promise<{ student: Student; token: string; expiresAt: string }>;
}) {
  const draftKey = `invite-student:${draftIdentity}`;
  const [name, setName] = useState(() => {
    const draft = loadUiDraft(draftKey);
    return typeof draft?.name === 'string' ? draft.name : '';
  });
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
  }, [created, draftKey, name]);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
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
    <Page className="content-page narrow-page">
      <PageHeader back="/trainer/clients" eyebrow="Новый участник команды" title={created ? 'ССЫЛКА ГОТОВА' : 'ПРИГЛАСИТЬ УЧЕНИКА'} />
      {!created ? (
        <Section className="form-card">
          <TextField id="student-name" label="Имя ученика" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Сергей" autoFocus />
          <Paragraph className="field-hint">Мы добавим ученика в список со статусом «Ожидает приглашения».</Paragraph>
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="arrow-right" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? 'Создаём…' : 'Продолжить'}</ActionButton>
        </Section>
      ) : (
        <Section className="invite-ready">
          <Box className="success-mark"><Icon name="users" /></Box>
          <Heading>{created.student.name} почти в команде</Heading>
          <Paragraph>Отправь эту одноразовую ссылку ученику{created.expiresAt ? ` — она действует до ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(created.expiresAt))}` : ''}.</Paragraph>
          <Output>{inviteUrl}</Output>
          <ActionButton icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</ActionButton>
          <ActionButton variant="secondary" icon="check" onClick={() => go('/trainer/clients')}>Готово</ActionButton>
        </Section>
      )}
    </Page>
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
    <Page className="content-page workout-picker-page schedule-workout-picker-page">
      <PageHeader back={backPath} eyebrow={`${student.name} · ${formatScheduleDay(scheduledFor)}`} preserveEyebrowCase title="ВЫБРАТЬ ТРЕНИРОВКУ" />
      <Paragraph className="page-lead">Повтори одну из тренировок {student.name} или собери новую с нуля.</Paragraph>
      <Button className="list-primary-action" type="button" onClick={() => go(`${routeBase}/new`)}><Icon name="plus" /> {COPY.createWorkout}</Button>
      {previousAssignments.length ? (
        <>
        <Section className="workout-history-list schedule-history-list" aria-label={`Ранее назначенные тренировки ${student.name}`}>
          {visibleAssignments.map((assignment) => {
            const workout = workoutForRepeat(data, assignment);
            if (!workout) return null;
            const completed = assignment.status === 'completed' || data.sessions.some((session) => session.assignmentId === assignment.id && session.completedAt);
            const overdue = !completed && assignment.scheduledFor < dateKey();
            const statusLabel = completed ? 'Завершена' : overdue ? 'Не завершена' : 'Запланирована';
            return (
              <ListRow className="workout-history-row" key={assignment.id} type="button" onClick={() => go(`${routeBase}/copy/${assignment.id}`)}>
                <Inline className="history-copy-icon"><Icon name="copy" /></Inline>
                <Box><Heading>{workout.name}</Heading><Paragraph><Badge as="b" className={`history-status ${completed ? 'completed' : overdue ? 'overdue' : ''}`}>{statusLabel}</Badge>{assignmentScheduleLabel(assignment)} · {exercisePreview(workout, true)}</Paragraph></Box>
                <Icon name="chevron-right" />
              </ListRow>
            );
          })}
        </Section>
        {previousAssignments.length > 8 && <ActionButton variant="secondary" className="history-show-more" onClick={() => setShowAllHistory((current) => !current)}>{showAllHistory ? 'Показать последние' : `Показать ещё ${previousAssignments.length - 8}`}</ActionButton>}
        </>
      ) : <EmptyState icon="history" title="Предыдущих тренировок нет" text="Создай первую тренировку для этого ученика — позже её можно будет повторять на новые даты." />}
    </Page>
  );
}
