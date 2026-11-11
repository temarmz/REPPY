import ExerciseOrderEditor from './ui/exercise-order-editor';
import { Badge } from './ui/patterns';
import { Page, Box, Header, Inline, Strong, Time, Section, PageTitle, Footer, Image } from './ui/elements';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  cloneWorkout,
  formatCalendarDay,
  getExerciseSetPlans,
  makeId,
  normalizeWorkoutExercise,
  withExerciseSetPlans,
  type SetResult,
  type MoodRating,
  type ExerciseDefinition,
  type Student,
  type TrainingFormat,
  type Workout,
  type WorkoutExercise,
  type WorkoutSetPlan,
  type WorkoutSession,
} from './reppy-data';
import Icon from './ui/icon';
import { UI_ASSETS } from './ui/assets';
import { MOODS } from './mood';
import { SelectOption } from './ui/elements';
import { Field } from './ui/patterns';
import { ActiveExerciseCard } from './ui/workout-exercise-card';
import ModalFrame from './ui/modal-frame';
import { ActionButton, Button, Select, Textarea, TextField, Switch } from './ui/controls';
import ExerciseInstructionModal from './ui/exercise-instruction-modal';
import { ExerciseActionsModal, ExercisePicker, type ExercisePickerChoice } from './exercise-picker';
import { goBack, useRoutePath } from './navigation';
import { LoadingScreen } from './onboarding-screens';
import { PersistencePhaseContext } from './ui/app-status';
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
} from './workout-display';

type WorkoutFinishOptions = {
  chargeSubscription: boolean;
  mood?: MoodRating;
  comment?: string;
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
  editingHistory = false,
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
  editingHistory?: boolean;
  balance?: number;
  customExercises?: ExerciseDefinition[];
  onCreateCustomExercise?: (definition: ExerciseDefinition) => void;
  onUpdateCustomExercise?: (definition: ExerciseDefinition) => void;
}) {
  const pickerPersistenceKey = `active:${useRoutePath()}`;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [pickerAfterId, setPickerAfterId] = useState<string | null>(() => {
    const stored = loadWorkoutPicker(pickerPersistenceKey);
    return stored && stored !== 'start' && workout.exercises.some((exercise) => exercise.id === stored) ? stored : null;
  });
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(() => {
    const stored = loadUiDraft(`instruction:${pickerPersistenceKey}`);
    return workout.exercises.find((exercise) => exercise.id === stored?.exerciseId) ?? null;
  });
  const [orderOpen, setOrderOpen] = useState(false);
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const persistencePhase = useContext(PersistencePhaseContext);
  const saveState = persistencePhase === 'error' ? 'error' : persistencePhase === 'idle' ? 'saved' : 'saving';
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

  const elapsed = formatElapsedTime(session.startedAt, editingHistory && session.completedAt ? new Date(session.completedAt).getTime() : currentTime);

  const updateWorkout = (exercises: WorkoutExercise[]) => {
    if (!exercises.length) return;
    onWorkoutUpdate(session.id, { ...cloneWorkout(workout), exercises });
  };

  const updateExerciseNote = (exerciseId: string, coachNote: string) => {
    if (workout.exercises.find((exercise) => exercise.id === exerciseId)?.coachNote === coachNote) return;
    updateWorkout(workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, coachNote } : exercise));
  };

  const updateExerciseSets = (exerciseId: string, update: (plans: WorkoutSetPlan[]) => WorkoutSetPlan[]) => {
    updateWorkout(workout.exercises.map((exercise) => {
      const plans = session.results
        .filter((result) => result.exerciseId === exercise.id)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((result) => getExerciseSetPlans(exercise)[result.setNumber - 1] ?? { targetReps: 0, targetWeight: 0 });
      return withExerciseSetPlans(exercise, exercise.id === exerciseId ? update(plans) : plans);
    }));
  };

  const updateResult = (exerciseId: string, setNumber: number, patch: Partial<SetResult>) => {
    const current = session.results.find((result) => result.exerciseId === exerciseId && result.setNumber === setNumber);
    if (!current || Object.entries(patch).every(([key, value]) => current[key as keyof SetResult] === value)) return;
    onUpdate(session.id, session.results.map((result) => result.exerciseId === exerciseId && result.setNumber === setNumber ? { ...result, ...patch, completed: Boolean(session.completedAt) && (patch.actualReps ?? result.actualReps) > 0 } : result));
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
      plannedSets: [{ targetReps: 0, targetWeight: 0 }],
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
    return Boolean(item && workout.exercises.length > 1);
  };
  const removePickedExercise = (exerciseId: string) => {
    const index = workout.exercises.findLastIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || workout.exercises.length <= 1) return;
    const item = workout.exercises[index];
    updateWorkout(workout.exercises.filter((_, current) => current !== index));
    if (pickerAfterId === item.id) setPickerAfterId(workout.exercises[index - 1]?.id ?? workout.exercises.find((exercise) => exercise.id !== item.id)?.id ?? null);
  };
  const actionDeleteDisabledReason = workout.exercises.length <= 1
      ? 'В тренировке должно остаться хотя бы одно упражнение'
      : undefined;

  return (
    <Page className="active-workout-page active-workout-list-page">
      <Box className="active-sticky-header">
        <Header className="active-header">
          <Button type="button" onClick={() => goBack(backPath)} aria-label="Вернуться назад"><Icon name="chevron-left" /></Button>
          <Box className="active-header-copy"><Inline>{student ? `${student.name} · ${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}` : `${formatCalendarDay(scheduledFor)} · ${format === 'online' ? 'Онлайн' : scheduledTime}`}</Inline><Strong><Badge as="i" className={`save-state ${saveState}`} role="status" aria-live="polite">{saveState === 'error' ? 'Не сохранено' : saveState === 'saving' ? 'Сохраняем…' : 'Сохранено'}</Badge></Strong></Box>
          <Button className="active-header-add" type="button" onClick={() => setPickerAfterId(workout.exercises.at(-1)?.id ?? null)} aria-label="Добавить упражнение"><Icon name="plus" /></Button>
          <Box className="active-timing"><Time dateTime={'PT' + elapsed.elapsedSeconds + 'S'} aria-label={'Прошло ' + elapsed.label}>{elapsed.label}</Time></Box>
        </Header>
      </Box>

      <Section className="active-workout-overview">
        {editingHistory ? <TextField id="correction-workout-name" label="Название тренировки" value={workout.name} onChange={(event) => onWorkoutUpdate(session.id, { ...workout, name: event.target.value })} /> : <PageTitle>{workout.name}</PageTitle>}
      </Section>

      <Section className="active-exercise-list">
        {workout.exercises.map((exercise, index) => {
          const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
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
            onReorder={() => setOrderOpen(true)}
              onAddSet={() => updateExerciseSets(exercise.id, (plans) => { const last = exerciseResults.at(-1); return [...plans, last ? { targetReps: last.actualReps, targetWeight: last.actualWeight } : { targetReps: 0, targetWeight: 0 }]; })}
              canRemoveSet={exerciseResults.length > 0}
              onRemoveSet={() => updateExerciseSets(exercise.id, (plans) => plans.slice(0, -1))}
              onMoveUp={() => moveExercise(index, index - 1)}
              onMoveDown={() => moveExercise(index, index + 1)}
            />
          );
        })}
      </Section>

      {orderOpen && <ExerciseOrderEditor exercises={workout.exercises} onChange={updateWorkout} onClose={() => setOrderOpen(false)} />}
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
        canWaiveCharge={trainerCanWaiveCharge}
        onClose={() => setFinishOpen(false)}
        onFinish={(options) => {
          setFinishOpen(false);
          onFinish(session.id, options);
        }}
      />}

      <Footer className="exercise-navigation single-action">
        <Button className="finish-workout" type="button" disabled={editingHistory && !workout.name.trim()} onClick={() => editingHistory ? onFinish(session.id, { chargeSubscription: false }) : setFinishOpen(true)}><Icon name="check" /> {editingHistory ? 'Сохранить исправления' : 'Завершить тренировку'}</Button>
      </Footer>
    </Page>
  );
}

function FinishWorkoutModal({ canWaiveCharge, onClose, onFinish }: { canWaiveCharge: boolean; onClose: () => void; onFinish: (options: WorkoutFinishOptions) => void }) {
  const [chargeSubscription, setCharge] = useState(true);
  const [mood, setMood] = useState<MoodRating | ''>('');
  const [comment, setComment] = useState('');
  return (
    <ModalFrame title="Завершить тренировку?" className="finish-workout-sheet" ariaLabel="Завершение тренировки" onClose={onClose}>
      <Image className="finish-illustration" src={UI_ASSETS.success} alt="Динозавр показывает большой палец" />
      {canWaiveCharge && <Switch checked={chargeSubscription} onCheckedChange={setCharge}>Списать одно занятие</Switch>}
      <Field label="Как прошла тренировка?"><Select aria-label="Как прошла тренировка?" value={mood} onChange={(event) => setMood(event.target.value as MoodRating | '')}><SelectOption value="">Без оценки</SelectOption>{MOODS.map((item) => <SelectOption key={item.value} value={item.value}>{item.label}</SelectOption>)}</Select></Field>
      <Field label="Комментарий"><Textarea aria-label="Комментарий о тренировке" maxLength={280} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
      <Box className="finish-subscription-actions">
        <ActionButton icon="check" onClick={() => onFinish({ chargeSubscription, mood: mood || undefined, comment })}>Подтвердить завершение</ActionButton>
        <ActionButton variant="secondary" onClick={onClose}>Продолжить тренировку</ActionButton>
      </Box>
    </ModalFrame>
  );
}
