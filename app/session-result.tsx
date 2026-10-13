import { Page, DefinitionList, Box, DefinitionTerm, DefinitionValue, Section, Inline, Small, Strong, Paragraph, Card, Header, Heading, Italic } from './ui/elements';
import { useState } from 'react';
import { findSessionWorkout, formatDay, type DemoState, type WorkoutSession } from './reppy-data';
import Icon from './ui/icon';
import { ActionButton } from './ui/controls';
import ConfirmationModal from './ui/confirmation-modal';
import NotFound from './not-found';
import RoutePageHeader from './route-page-header';
import { collectExerciseProgress, progressHref, progressKey } from './exercise-progress';
import { go } from './navigation';
import { isSessionCharged } from './subscription-ledger';
import { moodLabel } from './mood';
import { actualSetLabel, exerciseMetadata, formatElapsedTime } from './workout-display';

export default function SessionResult({
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
  const student = data.students.find((item) => item.id === session.studentId);
  const charged = isSessionCharged(data.subscriptionEntries, session.id);
  const chargeStatus = charged ? 'charged' : session.subscriptionChargeStatus === 'waived' ? 'waived' : undefined;
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (!workout) return <NotFound />;
  const completedSets = session.results.filter((result) => result.completed).length;
  const progressKeys = new Set(collectExerciseProgress(data.sessions, session.studentId).map((group) => group.key));
  const elapsed = session.completedAt ? formatElapsedTime(session.startedAt, new Date(session.completedAt).getTime()).label : '—';
  return (
    <Page className="content-page narrow-page">
      <RoutePageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/calendar'} semanticBack={trainerView} eyebrow={`${trainerView ? `${student?.name} · ` : ''}${formatDay(session.completedAt)}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      <DefinitionList className="session-summary" aria-label="Итоги тренировки">
        <Box><DefinitionTerm>ДЛИТЕЛЬНОСТЬ</DefinitionTerm><DefinitionValue>{elapsed}</DefinitionValue></Box>
        <Box><DefinitionTerm>ПОДХОДЫ</DefinitionTerm><DefinitionValue>{completedSets} из {session.results.length}</DefinitionValue></Box>
        <Box><DefinitionTerm>УПРАЖНЕНИЯ</DefinitionTerm><DefinitionValue>{workout.exercises.length}</DefinitionValue></Box>
      </DefinitionList>
      {trainerView && chargeStatus && <Section className={`session-subscription-status ${chargeStatus}`}><Icon name={chargeStatus === 'charged' ? 'check' : 'minus'} /><Inline><Small>АБОНЕМЕНТ</Small><Strong>{chargeStatus === 'charged' ? 'Одно занятие списано' : 'Занятие не списано'}</Strong></Inline></Section>}
      {(session.mood || session.comment) && <Section className="session-feedback"><Inline>ОБРАТНАЯ СВЯЗЬ УЧЕНИКА</Inline>{session.mood && <Strong><Icon name="sun" /> {moodLabel(session.mood)}</Strong>}{session.comment && <Paragraph>{session.comment}</Paragraph>}</Section>}
      {trainerView && <Box className="session-result-actions">
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
              {trainerView && progressKeys.has(progressKey(exercise)) && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={() => go(progressHref(session.studentId, exercise))}>Прогресс упражнения</ActionButton>}
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
