import { UI_ASSETS } from './ui/assets';
import { ListRow } from './ui/patterns';
import { SectionHeading, Field, ProgressBar } from './ui/patterns';
import { Page, Paragraph, Inline, Time, Section, Box, Strong, Small, Heading, Bold, Fieldset, Legend, Italic, Image, PageTitle, LineBreak } from './ui/elements';
import { useEffect, useState } from 'react';
import {
  createWorkoutSession,
  dateKey,
  findAssignmentWorkout,
  findSessionWorkout,
  formatCalendarDay,
  type Assignment,
  type DemoState,
  type MoodRating,
  type Workout,
  type WorkoutSession,
} from './reppy-data';
import type { ReppyCommand } from './reppy-commands';
import Icon from './ui/icon';
import EmptyState from './ui/empty-state';
import { ActionButton, Button, Textarea } from './ui/controls';
import WorkoutScheduleFields from './ui/workout-schedule-fields';
import NotFound from './not-found';
import RoutePageHeader from './route-page-header';
import ReadOnlyExerciseList from './ui/read-only-exercise-list';
import SessionResult from './session-result';
import { go } from './navigation';
import { MOODS, moodLabel } from './mood';
import {
  assignmentDateTime,
  assignmentStatusLabel,
  assignmentSortValue,
  assignmentTimeLabel,
  formatScheduleDay,
} from './schedule-display';
import { subscriptionBalance, subscriptionEntriesFor } from './subscription-ledger';
import { subscriptionBalanceLabel, subscriptionTone } from './workout-display';
import { clearUiDraft, isDraftDateString, isDraftTimeString, loadUiDraft, saveUiDraft } from './ui-persistence';
import ActiveWorkout from './active-workout';
import ExerciseProgressView, { StudentExerciseProgress } from './exercise-progress-view';
import { goBack } from './navigation';

const STUDENT_COPY = {
  emptyAssignments: 'На ближайшие две недели тренер пока ничего не назначил.',
};

function assignmentEntries(data: DemoState, assignment: Assignment) {
  return data.subscriptionEntries.filter((entry) => entry.studentId === assignment.studentId && (!assignment.relationshipId || entry.relationshipId === assignment.relationshipId));
}

function simultaneousAssignments(data: DemoState, assignment: Assignment) {
  return assignment.format === 'in-person' && data.assignments.some((other) => other.id !== assignment.id && other.studentId === assignment.studentId && other.status === 'assigned' && other.format === 'in-person' && other.scheduledFor === assignment.scheduledFor && other.scheduledTime === assignment.scheduledTime);
}

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
  backPath,
}: {
  data: DemoState;
  assignment: Assignment;
  onRequest: (scheduledFor: string, scheduledTime: string) => void;
  onStart: () => void;
  backPath: string;
}) {
  const workout = findAssignmentWorkout(data, assignment);
  const draftKey = `reschedule:${assignment.id}`;
  const [restoredDraft] = useState(() => loadUiDraft(draftKey));
  const [requestOpen, setRequestOpen] = useState(typeof restoredDraft?.requestOpen === 'boolean' ? restoredDraft.requestOpen : false);
  const [scheduledFor, setScheduledFor] = useState(isDraftDateString(restoredDraft?.scheduledFor) ? restoredDraft.scheduledFor : assignment.rescheduleRequest?.scheduledFor ?? assignment.scheduledFor);
  const [scheduledTime, setScheduledTime] = useState(isDraftTimeString(restoredDraft?.scheduledTime) ? restoredDraft.scheduledTime : assignment.rescheduleRequest?.scheduledTime ?? assignment.scheduledTime ?? '18:00');

  useEffect(() => {
    if (requestOpen && !assignment.rescheduleRequest) saveUiDraft(draftKey, { requestOpen, scheduledFor, scheduledTime });
    else clearUiDraft(draftKey);
  }, [assignment.rescheduleRequest, draftKey, requestOpen, scheduledFor, scheduledTime]);

  if (!workout) return <NotFound />;
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const completedSession = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const completed = assignment.status === 'completed' || Boolean(completedSession);
  const assignmentStatus = assignmentStatusLabel(assignment, data.sessions);
  const canStart = !completed && (assignment.format === 'online' || Boolean(activeSession) || assignment.scheduledFor === dateKey());
  const canRequestReschedule = !completed && !activeSession && assignment.format === 'in-person' && assignment.scheduledFor >= dateKey();
  const scheduleUnchanged = scheduledFor === assignment.scheduledFor && scheduledTime === assignment.scheduledTime;
  const entries = assignmentEntries(data, assignment);
  const balance = entries.reduce((total, entry) => total + entry.lessonDelta, 0);
  const hasSubscription = entries.length > 0;

  return (
    <Page className="content-page narrow-page student-assignment-page">
      <RoutePageHeader back={backPath} semanticBack eyebrow={assignmentStatus} title={workout.name.toUpperCase()} />
      {assignment.trainerName && <Paragraph>Тренер: {assignment.trainerName}</Paragraph>}
      {simultaneousAssignments(data, assignment) && <Paragraph>На это время назначена ещё одна тренировка. Уточни расписание у тренеров.</Paragraph>}
      <Paragraph className="student-assignment-meta"><Icon name={assignment.format === 'online' ? 'workout' : 'calendar'} /><Inline>{formatScheduleDay(assignment.scheduledFor)}</Inline><Inline aria-hidden="true">·</Inline><Time dateTime={assignmentDateTime(assignment)}>{assignment.format === 'online' ? 'Онлайн · в удобное время' : assignmentTimeLabel(assignment)}</Time></Paragraph>
      {!completed && assignment.rescheduleRequest ? <Section className="student-request-status"><Icon name="check" /><Box><Strong>Новое время предложено</Strong><Paragraph>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)} · {assignment.rescheduleRequest.scheduledTime}</Paragraph><Small>Тренер увидит запрос и подтвердит или отклонит его.</Small></Box></Section> : canRequestReschedule && <ActionButton variant="secondary" className="student-reschedule-button" icon="calendar" aria-expanded={requestOpen} onClick={() => setRequestOpen((current) => !current)}>Предложить другое время</ActionButton>}

      {canRequestReschedule && requestOpen && !assignment.rescheduleRequest && <Section className="student-reschedule-form">
        <WorkoutScheduleFields dateLabel="Новая дата" timeLabel="Новое время" scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <ActionButton icon="check" disabled={!scheduledFor || scheduledFor < dateKey() || !scheduledTime || scheduleUnchanged} onClick={() => { clearUiDraft(draftKey); onRequest(scheduledFor, scheduledTime); setRequestOpen(false); }}>Отправить тренеру</ActionButton>
      </Section>}

      {canStart && balance <= 0 && <Section className="subscription-warning debt student-debt-warning">
        <Icon name="minus" />
        <Box><Strong>{subscriptionBalanceLabel(balance, hasSubscription)}</Strong><Small>Эту тренировку можно завершить в долг. Занятие спишется как обычно.</Small></Box>
      </Section>}

      {completedSession && <ActionButton variant="secondary" icon="check" onClick={() => go(`/student/calendar/sessions/${completedSession.id}`)}>Посмотреть результат</ActionButton>}
      {canStart && <ActionButton className="student-start-button" icon="workout" onClick={onStart}>{activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</ActionButton>}
      {!completed && !canStart && <Paragraph>{assignment.scheduledFor < dateKey() ? 'Назначенный день уже прошёл. Свяжись с тренером, чтобы выбрать новое время.' : 'Очную тренировку можно начать в назначенный день.'}</Paragraph>}
      <SectionHeading title={<>Упражнения</>} className="workout-plan-heading"></SectionHeading>
      <ReadOnlyExerciseList workout={workout} />
    </Page>
  );
}


function StudentHome({ data, onOpen }: { data: DemoState; onOpen: (assignmentId: string) => void }) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const assignments = data.assignments
    .filter((item) => item.studentId === data.activeStudentId && item.status === 'assigned' && (item.format === 'online' || item.scheduledFor >= dateKey() || data.sessions.some((session) => session.assignmentId === item.id && !session.completedAt)) && item.scheduledFor <= dateKey(horizon))
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const mainAssignment = assignments[0];
  const mainSession = mainAssignment && data.sessions.find((item) => item.assignmentId === mainAssignment.id && !item.completedAt);
  const mainWorkout = mainAssignment && (mainSession ? findSessionWorkout(data, mainSession) : findAssignmentWorkout(data, mainAssignment));
  const mainCompletedSets = mainSession?.results.filter((item) => item.completed).length ?? 0;
  const mainProgress = mainSession ? Math.round((mainCompletedSets / Math.max(mainSession.results.length, 1)) * 100) : 0;
  const laterAssignments = assignments.slice(1);
  const balance = subscriptionBalance(data.subscriptionEntries, data.activeStudentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, data.activeStudentId).length > 0;
  const trainerCount = new Set([...data.assignments, ...data.subscriptionEntries].filter((item) => item.studentId === data.activeStudentId).map((item) => item.relationshipId).filter(Boolean)).size;

  return (
    <Page className="content-page student-page">
      {hasSubscription && <Button type="button" className={`student-subscription-status ${trainerCount > 1 ? '' : subscriptionTone(balance)}`} aria-label="Абонемент: открыть профиль" onClick={() => go('/student/profile')}>
        <Inline><Icon name={trainerCount > 1 ? 'users' : balance > 0 ? 'check' : 'minus'} /></Inline>
        <Box><Small>АБОНЕМЕНТ</Small><Strong>{trainerCount > 1 ? 'По тренерам' : subscriptionBalanceLabel(balance)}</Strong></Box>
      </Button>}
      {mainAssignment ? (
        <Section className="student-focus-card">
          <Box className="student-card-top"><Time dateTime={assignmentDateTime(mainAssignment)}><Strong>{formatScheduleDay(mainAssignment.scheduledFor)}</Strong><Small>{assignmentTimeLabel(mainAssignment)}{mainAssignment.trainerName ? ` · ${mainAssignment.trainerName}` : ''}</Small></Time>{mainSession && <Bold>{mainProgress}%</Bold>}</Box>
          <Box><Heading>{mainWorkout?.name}</Heading><Paragraph>{exercisePreview(mainWorkout)}</Paragraph></Box>
          {mainSession && <ProgressBar value={mainProgress} />}
          <Button type="button" onClick={() => onOpen(mainAssignment.id)}><Icon name="calendar" /> Посмотреть тренировку</Button>
        </Section>
      ) : <EmptyState icon="sun" title="Две недели свободны" text={STUDENT_COPY.emptyAssignments} />}

      <StudentExerciseProgress data={data} studentId={data.activeStudentId} go={go} area="student" hideEmpty />

      {laterAssignments.length > 0 && <Section className="student-upcoming">
        <SectionHeading title="Следующие тренировки" />
        <Box>{laterAssignments.map((assignment) => {
          const workout = findAssignmentWorkout(data, assignment);
          return <ListRow className="student-upcoming-row" key={assignment.id} type="button" onClick={() => onOpen(assignment.id)}><Time dateTime={assignmentDateTime(assignment)}><Strong>{formatCalendarDay(assignment.scheduledFor)}</Strong><Small>{assignmentTimeLabel(assignment)}{assignment.trainerName ? ` · ${assignment.trainerName}` : ''}</Small></Time><Inline><Strong>{workout?.name}</Strong><Small>{exercisePreview(workout)}</Small></Inline><Icon name="chevron-right" /></ListRow>;
        })}</Box>
      </Section>}
    </Page>
  );
}


function WorkoutFeedback({ data, session, backPath, onComplete }: { data: DemoState; session: WorkoutSession; backPath: string; onComplete: (mood: MoodRating, comment: string) => void }) {
  const draftKey = `feedback:${session.id}`;
  const [restoredDraft] = useState(() => loadUiDraft(draftKey));
  const [mood, setMood] = useState<MoodRating | null>(restoredDraft?.mood === 'great' || restoredDraft?.mood === 'good' || restoredDraft?.mood === 'tired' || restoredDraft?.mood === 'hard' ? restoredDraft.mood : null);
  const [comment, setComment] = useState(typeof restoredDraft?.comment === 'string' ? restoredDraft.comment : '');
  const workout = findSessionWorkout(data, session);

  useEffect(() => {
    if (mood || comment.trim()) saveUiDraft(draftKey, { mood, comment });
    else clearUiDraft(draftKey);
  }, [comment, draftKey, mood]);

  return (
    <Page className="feedback-page">
      <RoutePageHeader back={backPath} eyebrow={workout?.name} title="КАК ПРОШЛО?" />
      <Section className="feedback-card">
        <Fieldset className="mood-fieldset">
          <Legend>Твоё настроение после тренировки</Legend>
          <Box className="mood-grid">
            {MOODS.map((item) => (
              <Button className={mood === item.value ? 'selected' : ''} key={item.value} type="button" onClick={() => setMood(item.value)} aria-pressed={mood === item.value}>
                <Inline><Icon name={item.icon} /></Inline><Strong>{item.label}</Strong><Small>{item.detail}</Small>
              </Button>
            ))}
          </Box>
        </Fieldset>
        <Field label={<>Комментарий тренеру <Small>необязательно</Small></>} className="comment-field" htmlFor="workout-comment"><Textarea id="workout-comment" maxLength={280} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: последние подходы дались тяжело, но технику удержал" /><Italic>{comment.length}/280</Italic></Field>
        <ActionButton icon="check" disabled={!mood} onClick={() => { if (!mood) return; clearUiDraft(draftKey); onComplete(mood, comment); }}>Сохранить результат</ActionButton>
      </Section>
    </Page>
  );
}

function WorkoutSuccess({ data, session, backPath }: { data: DemoState; session: WorkoutSession; backPath: string }) {
  const workout = findSessionWorkout(data, session);
  const assignment = data.assignments.find((item) => item.id === session.assignmentId);
  const balance = assignment ? assignmentEntries(data, assignment).reduce((total, entry) => total + entry.lessonDelta, 0) : subscriptionBalance(data.subscriptionEntries, session.studentId);
  return (
    <Page className="success-screen">
      <Image className="success-illustration" src={UI_ASSETS.success} alt="" />
      <Paragraph className="eyebrow">Результат сохранён</Paragraph>
      <PageTitle>ТРЕНИРОВКА<LineBreak />ЗАВЕРШЕНА</PageTitle>
      <Section><Strong>{workout?.name}</Strong>{session.mood && <Paragraph className="success-mood"><Icon name="sun" /> Самочувствие: {moodLabel(session.mood)}</Paragraph>}<Paragraph className={`success-subscription ${subscriptionTone(balance)}`}>{subscriptionBalanceLabel(balance)}</Paragraph></Section>
      <ActionButton icon="check" onClick={() => go(backPath, true)}>Готово</ActionButton>
    </Page>
  );
}

export default function StudentRoutes({ path, data, dispatch }: { path: string; data: DemoState; dispatch: (command: ReppyCommand) => void }) {
  const [progressPath, progressSearch = ''] = path.split('?');
  const menuRoot = path.startsWith('/student/calendar/') ? '/student/calendar' : '/student';
  const assignmentDetailsMatch = path.match(/^\/student\/(?:calendar\/)?assignments\/([^/]+)$/);
  const activeMatch = path.match(/^\/student\/(?:calendar\/)?workout\/([^/]+)$/);
  const resultMatch = path.match(/^\/student\/(?:history|calendar\/sessions)\/([^/]+)$/);
  const successMatch = path.match(/^\/student\/(?:calendar\/)?success\/([^/]+)$/);
  const finishMatch = path.match(/^\/student\/(?:calendar\/)?finish\/([^/]+)$/);
  const progressMatch = progressPath.match(/^\/student\/progress\/([^/]+)$/);

  if (progressMatch) {
    return <ExerciseProgressView
      data={data}
      studentId={data.activeStudentId}
      exerciseId={progressMatch[1]}
      search={progressSearch}
      go={go}
      back={goBack}
      area="student"
    />;
  }

  if (assignmentDetailsMatch) {
    const assignment = data.assignments.find((item) => item.id === assignmentDetailsMatch[1] && item.studentId === data.activeStudentId);
    const completedSession = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
    if (completedSession) return <SessionResult data={data} session={completedSession} />;
    return assignment ? <StudentAssignmentDetails
      data={data}
      assignment={assignment}
      backPath={menuRoot}
      onRequest={(scheduledFor, scheduledTime) => {
        dispatch({ type: 'assignment.update', assignment: { ...assignment, rescheduleRequest: { scheduledFor, scheduledTime, requestedAt: new Date().toISOString() } } });
      }}
      onStart={() => go(`${menuRoot}/workout/${assignment.id}`)}
    /> : <NotFound />;
  }
  if (activeMatch) {
    const assignment = data.assignments.find((item) => item.id === activeMatch[1]);
    const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
    const completedSession = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
    const workout = assignment && (session ? findSessionWorkout(data, session) : completedSession ? findSessionWorkout(data, completedSession) : findAssignmentWorkout(data, assignment));
    if (assignment && workout && assignment.status === 'completed' && completedSession) return <WorkoutSuccess data={data} session={completedSession} backPath={menuRoot} />;
    if (!assignment || !workout) return <NotFound />;
    return <ActiveWorkout
      workout={workout}
      session={session}
      student={data.students.find((item) => item.id === assignment.studentId)}
      scheduledFor={assignment.scheduledFor}
      scheduledTime={assignment.scheduledTime}
      format={assignment.format}
      backPath={menuRoot}
      onStart={() => {
        if (!session) dispatch({ type: 'session.start', session: createWorkoutSession(assignment, workout, 'student') });
      }}
      onUpdate={(sessionId, results) => dispatch({ type: 'session.progress', sessionId, results })}
      onWorkoutUpdate={(sessionId, workoutSnapshot) => dispatch({ type: 'session.progress', sessionId, workoutSnapshot })}
      onFinish={(sessionId, { chargeSubscription }) => {
        dispatch({ type: 'session.complete', sessionId, assignmentId: assignment.id, completedAt: new Date().toISOString(), chargeSubscription, workoutName: workout.name });
        go(`${menuRoot}/finish/${sessionId}`);
      }}
    />;
  }
  if (finishMatch) {
    const session = data.sessions.find((item) => item.id === finishMatch[1]);
    return session ? <WorkoutFeedback data={data} session={session} backPath={menuRoot} onComplete={(mood, comment) => {
      dispatch({ type: 'session.feedback', sessionId: session.id, mood, comment });
      go(`${menuRoot}/success/${session.id}`);
    }} /> : <NotFound />;
  }
  if (successMatch) {
    const session = data.sessions.find((item) => item.id === successMatch[1]);
    return session ? <WorkoutSuccess data={data} session={session} backPath={menuRoot} /> : <NotFound />;
  }
  if (resultMatch) {
    const session = data.sessions.find((item) => item.id === resultMatch[1] && item.studentId === data.activeStudentId);
    return session ? <SessionResult data={data} session={session} /> : <NotFound />;
  }
  if (path === '/student') return <StudentHome data={data} onOpen={(assignmentId) => go(`/student/assignments/${assignmentId}`)} />;
  return <NotFound />;
}
