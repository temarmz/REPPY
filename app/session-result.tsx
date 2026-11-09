import ModalFrame from './ui/modal-frame';
import { Field } from './ui/patterns';
import { Page, DefinitionList, Box, DefinitionTerm, DefinitionValue, Section, Inline, Small, Strong, Paragraph, Card, Header, Heading, Italic, SelectOption } from './ui/elements';
import { useState } from 'react';
import { findSessionWorkout, formatDay, type DemoState, type WorkoutSession } from './reppy-data';
import Icon from './ui/icon';
import { ActionButton, Select, Textarea } from './ui/controls';
import ConfirmationModal from './ui/confirmation-modal';
import NotFound from './not-found';
import RoutePageHeader from './route-page-header';
import { collectExerciseProgress, progressHref, progressKey } from './exercise-progress';
import { go } from './navigation';
import { isSessionCharged } from './subscription-ledger';
import { MOODS, moodLabel } from './mood';
import { actualSetLabel, exerciseMetadata, formatElapsedTime } from './workout-display';
import { assignmentScheduleLabel } from './schedule-display';

export default function SessionResult({
  data,
  session,
  trainerView = false,
  onFeedback,
  onChargeChange,
  onRepeat,
  onDelete,
}: {
  data: DemoState;
  session: WorkoutSession;
  trainerView?: boolean;
  onFeedback?: (mood: WorkoutSession['mood'], comment: string) => void;
  onChargeChange?: (charged: boolean) => void;
  onRepeat?: () => void;
  onDelete?: () => void;
}) {
  const workout = findSessionWorkout(data, session);
  const assignment = data.assignments.find((item) => item.id === session.assignmentId);
  const student = data.students.find((item) => item.id === session.studentId);
  const charged = isSessionCharged(data.subscriptionEntries, session.id);
  const chargeStatus = charged ? 'charged' : session.subscriptionChargeStatus === 'waived' ? 'waived' : undefined;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mood, setMood] = useState<WorkoutSession['mood'] | ''>(session.mood ?? '');
  const [comment, setComment] = useState(session.comment ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (!workout) return <NotFound />;
  const completedSets = session.results.filter((result) => result.completed).length;
  const sessionState = session.completedAt ? 'Завершённая тренировка' : 'Незавершённая тренировка';
  const progressKeys = new Set(collectExerciseProgress(data.sessions, session.studentId).map((group) => group.key));
  const elapsed = session.completedAt ? formatElapsedTime(session.startedAt, new Date(session.completedAt).getTime()).label : '—';
  return (
    <Page className="content-page narrow-page">
      <RoutePageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/calendar'} semanticBack eyebrow={`${trainerView ? `${student?.name} · ` : ''}${sessionState}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      <Paragraph>{assignment ? assignmentScheduleLabel(assignment) : formatDay(session.completedAt ?? session.startedAt)}</Paragraph>
      <DefinitionList className="session-summary" aria-label="Итоги тренировки">
        <Box><DefinitionTerm>ДЛИТЕЛЬНОСТЬ</DefinitionTerm><DefinitionValue>{elapsed}</DefinitionValue></Box>
        <Box><DefinitionTerm>ПОДХОДЫ</DefinitionTerm><DefinitionValue>{completedSets} из {session.results.length}</DefinitionValue></Box>
        <Box><DefinitionTerm>УПРАЖНЕНИЯ</DefinitionTerm><DefinitionValue>{workout.exercises.length}</DefinitionValue></Box>
      </DefinitionList>
      {session.autoCompleted && <Paragraph>Тренировка завершена автоматически.</Paragraph>}
      {session.completedAt && completedSets === 0 && <Paragraph>Тренировка завершена без отмеченных подходов.</Paragraph>}
      {trainerView && chargeStatus && <Section className={`session-subscription-status ${chargeStatus}`}><Icon name={chargeStatus === 'charged' ? 'check' : 'minus'} /><Inline><Small>АБОНЕМЕНТ</Small><Strong>{chargeStatus === 'charged' ? 'Одно занятие списано' : 'Занятие не списано'}</Strong></Inline></Section>}
      {(session.mood || session.comment) && <Section className="session-feedback"><Inline>КАК ПРОШЛА ТРЕНИРОВКА</Inline>{session.mood && <Strong><Icon name="sun" /> {moodLabel(session.mood)}</Strong>}{session.comment && <Paragraph>{session.comment}</Paragraph>}</Section>}
      {onFeedback && <ActionButton variant="secondary" icon="edit" onClick={() => { setMood(session.mood ?? ''); setComment(session.comment ?? ''); setFeedbackOpen(true); }}>{session.mood || session.comment ? 'Изменить отзыв' : 'Как прошла тренировка?'}</ActionButton>}
      {feedbackOpen && <ModalFrame title="Как прошла тренировка?" onClose={() => setFeedbackOpen(false)}>
        <Field label="Самочувствие"><Select aria-label="Самочувствие" value={mood} onChange={(event) => setMood(event.target.value as typeof mood)}><SelectOption value="">Без оценки</SelectOption>{MOODS.map((item) => <SelectOption key={item.value} value={item.value}>{item.label}</SelectOption>)}</Select></Field>
        <Field label="Комментарий"><Textarea aria-label="Комментарий о тренировке" maxLength={280} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
        <ActionButton onClick={() => { onFeedback?.(mood || undefined, comment); setFeedbackOpen(false); }}>Сохранить отзыв</ActionButton>
      </ModalFrame>}
      {trainerView && <Box className="session-result-actions">
        <ActionButton variant="secondary" icon="edit" onClick={() => go(`/trainer/sessions/${session.id}/edit`)}>Исправить результат</ActionButton>
        {session.completedAt && <ActionButton variant="secondary" icon="check" onClick={() => onChargeChange?.(!charged)}>{charged ? 'Сделать бесплатной' : 'Списать занятие'}</ActionButton>}
        <ActionButton variant="secondary" icon="copy" onClick={onRepeat}>Повторить на другую дату</ActionButton>
        <ActionButton variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>Удалить тренировку</ActionButton>
      </Box>}
      <Section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <Card key={exercise.id}>
              <Header><Inline>{String(index + 1).padStart(2, '0')}</Inline><Box><Heading>{exercise.name}</Heading><Small className="result-exercise-meta">{exerciseMetadata(exercise)}</Small>{exercise.coachNote && <Small className="result-coach-note"><Icon name="edit" /> {exercise.coachNote}</Small>}</Box></Header>
              <Box>{results.map((result) => <Paragraph className={result.completed ? '' : 'not-completed'} key={result.setNumber}><Inline>Подход {result.setNumber}</Inline><Strong>{actualSetLabel(exercise, result)}</Strong><Italic><Icon name={result.completed ? 'check' : 'minus'} /></Italic></Paragraph>)}</Box>
              {progressKeys.has(progressKey(exercise)) && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={() => go(progressHref(session.studentId, exercise, trainerView ? 'trainer' : 'student'))}>Прогресс упражнения</ActionButton>}
            </Card>
          );
        })}
      </Section>
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
    </Page>
  );
}
