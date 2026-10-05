import { useState } from 'react';
import { findSessionWorkout, formatDay, type DemoState, type WorkoutSession } from './reppy-data';
import Icon from './ui-icon';
import { ActionButton } from './ui-controls';
import ConfirmationModal from './confirmation-modal';
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
    <main className="content-page narrow-page">
      <RoutePageHeader back={trainerView ? `/trainer/clients/${session.studentId}` : '/student/history'} semanticBack eyebrow={`${trainerView ? `${student?.name} · ` : ''}${formatDay(session.completedAt)}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      <dl className="session-summary" aria-label="Итоги тренировки">
        <div><dt>ДЛИТЕЛЬНОСТЬ</dt><dd>{elapsed}</dd></div>
        <div><dt>ПОДХОДЫ</dt><dd>{completedSets} из {session.results.length}</dd></div>
        <div><dt>УПРАЖНЕНИЯ</dt><dd>{workout.exercises.length}</dd></div>
      </dl>
      {trainerView && chargeStatus && <section className={`session-subscription-status ${chargeStatus}`}><Icon name={chargeStatus === 'charged' ? 'check' : 'minus'} /><span><small>АБОНЕМЕНТ</small><strong>{chargeStatus === 'charged' ? 'Одно занятие списано' : 'Занятие не списано'}</strong></span></section>}
      {(session.mood || session.comment) && <section className="session-feedback"><span>ОБРАТНАЯ СВЯЗЬ УЧЕНИКА</span>{session.mood && <strong><Icon name="sun" /> {moodLabel(session.mood)}</strong>}{session.comment && <p>{session.comment}</p>}</section>}
      {trainerView && <div className="session-result-actions">
        <ActionButton variant="secondary" icon="copy" onClick={onRepeat}>Повторить на другую дату</ActionButton>
        <ActionButton variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>Удалить тренировку</ActionButton>
      </div>}
      <section className="result-exercises">
        {workout.exercises.map((exercise, index) => {
          const results = session.results.filter((item) => item.exerciseId === exercise.id);
          return (
            <article key={exercise.id}>
              <header><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><small className="result-exercise-meta">{exerciseMetadata(exercise)}</small>{exercise.coachNote && <small className="result-coach-note"><Icon name="edit" /> {exercise.coachNote}</small>}</div></header>
              <div>{results.map((result) => <p className={result.completed ? '' : 'not-completed'} key={result.setNumber}><span>Подход {result.setNumber}</span><strong>{actualSetLabel(exercise, result)}</strong><i><Icon name={result.completed ? 'check' : 'minus'} /></i></p>)}</div>
              {trainerView && progressKeys.has(progressKey(exercise)) && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={() => go(progressHref(session.studentId, exercise))}>Прогресс упражнения</ActionButton>}
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
