import { useEffect, useRef, useState } from 'react';
import {
  cloneWorkout,
  formatCalendarDay,
  getExerciseSetPlans,
  makeId,
  normalizeWorkoutExercise,
  withExerciseSetPlans,
  type SetResult,
  type ExerciseDefinition,
  type Student,
  type TrainingFormat,
  type Workout,
  type WorkoutExercise,
  type WorkoutSetPlan,
  type WorkoutSession,
} from './reppy-data';
import Icon from './ui-icon';
import { ActiveExerciseCard } from './workout-exercise-card';
import ModalFrame from './modal-frame';
import { ActionButton } from './ui-controls';
import ExerciseInstructionModal from './exercise-instruction-modal';
import { ExerciseActionsModal, ExercisePicker, type ExercisePickerChoice } from './exercise-picker';
import { goBack, hashPath } from './navigation';
import { LoadingScreen } from './onboarding-screens';
import {
  clearUiDraft,
  loadUiDraft,
  loadWorkoutPicker,
  saveUiDraft,
  saveWorkoutPicker,
} from './ui-persistence';
import {
  exerciseMetadata,
  formatElapsedTime,
  subscriptionBalanceLabel,
  subscriptionTone,
} from './workout-display';

type WorkoutFinishOptions = {
  chargeSubscription: boolean;
};

export default function ActiveWorkout({
  workout,
  session,
  student,
  scheduledFor,
  scheduledTime,
  format,
  backPath,
  onStart,
  onUpdate,
  onWorkoutUpdate,
  onFinish,
  trainerCanWaiveCharge = false,
  balance = 0,
  customExercises = [],
  onCreateCustomExercise,
  onUpdateCustomExercise,
}: {
  workout: Workout;
  session?: WorkoutSession;
  student?: Student;
  scheduledFor: string;
  scheduledTime?: string;
  format: TrainingFormat;
  backPath: string;
  onStart: () => void;
  onUpdate: (sessionId: string, results: SetResult[]) => void;
  onWorkoutUpdate: (sessionId: string, workout: Workout) => void;
  onFinish: (sessionId: string, options: WorkoutFinishOptions) => void;
  trainerCanWaiveCharge?: boolean;
  balance?: number;
  customExercises?: ExerciseDefinition[];
  onCreateCustomExercise?: (definition: ExerciseDefinition) => void;
  onUpdateCustomExercise?: (definition: ExerciseDefinition) => void;
}) {
  const pickerPersistenceKey = `active:${hashPath()}`;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [pickerAfterId, setPickerAfterId] = useState<string | null>(() => {
    const stored = loadWorkoutPicker(pickerPersistenceKey);
    return stored && stored !== 'start' && workout.exercises.some((exercise) => exercise.id === stored) ? stored : null;
  });
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(() => {
    const stored = loadUiDraft<{ exerciseId: string }>(`instruction:${pickerPersistenceKey}`);
    return workout.exercises.find((exercise) => exercise.id === stored?.exerciseId) ?? null;
  });
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saving' | 'saved'>('saved');
  const moveHighlightTimer = useRef<number | null>(null);
  const saveStateTimer = useRef<number | null>(null);
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
    if (saveStateTimer.current) window.clearTimeout(saveStateTimer.current);
  }, []);

  useEffect(() => {
    saveWorkoutPicker(pickerPersistenceKey, pickerAfterId);
  }, [pickerAfterId, pickerPersistenceKey]);

  useEffect(() => {
    if (instructionExercise) saveUiDraft(`instruction:${pickerPersistenceKey}`, { exerciseId: instructionExercise.id });
    else clearUiDraft(`instruction:${pickerPersistenceKey}`);
  }, [instructionExercise, pickerPersistenceKey]);

  if (!session || !workout.exercises.length) {
    return <LoadingScreen message="Готовим тренировку…" />;
  }

  const completed = session.results.filter((result) => result.completed).length;
  const progress = Math.round((completed / Math.max(session.results.length, 1)) * 100);
  const elapsed = formatElapsedTime(session.startedAt, currentTime);
  const unfinishedCount = session.results.filter((result) => !result.completed).length;

  const markSaving = () => {
    setSaveState('saving');
    if (saveStateTimer.current) window.clearTimeout(saveStateTimer.current);
    saveStateTimer.current = window.setTimeout(() => setSaveState('saved'), 450);
  };

  const updateWorkout = (exercises: WorkoutExercise[]) => {
    if (!exercises.length) return;
    markSaving();
    onWorkoutUpdate(session.id, { ...cloneWorkout(workout), exercises });
  };

  const updateExerciseNote = (exerciseId: string, coachNote: string) => {
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, coachNote } : exercise));
  };

  const updateExerciseSets = (exerciseId: string, update: (plans: WorkoutSetPlan[], exercise: WorkoutExercise) => WorkoutSetPlan[]) => {
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId
      ? withExerciseSetPlans(exercise, update(getExerciseSetPlans(exercise), exercise))
      : exercise));
  };

  const updateResult = (exerciseId: string, setNumber: number, patch: Partial<SetResult>) => {
    markSaving();
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

  const addExerciseAfter = (definition: ExercisePickerChoice) => {
    if (!pickerAfterId) return;
    const afterIndex = workout.exercises.findIndex((exercise) => exercise.id === pickerAfterId);
    const loadMode = definition.loadMode ?? (definition.equipment === 'Свой вес' ? 'bodyweight' : 'external');
    const nextExercise = normalizeWorkoutExercise({
      id: makeId('exercise'),
      exerciseId: definition.id,
      name: definition.name,
      primaryMuscle: definition.primaryMuscle,
      muscleGroups: definition.muscleGroups,
      equipment: definition.equipment,
      loadMode,
      measureType: definition.measureType ?? 'reps',
      plannedSets: [],
      coachNote: '',
    });
    const next = workout.exercises.map((exercise) => ({ ...exercise }));
    next.splice(afterIndex + 1, 0, nextExercise);
    updateWorkout(next);
    setPickerAfterId(nextExercise.id);
    focusExercise(nextExercise.id);
  };

  const actionExercise = workout.exercises.find((exercise) => exercise.id === actionExerciseId);
  const canRemovePickedExercise = (exerciseId: string) => {
    const item = workout.exercises.findLast((exercise) => exercise.exerciseId === exerciseId);
    return Boolean(item && workout.exercises.length > 1 && !session.results.some((result) => result.exerciseId === item.id && result.completed));
  };
  const removePickedExercise = (exerciseId: string) => {
    const index = workout.exercises.findLastIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || workout.exercises.length <= 1) return;
    const item = workout.exercises[index];
    if (session.results.some((result) => result.exerciseId === item.id && result.completed)) return;
    updateWorkout(workout.exercises.filter((_, current) => current !== index));
    if (pickerAfterId === item.id) setPickerAfterId(workout.exercises[index - 1]?.id ?? workout.exercises.find((exercise) => exercise.id !== item.id)?.id ?? null);
  };
  const actionResults = actionExercise ? session.results.filter((result) => result.exerciseId === actionExercise.id) : [];
  const actionMinimumSets = Math.max(0, ...actionResults.filter((result) => result.completed).map((result) => result.setNumber));
  const actionDeleteDisabledReason = actionMinimumSets > 0
    ? 'Сначала отмени выполненные подходы'
    : workout.exercises.length <= 1
      ? 'В тренировке должно остаться хотя бы одно упражнение'
      : undefined;

  return (
    <main className="active-workout-page active-workout-list-page">
      <div className="active-sticky-header">
        <header className="active-header">
          <button type="button" onClick={() => goBack(backPath)} aria-label="Вернуться назад"><Icon name="chevron-left" /></button>
          <div className="active-header-copy"><span>{student ? `${student.name} · ${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}` : `${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}`}</span><strong>{workout.name} · <i className={`save-state ${saveState}`} role="status" aria-live="polite">{saveState === 'saving' ? 'Сохраняем…' : 'Сохранено'}</i></strong></div>
          <button className="active-header-add" type="button" onClick={() => setPickerAfterId(workout.exercises.at(-1)?.id ?? null)} aria-label="Добавить упражнение"><Icon name="plus" /></button>
          <div className="active-timing"><time dateTime={'PT' + elapsed.elapsedSeconds + 'S'} aria-label={'Прошло ' + elapsed.label}>{elapsed.label}</time><b>{progress}%</b></div>
        </header>
        <div className="active-progress" role="progressbar" aria-label="Прогресс тренировки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + '%' }} /></div>
      </div>

      <section className="active-workout-overview">
        <h1>{workout.name}</h1>
      </section>

      <section className="active-exercise-list">
        {workout.exercises.map((exercise, index) => {
          const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
          const minimumSets = Math.max(0, ...exerciseResults.filter((result) => result.completed).map((result) => result.setNumber));
          return (
            <ActiveExerciseCard
              key={exercise.id}
              exercise={exercise}
              metadata={exerciseMetadata(exercise)}
              index={index}
              totalExercises={workout.exercises.length}
              results={exerciseResults}
              recentlyMoved={recentlyMovedId === exercise.id}
              onNoteChange={(coachNote) => updateExerciseNote(exercise.id, coachNote)}
              onResultChange={(setNumber, patch) => updateResult(exercise.id, setNumber, patch)}
              onShowInstruction={() => setInstructionExercise(exercise)}
              onShowActions={() => setActionExerciseId(exercise.id)}
              onAddSet={() => updateExerciseSets(exercise.id, (plans, current) => [...plans, { ...(plans.at(-1) ?? { targetReps: current.measureType === 'duration' ? 30 : 10, targetWeight: current.loadMode === 'bodyweight' ? 0 : 20 }) }])}
              canRemoveSet={getExerciseSetPlans(exercise).length > minimumSets}
              onRemoveSet={() => updateExerciseSets(exercise.id, (plans) => plans.slice(0, -1))}
              onMoveUp={() => moveExercise(index, index - 1)}
              onMoveDown={() => moveExercise(index, index + 1)}
            />
          );
        })}
      </section>

      {pickerAfterId && <ExercisePicker persistenceKey={`picker:${pickerPersistenceKey}`} exercises={workout.exercises} customExercises={customExercises} onCreateCustom={onCreateCustomExercise} onUpdateCustom={onUpdateCustomExercise} onClose={() => setPickerAfterId(null)} onSelect={addExerciseAfter} onRemove={removePickedExercise} canRemove={canRemovePickedExercise} />}
      {instructionExercise && <ExerciseInstructionModal
        exercise={instructionExercise}
        studentId={student?.id}
        editable={trainerCanWaiveCharge}
        persistenceKey={`instruction:${pickerPersistenceKey}:${instructionExercise.id}`}
        onClose={() => setInstructionExercise(null)}
        onSave={(patch) => updateWorkout(workout.exercises.map((exercise) => exercise.id === instructionExercise.id ? { ...exercise, ...patch } : exercise))}
      />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        deleteDisabledReason={actionDeleteDisabledReason}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          updateWorkout(workout.exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
      {finishOpen && <FinishWorkoutModal
        balance={balance}
        unfinishedCount={unfinishedCount}
        canWaiveCharge={trainerCanWaiveCharge}
        onClose={() => setFinishOpen(false)}
        onFinish={(options) => {
          setFinishOpen(false);
          onFinish(session.id, options);
        }}
      />}

      <footer className="exercise-navigation single-action">
        <button className="finish-workout" type="button" onClick={() => setFinishOpen(true)}><Icon name="check" /> Завершить тренировку</button>
      </footer>
    </main>
  );
}

function FinishWorkoutModal({ balance, unfinishedCount, canWaiveCharge, onClose, onFinish }: { balance: number; unfinishedCount: number; canWaiveCharge: boolean; onClose: () => void; onFinish: (options: WorkoutFinishOptions) => void }) {
  return (
    <ModalFrame title="Завершить тренировку" eyebrow={canWaiveCharge ? 'АБОНЕМЕНТ' : undefined} className="finish-workout-sheet" ariaLabel="Завершение тренировки" onClose={onClose}>
      {unfinishedCount > 0 && <div className="finish-incomplete-warning"><Icon name="minus" /><div><strong>Есть незавершённые подходы</strong><small>Не отмечено: {unfinishedCount}. Результат сохранится в текущем виде.</small></div></div>}
      {canWaiveCharge && <div className={`finish-balance-preview ${subscriptionTone(balance)}`}>
        <span>СЕЙЧАС</span><strong>{subscriptionBalanceLabel(balance)}</strong>
        <Icon name="arrow-right" />
        <span>ПОСЛЕ</span><strong>{subscriptionBalanceLabel(balance - 1)}</strong>
      </div>}
      <div className="finish-subscription-actions">
        <ActionButton icon="check" onClick={() => onFinish({ chargeSubscription: true })}>{canWaiveCharge ? 'Завершить и списать занятие' : 'Завершить тренировку'}</ActionButton>
        {canWaiveCharge && <ActionButton variant="secondary" icon="minus" onClick={() => onFinish({ chargeSubscription: false })}>Не списывать занятие</ActionButton>}
      </div>
    </ModalFrame>
  );
}
