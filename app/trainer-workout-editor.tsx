import { useEffect, useRef, useState } from 'react';
import {
  cloneWorkout,
  dateKey,
  findAssignmentWorkout,
  getExerciseSetPlans,
  makeId,
  normalizeWorkoutExercise,
  withExerciseSetPlans,
  type Assignment,
  type DemoState,
  type ExerciseDefinition,
  type Student,
  type TrainingFormat,
  type Workout,
  type WorkoutExercise,
} from './reppy-data';
import Icon, { type IconName } from './ui-icon';
import WorkoutScheduleFields from './workout-schedule-fields';
import { ActionButton, FormError, TextField } from './ui-controls';
import { PlanExerciseCard } from './workout-exercise-card';
import { collectExerciseProgress, progressHref, progressKey } from './exercise-progress';
import { subscriptionBalance, subscriptionEntriesFor } from './subscription-ledger';
import ConfirmationModal from './confirmation-modal';
import { go, hashPath, useUnsavedNavigationGuard } from './navigation';
import NotFound from './not-found';
import PageHeader from './route-page-header';
import ReadOnlyExerciseList from './read-only-exercise-list';
import Avatar from './avatar';
import ExerciseInstructionModal from './exercise-instruction-modal';
import { ExerciseActionsModal, ExercisePicker, type ExercisePickerChoice } from './exercise-picker';
import { assignmentScheduleLabel, formatScheduleDay } from './schedule-display';
import { exerciseMetadata, subscriptionBalanceLabel, subscriptionTone } from './workout-display';
import {
  clearUiDraft,
  clearWorkoutComposerDraft,
  loadUiDraft,
  loadWorkoutComposerDraft,
  loadWorkoutPicker,
  saveUiDraft,
  saveWorkoutComposerDraft,
  saveWorkoutPicker,
} from './ui-persistence';

function findStudent(data: DemoState, id: string) {
  return data.students.find((student) => student.id === id);
}

type WorkoutComposerValue = {
  name: string;
  scheduledFor?: string;
  scheduledTime?: string;
  format: TrainingFormat;
  exercises: WorkoutExercise[];
};

function TrainingFormatField({ value, onChange }: { value: TrainingFormat; onChange: (value: TrainingFormat) => void }) {
  return (
    <fieldset className="training-format-field">
      <legend>Формат</legend>
      <div>
        <button type="button" className={value === 'in-person' ? 'selected' : ''} aria-pressed={value === 'in-person'} onClick={() => onChange('in-person')}>Очно</button>
        <button type="button" className={value === 'online' ? 'selected' : ''} aria-pressed={value === 'online'} onClick={() => onChange('online')}>Онлайн</button>
      </div>
      {value === 'online' && <p>Ученик выполнит тренировку самостоятельно в удобное время.</p>}
    </fieldset>
  );
}

type WorkoutComposerDangerAction = {
  label: string;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
};

function WorkoutComposer({
  title,
  eyebrow,
  backPath,
  student,
  workoutLabel,
  initialName,
  nameEditable = false,
  nameInputId = 'workout-name',
  nameAutoFocus = false,
  initialScheduledFor,
  initialScheduledTime,
  initialFormat = 'in-person',
  dateLabel,
  timeLabel,
  contextClassName,
  largeStudentAvatar = false,
  initialExercises,
  submitLabel,
  submitIcon,
  submitClassName = 'plan-submit-button',
  disableSubmitUntilReady = true,
  dangerAction,
  customExercises,
  onCreateCustomExercise,
  onSubmit,
}: {
  title: string;
  eyebrow: string;
  backPath: string;
  student: Student;
  workoutLabel?: string;
  initialName: string;
  nameEditable?: boolean;
  nameInputId?: string;
  nameAutoFocus?: boolean;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  dateLabel?: string;
  timeLabel?: string;
  contextClassName?: string;
  largeStudentAvatar?: boolean;
  initialExercises: WorkoutExercise[];
  submitLabel: string;
  submitIcon: IconName;
  submitClassName?: string;
  disableSubmitUntilReady?: boolean;
  dangerAction?: WorkoutComposerDangerAction;
  customExercises: ExerciseDefinition[];
  onCreateCustomExercise: (definition: ExerciseDefinition) => void;
  onSubmit: (value: WorkoutComposerValue) => void;
}) {
  const hasSchedule = initialScheduledFor !== undefined;
  const draftKey = hashPath();
  const baseline = JSON.stringify({ name: initialName, scheduledFor: initialScheduledFor, scheduledTime: initialScheduledTime, format: initialFormat, exercises: initialExercises });
  const [restoredDraft] = useState(() => loadWorkoutComposerDraft(draftKey, baseline));
  const [name, setName] = useState(restoredDraft?.name ?? initialName);
  const [scheduledFor, setScheduledFor] = useState(restoredDraft?.scheduledFor ?? initialScheduledFor);
  const [scheduledTime, setScheduledTime] = useState(restoredDraft?.scheduledTime ?? initialScheduledTime);
  const [format, setFormat] = useState<TrainingFormat>(restoredDraft?.format ?? initialFormat);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(() => (restoredDraft?.exercises ?? initialExercises).map((exercise) => ({ ...exercise })));
  const [error, setError] = useState('');
  const [dangerOpen, setDangerOpen] = useState(false);
  const [initialFormState] = useState(baseline);
  const currentFormState = JSON.stringify({ name, scheduledFor, scheduledTime, format, exercises });
  const isDirty = currentFormState !== initialFormState;
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(isDirty, () => clearWorkoutComposerDraft(draftKey));
  const ready = Boolean(name.trim() && exercises.length && (!hasSchedule || (scheduledFor && (format === 'online' || scheduledTime))));

  useEffect(() => {
    if (isDirty) {
      saveWorkoutComposerDraft(draftKey, initialFormState, { name, scheduledFor, scheduledTime, format, exercises });
    } else {
      clearWorkoutComposerDraft(draftKey);
    }
  }, [draftKey, exercises, format, initialFormState, isDirty, name, scheduledFor, scheduledTime]);

  const clearError = () => setError('');
  const submit = () => {
    if (!name.trim()) return setError('Добавь название тренировки.');
    if (hasSchedule && !scheduledFor) return setError('Укажи рекомендованную дату тренировки.');
    if (hasSchedule && format === 'in-person' && !scheduledTime) return setError('Укажи дату и время тренировки.');
    if (!exercises.length) return setError('Добавь хотя бы одно упражнение.');
    clearWorkoutComposerDraft(draftKey);
    allowNextNavigation();
    onSubmit({
      name: name.trim(),
      scheduledFor,
      scheduledTime: format === 'online' ? undefined : scheduledTime,
      format,
      exercises: exercises.map((exercise) => ({ ...exercise })),
    });
  };

  const nameField = nameEditable ? <TextField id={nameInputId} label="Название тренировки" value={name} onChange={(event) => { setName(event.target.value); clearError(); }} placeholder="Например, Грудь + плечи" autoFocus={nameAutoFocus} /> : null;

  return (
    <main className="content-page narrow-page" data-workout-composer>
      <PageHeader back={backPath} eyebrow={eyebrow} title={title} />
      <section className={`plan-context-card ${contextClassName ?? 'assignment-edit-card'}`}>
        <div className="assignment-edit-person"><Avatar student={student} large={largeStudentAvatar} /><div><span>УЧЕНИК</span><strong>{student.name}</strong>{workoutLabel && <p>{workoutLabel}</p>}</div></div>
        {nameField}
        {hasSchedule && <TrainingFormatField value={format} onChange={(value) => { setFormat(value); clearError(); }} />}
        {hasSchedule && <WorkoutScheduleFields dateLabel={format === 'online' ? 'Рекомендованная дата' : dateLabel} timeLabel={timeLabel} scheduledFor={scheduledFor ?? ''} scheduledTime={scheduledTime} showTime={format === 'in-person'} onDateChange={(value) => { setScheduledFor(value); clearError(); }} onTimeChange={(value) => { setScheduledTime(value); clearError(); }} />}
      </section>
      <WorkoutExerciseEditor persistenceKey={draftKey} studentId={student.id} exercises={exercises} customExercises={customExercises} onCreateCustomExercise={onCreateCustomExercise} onChange={(next) => { setExercises(next); clearError(); }} />
      {error && <FormError>{error}</FormError>}
      {dangerAction && <ActionButton variant="danger" icon="trash" className="plan-delete-button" onClick={() => setDangerOpen(true)}>{dangerAction.label}</ActionButton>}
      <div className="plan-submit-actions"><ActionButton icon={submitIcon} className={submitClassName} disabled={disableSubmitUntilReady && !ready} onClick={submit}>{submitLabel}</ActionButton></div>
      {dangerOpen && dangerAction && <ConfirmationModal
        title={dangerAction.title}
        text={dangerAction.text}
        confirmLabel={dangerAction.confirmLabel}
        danger
        onClose={() => setDangerOpen(false)}
        onConfirm={() => {
          clearWorkoutComposerDraft(draftKey);
          allowNextNavigation();
          setDangerOpen(false);
          dangerAction.onConfirm();
        }}
      />}
      {discardPrompt}
    </main>
  );
}

export function AssignWorkoutToStudent({
  student,
  workout,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
  initialFormat = 'in-person',
  backPath,
  title = 'НАЗНАЧИТЬ ТРЕНИРОВКУ',
  submitLabel,
  submitIcon = 'plus',
  customExercises,
  onCreateCustomExercise,
  onAssign,
}: {
  student: Student;
  workout: Workout;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  backPath?: string;
  title?: string;
  submitLabel?: string;
  submitIcon?: IconName;
  customExercises: ExerciseDefinition[];
  onCreateCustomExercise: (definition: ExerciseDefinition) => void;
  onAssign: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workoutSnapshot: Workout) => void;
}) {
  return (
    <WorkoutComposer
      title={title}
      eyebrow={student.name}
      backPath={backPath ?? `/trainer/clients/${student.id}/assign`}
      student={student}
      workoutLabel={workout.name}
      initialName={workout.name}
      initialScheduledFor={initialScheduledFor}
      initialScheduledTime={initialScheduledTime}
      initialFormat={initialFormat}
      initialExercises={workout.exercises}
      submitLabel={submitLabel ?? `Назначить ${student.name}`}
      submitIcon={submitIcon}
      customExercises={customExercises}
      onCreateCustomExercise={onCreateCustomExercise}
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => onAssign(scheduledFor!, scheduledTime, format, {
        ...cloneWorkout(workout),
        exercises,
        updatedAt: new Date().toISOString(),
      })}
    />
  );
}

export function NewAssignmentForStudent({
  student,
  initialScheduledFor = dateKey(),
  initialScheduledTime = '18:00',
  initialFormat = 'in-person',
  backPath,
  customExercises,
  onCreateCustomExercise,
  onAssign,
}: {
  student: Student;
  initialScheduledFor?: string;
  initialScheduledTime?: string;
  initialFormat?: TrainingFormat;
  backPath: string;
  customExercises: ExerciseDefinition[];
  onCreateCustomExercise: (definition: ExerciseDefinition) => void;
  onAssign: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workoutSnapshot: Workout) => void;
}) {
  return (
    <WorkoutComposer
      title="СОЗДАТЬ ТРЕНИРОВКУ"
      eyebrow={student.name}
      backPath={backPath}
      student={student}
      initialName=""
      nameEditable
      nameInputId="new-assignment-name"
      nameAutoFocus
      initialScheduledFor={initialScheduledFor}
      initialScheduledTime={initialScheduledTime}
      initialFormat={initialFormat}
      contextClassName="assignment-edit-card new-assignment-card"
      initialExercises={[]}
      submitLabel="Назначить тренировку"
      submitIcon="plus"
      customExercises={customExercises}
      onCreateCustomExercise={onCreateCustomExercise}
      onSubmit={({ name, scheduledFor, scheduledTime, format, exercises }) => onAssign(scheduledFor!, scheduledTime, format, {
        id: makeId('workout'),
        name,
        exercises,
        createdAt: new Date().toISOString(),
      })}
    />
  );
}

function WorkoutExerciseEditor({
  persistenceKey,
  studentId,
  exercises,
  customExercises,
  onCreateCustomExercise,
  onChange,
  minSetsByExerciseId = {},
}: {
  persistenceKey: string;
  studentId: string;
  exercises: WorkoutExercise[];
  customExercises: ExerciseDefinition[];
  onCreateCustomExercise: (definition: ExerciseDefinition) => void;
  onChange: (exercises: WorkoutExercise[]) => void;
  minSetsByExerciseId?: Record<string, number>;
}) {
  const [pickerAfterId, setPickerAfterId] = useState<string | 'start' | null>(() => {
    const stored = loadWorkoutPicker(persistenceKey);
    return stored === 'start' || exercises.some((exercise) => exercise.id === stored) ? stored : null;
  });
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(() => {
    const stored = loadUiDraft<{ exerciseId: string }>(`instruction:${persistenceKey}`);
    return exercises.find((exercise) => exercise.id === stored?.exerciseId) ?? null;
  });
  const [actionExerciseId, setActionExerciseId] = useState<string | null>(null);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  useEffect(() => {
    saveWorkoutPicker(persistenceKey, pickerAfterId);
  }, [persistenceKey, pickerAfterId]);

  useEffect(() => {
    if (instructionExercise) saveUiDraft(`instruction:${persistenceKey}`, { exerciseId: instructionExercise.id });
    else clearUiDraft(`instruction:${persistenceKey}`);
  }, [instructionExercise, persistenceKey]);

  const focusExercise = (exerciseId: string) => {
    setRecentlyMovedId(exerciseId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector(`[data-plan-exercise="${exerciseId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setRecentlyMovedId(null), 1000);
  };

  const addExercise = (choice: ExercisePickerChoice) => {
    const loadMode = choice.loadMode ?? (choice.equipment === 'Свой вес' ? 'bodyweight' : 'external');
    const nextExercise = normalizeWorkoutExercise({
      id: makeId('exercise'),
      exerciseId: choice.id,
      name: choice.name,
      primaryMuscle: choice.primaryMuscle,
      equipment: choice.equipment,
      loadMode,
      measureType: choice.measureType ?? 'reps',
      plannedSets: [],
      coachNote: '',
    });
    const next = exercises.map((exercise) => ({ ...exercise }));
    const afterIndex = pickerAfterId === 'start' ? -1 : next.findIndex((exercise) => exercise.id === pickerAfterId);
    next.splice(afterIndex + 1, 0, nextExercise);
    onChange(next);
    setPickerAfterId(nextExercise.id);
    focusExercise(nextExercise.id);
  };

  const updateExercise = (id: string, update: (exercise: WorkoutExercise) => WorkoutExercise) => {
    onChange(exercises.map((exercise) => exercise.id === id ? update(exercise) : exercise));
  };

  const moveExercise = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= exercises.length) return;
    const next = exercises.map((exercise) => ({ ...exercise }));
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
    focusExercise(moved.id);
  };

  const actionExercise = exercises.find((exercise) => exercise.id === actionExerciseId);
  const canRemovePickedExercise = (exerciseId: string) => {
    const item = exercises.findLast((exercise) => exercise.exerciseId === exerciseId);
    return Boolean(item && (minSetsByExerciseId[item.id] ?? 0) === 0);
  };
  const removePickedExercise = (exerciseId: string) => {
    const index = exercises.findLastIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || (minSetsByExerciseId[exercises[index].id] ?? 0) > 0) return;
    onChange(exercises.filter((_, current) => current !== index));
    if (pickerAfterId === exercises[index].id) setPickerAfterId(exercises[index - 1]?.id ?? 'start');
  };
  const actionDeleteDisabledReason = actionExercise && (minSetsByExerciseId[actionExercise.id] ?? 0) > 0
    ? 'Сначала отмени выполненные подходы'
    : undefined;

  return (
    <section className="workout-plan-editor">
      <div className="form-section-heading"><h2>Упражнения</h2></div>
      <button className="floating-exercise-add" type="button" onClick={() => setPickerAfterId(exercises.at(-1)?.id ?? 'start')} aria-label="Добавить упражнение"><Icon name="plus" /></button>
      <div className="active-exercise-list plan-exercise-list">
        {exercises.map((exercise, index) => (
          <PlanExerciseCard
            key={exercise.id}
            exercise={exercise}
            metadata={exerciseMetadata(exercise)}
            index={index}
            totalExercises={exercises.length}
            recentlyMoved={recentlyMovedId === exercise.id}
            onShowInstruction={() => setInstructionExercise(exercise)}
            onShowActions={() => setActionExerciseId(exercise.id)}
            onMoveUp={() => moveExercise(index, index - 1)}
            onMoveDown={() => moveExercise(index, index + 1)}
            onNoteChange={(coachNote) => updateExercise(exercise.id, (current) => ({ ...current, coachNote }))}
            onSetChange={(setIndex, patch) => updateExercise(exercise.id, (current) => {
              const plannedSets = getExerciseSetPlans(current).map((set, currentIndex) => currentIndex === setIndex ? { ...set, ...patch } : set);
              return withExerciseSetPlans(current, plannedSets);
            })}
            onAddSet={() => updateExercise(exercise.id, (current) => {
              const plannedSets = getExerciseSetPlans(current);
              plannedSets.push({ ...(plannedSets.at(-1) ?? { targetReps: current.measureType === 'duration' ? 30 : 10, targetWeight: current.loadMode === 'bodyweight' ? 0 : 20 }) });
              return withExerciseSetPlans(current, plannedSets);
            })}
            canRemoveSet={getExerciseSetPlans(exercise).length > (minSetsByExerciseId[exercise.id] ?? 0)}
            onRemoveSet={() => updateExercise(exercise.id, (current) => withExerciseSetPlans(current, getExerciseSetPlans(current).slice(0, -1)))}
          />
        ))}
      </div>

      {pickerAfterId && <ExercisePicker persistenceKey={`picker:${persistenceKey}`} exercises={exercises} customExercises={customExercises} onCreateCustom={onCreateCustomExercise} onClose={() => setPickerAfterId(null)} onSelect={addExercise} onRemove={removePickedExercise} canRemove={canRemovePickedExercise} />}
      {instructionExercise && <ExerciseInstructionModal
        exercise={instructionExercise}
        studentId={studentId}
        editable
        persistenceKey={`instruction:${persistenceKey}:${instructionExercise.id}`}
        onClose={() => setInstructionExercise(null)}
        onSave={(patch) => updateExercise(instructionExercise.id, (current) => ({ ...current, ...patch }))}
      />}
      {actionExercise && <ExerciseActionsModal
        exercise={actionExercise}
        deleteDisabledReason={actionDeleteDisabledReason}
        onClose={() => setActionExerciseId(null)}
        onDeleteExercise={() => {
          setActionExerciseId(null);
          onChange(exercises.filter((item) => item.id !== actionExercise.id));
        }}
      />}
    </section>
  );
}

export function AssignmentDetails({
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
  const activeSession = data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
  const balance = subscriptionBalance(data.subscriptionEntries, assignment.studentId);
  const hasSubscription = subscriptionEntriesFor(data.subscriptionEntries, assignment.studentId).length > 0;
  const progressKeys = new Set(collectExerciseProgress(data.sessions, assignment.studentId).map((group) => group.key));
  if (!student || !workout) return <NotFound />;
  return (
    <main className="content-page narrow-page">
      <PageHeader back={`/trainer/clients/${student.id}`} eyebrow={`${student.name} · ${assignmentScheduleLabel(assignment)}`} preserveEyebrowCase title={workout.name.toUpperCase()} />
      {assignment.format === 'in-person' && assignment.rescheduleRequest && <section className="reschedule-request-card">
        <div><span>ЗАПРОС НА ПЕРЕНОС</span><h2>{student.name} предлагает другое время</h2><p><strong>{formatScheduleDay(assignment.rescheduleRequest.scheduledFor)}</strong><time>{assignment.rescheduleRequest.scheduledTime}</time></p></div>
        <div className="reschedule-request-actions"><ActionButton variant="secondary" icon="close" onClick={onDeclineRequest}>Отклонить</ActionButton><ActionButton icon="check" onClick={onAcceptRequest}>Подтвердить</ActionButton></div>
      </section>}
      {(balance <= 2 || !hasSubscription) && <section className={`subscription-warning ${subscriptionTone(balance, hasSubscription)}`}>
        <Icon name={balance <= 0 || !hasSubscription ? 'minus' : 'history'} />
        <div><strong>{subscriptionBalanceLabel(balance, hasSubscription)}</strong><small>Тренировку можно провести без ограничения.</small></div>
        <button type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>{hasSubscription ? 'Продлить' : 'Добавить'}</button>
      </section>}
      <div className="assignment-detail-actions">
        {assignment.status === 'assigned' && assignment.format === 'in-person' && <ActionButton className="assignment-start-button" icon="workout" onClick={() => go(`/trainer/workout/${assignment.id}`)}>{activeSession ? 'Продолжить тренировку' : 'Начать тренировку'}</ActionButton>}
        {assignment.status === 'assigned' && <ActionButton variant="secondary" icon="edit" onClick={() => go(`/trainer/assignments/${assignment.id}/edit`)}>Редактировать</ActionButton>}
        <ActionButton variant="secondary" icon="copy" onClick={() => go(`/trainer/assignments/${assignment.id}/repeat`)}>Повторить на другую дату</ActionButton>
      </div>
      <div className="section-heading workout-plan-heading"><h2>Упражнения</h2></div>
      <ReadOnlyExerciseList workout={workout} onProgress={(exercise) => progressKeys.has(progressKey(exercise)) ? () => go(progressHref(student.id, exercise)) : undefined} />
    </main>
  );
}

export function RepeatAssignment({
  data,
  assignment,
  sourceWorkout,
  onCreateCustomExercise,
  onSave,
}: {
  data: DemoState;
  assignment: Assignment;
  sourceWorkout: Workout;
  onCreateCustomExercise: (definition: ExerciseDefinition) => void;
  onSave: (scheduledFor: string, scheduledTime: string | undefined, format: TrainingFormat, workout: Workout) => void;
}) {
  const student = findStudent(data, assignment.studentId);
  if (!student) return <NotFound />;

  return (
    <WorkoutComposer
      title="ПОВТОРИТЬ ТРЕНИРОВКУ"
      eyebrow={student.name}
      backPath={`/trainer/assignments/${assignment.id}`}
      student={student}
      workoutLabel={sourceWorkout.name}
      initialName={sourceWorkout.name}
      initialScheduledFor={dateKey()}
      initialScheduledTime={assignment.scheduledTime}
      initialFormat={assignment.format}
      dateLabel="Новая дата"
      contextClassName="repeat-assignment-form"
      largeStudentAvatar
      initialExercises={sourceWorkout.exercises}
      submitLabel="Назначить тренировку"
      submitIcon="plus"
      customExercises={data.customExercises}
      onCreateCustomExercise={onCreateCustomExercise}
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => onSave(scheduledFor!, scheduledTime, format, { ...cloneWorkout(sourceWorkout), exercises })}
    />
  );
}


export function EditAssignment({ data, assignment, onCreateCustomExercise, onSave, onDelete }: { data: DemoState; assignment: Assignment; onCreateCustomExercise: (definition: ExerciseDefinition) => void; onSave: (assignment: Assignment) => void; onDelete: (assignment: Assignment) => void }) {
  const student = findStudent(data, assignment.studentId);
  const workout = findAssignmentWorkout(data, assignment);
  if (!student || !workout) return <NotFound />;

  return (
    <WorkoutComposer
      title="РЕДАКТИРОВАТЬ ТРЕНИРОВКУ"
      eyebrow={`${student.name} · ${workout.name}`}
      backPath={`/trainer/assignments/${assignment.id}`}
      student={student}
      workoutLabel={workout.name}
      initialName={workout.name}
      initialScheduledFor={assignment.scheduledFor}
      initialScheduledTime={assignment.scheduledTime}
      initialFormat={assignment.format}
      initialExercises={assignment.workoutSnapshot.exercises}
      submitLabel="Сохранить изменения"
      submitIcon="check"
      submitClassName=""
      customExercises={data.customExercises}
      onCreateCustomExercise={onCreateCustomExercise}
      dangerAction={{
        label: 'Удалить назначение',
        title: 'Удалить тренировку?',
        text: `«${workout.name}» исчезнет из расписания ${student.name}.`,
        confirmLabel: 'Удалить тренировку',
        onConfirm: () => onDelete(assignment),
      }}
      onSubmit={({ scheduledFor, scheduledTime, format, exercises }) => {
        const exercisesChanged = JSON.stringify(exercises) !== JSON.stringify(workout.exercises);
        onSave({
          ...assignment,
          scheduledFor: scheduledFor!,
          scheduledTime,
          format,
          rescheduleRequest: format === 'online' ? undefined : assignment.rescheduleRequest,
          workoutSnapshot: exercisesChanged ? {
            ...cloneWorkout(workout),
            exercises,
            updatedAt: new Date().toISOString(),
          } : cloneWorkout(workout),
        });
      }}
    />
  );
}
