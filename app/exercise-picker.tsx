import { Box, Inline, Strong, Small, Form, Fieldset, Legend, Emphasis, Paragraph, Footer, SelectOption } from './ui/elements';
import { useLayoutEffect, useRef, useState } from 'react';
import { exerciseLibrary, exerciseMuscleGroups, makeId, muscleGroups, type ExerciseDefinition, type MuscleGroup, type WorkoutExercise } from './reppy-data';
import Icon from './ui/icon';
import ModalFrame from './ui/modal-frame';
import { ActionButton, Button, Input, Select, TextField } from './ui/controls';
import { Field } from './ui/patterns';
import { loadExercisePickerDraft, saveUiDraft } from './ui-persistence';
import { exerciseDefinitionError } from './exercise-definition-validation';
import ExerciseModes, { type ExerciseModePatch } from './ui/exercise-modes';

export type ExercisePickerChoice = {
  id: string;
  name: string;
  primaryMuscle?: MuscleGroup;
  muscleGroups?: MuscleGroup[];
  equipment?: string;
  loadMode?: 'external' | 'bodyweight';
  measureType?: 'reps' | 'duration';
};

export function ExerciseActionsModal({
  exercise,
  deleteDisabledReason,
  onClose,
  onDeleteExercise,
  onReplaceExercise,
  onModeChange,
}: {
  exercise: WorkoutExercise;
  deleteDisabledReason?: string;
  onClose: () => void;
  onDeleteExercise: () => void;
  onReplaceExercise: () => void;
  onModeChange?: (patch: ExerciseModePatch) => void;
}) {
  return (
    <ModalFrame title={exercise.name} className="exercise-actions-sheet" ariaLabel={'Действия — ' + exercise.name} closeLabel="Закрыть действия" onClose={onClose}>
      {onModeChange && <ExerciseModes loadMode={exercise.loadMode} measureType={exercise.measureType} onChange={onModeChange} />}
      <Box className="exercise-action-list">
        <Button type="button" onClick={onReplaceExercise}><Icon name="copy" /><Inline><Strong>Заменить упражнение</Strong><Small>Подходы сохранятся</Small></Inline></Button>
        <Button className="danger" type="button" disabled={Boolean(deleteDisabledReason)} onClick={onDeleteExercise}>
          <Icon name="trash" />
          <Inline><Strong>Удалить упражнение</Strong><Small>{deleteDisabledReason ?? 'Упражнение исчезнет из этой тренировки'}</Small></Inline>
        </Button>
      </Box>
    </ModalFrame>
  );
}

export function ExercisePicker({
  persistenceKey,
  exercises,
  customExercises = [],
  onClose,
  onSelect,
  onCreateCustom,
  onUpdateCustom,
  onRemove,
  canRemove,
  singleChoice = false,
}: {
  persistenceKey?: string;
  exercises: WorkoutExercise[];
  customExercises?: ExerciseDefinition[];
  onClose: () => void;
  onSelect: (exercise: ExercisePickerChoice) => void;
  onCreateCustom?: (exercise: ExerciseDefinition) => void;
  onUpdateCustom?: (exercise: ExerciseDefinition) => void;
  onRemove: (exerciseId: string) => void;
  canRemove: (exerciseId: string) => boolean;
  singleChoice?: boolean;
}) {
  const draftKey = persistenceKey ?? 'picker';
  const [restoredDraft] = useState(() => loadExercisePickerDraft(draftKey));
  const [search, setSearch] = useState(restoredDraft?.search ?? '');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>(restoredDraft?.selectedMuscle ?? 'all');
  const [customLoadMode, setCustomLoadMode] = useState<'external' | 'bodyweight'>(restoredDraft?.customLoadMode ?? 'external');
  const [customMeasureType, setCustomMeasureType] = useState<'reps' | 'duration'>(restoredDraft?.customMeasureType ?? 'reps');
  const [customMuscleGroups, setCustomMuscleGroups] = useState<MuscleGroup[]>(restoredDraft?.customMuscleGroups ?? []);
  const [customEquipment, setCustomEquipment] = useState(restoredDraft?.customEquipment ?? '');
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(restoredDraft?.editingExerciseId ?? null);
  const [creatingCustom, setCreatingCustom] = useState(restoredDraft?.creatingCustom ?? false);
  const [newName, setNewName] = useState(restoredDraft?.newName ?? '');

  useLayoutEffect(() => {
    saveUiDraft(draftKey, { search, selectedMuscle, customLoadMode, customMeasureType, customMuscleGroups, customEquipment, editingExerciseId, creatingCustom, newName });
  }, [customLoadMode, customMeasureType, customMuscleGroups, customEquipment, editingExerciseId, creatingCustom, newName, draftKey, search, selectedMuscle]);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = newName.trim();
  const availableExercises = [...customExercises, ...exerciseLibrary];
  const editingExercise = onUpdateCustom && customExercises.find((exercise) => exercise.id === editingExerciseId);
  const showCustomBuilder = Boolean(editingExercise || (onCreateCustom && creatingCustom));
  const customError = exerciseDefinitionError({ id: editingExercise ? editingExercise.id : undefined, name: customName, equipment: customEquipment, muscleGroups: customMuscleGroups }, availableExercises);
  const nameInput = useRef<HTMLInputElement>(null);
  const pickerSearch = useRef<HTMLInputElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const previousBuilder = useRef(showCustomBuilder);
  useLayoutEffect(() => {
    if (previousBuilder.current === showCustomBuilder) return;
    previousBuilder.current = showCustomBuilder;
    const target = showCustomBuilder ? nameInput.current : createButton.current ?? pickerSearch.current;
    const sheet = target?.closest<HTMLElement>('[data-modal-frame]');
    if (sheet) sheet.scrollTop = 0;
    target?.focus({ preventScroll: true });
  }, [showCustomBuilder]);

  const filtered = availableExercises.filter((exercise) => {
    const groups = exerciseMuscleGroups(exercise);
    const matchesMuscle = selectedMuscle === 'all' || groups.includes(selectedMuscle);
    const haystack = (exercise.name + ' ' + groups.join(' ') + ' ' + exercise.equipment).toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });
  const selectExercise = (exercise: ExercisePickerChoice, custom = false) => {
    onSelect(exercise);
    if (custom) setSearch('');
  };
  const saveCustomExercise = () => {
    if (customError) return;
    const orderedGroups = muscleGroups.filter((group) => customMuscleGroups.includes(group));
    const definition: ExerciseDefinition = {
      id: editingExercise ? editingExercise.id : makeId('custom-exercise'),
      name: customName,
      primaryMuscle: orderedGroups[0],
      muscleGroups: orderedGroups,
      equipment: customEquipment.trim() || (customLoadMode === 'bodyweight' ? 'Свой вес' : 'Другое'),
      loadMode: customLoadMode,
      measureType: customMeasureType,
    };
    if (editingExercise) {
      onUpdateCustom?.(definition);
    } else if (onCreateCustom) {
      onCreateCustom(definition);
      selectExercise(definition, true);
    }
    resetCustomForm();
  };
  const resetCustomForm = () => {
    setEditingExerciseId(null);
    setCreatingCustom(false);
    setNewName('');
    setCustomMuscleGroups([]);
    setCustomEquipment('');
  };
  const startCustomExercise = () => {
    setNewName(search.trim());
    setCustomLoadMode('external');
    setCustomMeasureType('reps');
    setCustomMuscleGroups(selectedMuscle === 'all' ? [] : [selectedMuscle]);
    setCreatingCustom(true);
  };
  const editCustomExercise = (exercise: ExerciseDefinition) => {
    setEditingExerciseId(exercise.id);
    setNewName(exercise.name);
    setCustomEquipment(exercise.equipment);
    setCustomMuscleGroups(exerciseMuscleGroups(exercise));
    setCustomLoadMode(exercise.loadMode ?? (exercise.equipment === 'Свой вес' ? 'bodyweight' : 'external'));
    setCustomMeasureType(exercise.measureType ?? 'reps');
  };
  const toggleCustomMuscle = (muscle: MuscleGroup) => {
    setCustomMuscleGroups((current) => current.includes(muscle)
      ? current.filter((item) => item !== muscle)
      : [...current, muscle]);
  };
  return (
    <ModalFrame
      title={showCustomBuilder ? (editingExercise ? 'Редактирование упражнения' : 'Новое упражнение') : (singleChoice ? 'Заменить упражнение' : 'Добавить упражнения')}
      className={showCustomBuilder ? undefined : 'exercise-picker-sheet'}
      onClose={onClose}
    >
      {showCustomBuilder ? <Form className="custom-exercise-builder" onSubmit={(event) => { event.preventDefault(); saveCustomExercise(); }}>
        <Box><TextField ref={nameInput} data-modal-initial-focus id="custom-exercise-name" label="Название упражнения" placeholder="Например, тяга полотенца" value={newName} onChange={(event) => setNewName(event.target.value)} /></Box>
        <Box><TextField id="custom-exercise-equipment" label="Оборудование" placeholder="Например, гантели" value={customEquipment} onChange={(event) => setCustomEquipment(event.target.value)} /></Box>
        <Fieldset className="custom-muscle-field" aria-label="Группы мышц упражнения">
          <Legend>Мышечные группы</Legend>
          <Box className="custom-muscle-groups">
            {muscleGroups.map((muscle) => <Button className={customMuscleGroups.includes(muscle) ? 'selected' : ''} key={muscle} type="button" onClick={() => toggleCustomMuscle(muscle)} aria-pressed={customMuscleGroups.includes(muscle)}>{muscle}</Button>)}
          </Box>
        </Fieldset>
        <ExerciseModes loadMode={customLoadMode} measureType={customMeasureType} onChange={(patch) => { if (patch.loadMode) setCustomLoadMode(patch.loadMode); if (patch.measureType) setCustomMeasureType(patch.measureType); }} />
        {customError && <Small className="custom-exercise-hint" role="status">{customError}</Small>}
        <ActionButton type="submit" disabled={Boolean(customError)}>{editingExercise ? 'Сохранить изменения' : 'Сохранить и добавить'}</ActionButton>
        <ActionButton variant="secondary" onClick={resetCustomForm}>К выбору упражнений</ActionButton>
      </Form> : <>
        <Input ref={pickerSearch} className="text-input search-input" type="search" aria-label="Поиск упражнений" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
        <Field label="Мышечная группа"><Select aria-label="Мышечная группа" value={selectedMuscle} onChange={(event) => setSelectedMuscle(event.target.value as typeof selectedMuscle)}><SelectOption value="all">Все</SelectOption>{muscleGroups.map((muscle) => <SelectOption key={muscle} value={muscle}>{muscle}</SelectOption>)}</Select></Field>
        {onCreateCustom && <ActionButton variant="secondary" icon="plus" ref={createButton} onClick={startCustomExercise}>Создать своё упражнение</ActionButton>}
        <Box className="picker-list">
          {filtered.map((exercise) => {
            const count = exercises.filter((item) => item.exerciseId === exercise.id).length;
            const isCustom = customExercises.some((item) => item.id === exercise.id);
            const groups = exerciseMuscleGroups(exercise);
            return <Box className={'picker-exercise-row' + (count > 0 ? ' added' : '')} key={exercise.id}>
              <Box><Strong>{exercise.name}{isCustom && <Emphasis className="personal-exercise-label">Моё</Emphasis>}</Strong><Small>{groups.length ? groups.join(', ') : 'Другое'} · {exercise.equipment}</Small></Box>
              <Box className="picker-row-actions">
                {isCustom && onUpdateCustom && <Button className="picker-edit-exercise" type="button" onClick={() => editCustomExercise(exercise)} aria-label={`Редактировать ${exercise.name}`}><Icon name="edit" /></Button>}
                {singleChoice ? <ActionButton variant="secondary" onClick={() => selectExercise(exercise)}>Выбрать</ActionButton> : <Box className="picker-quantity" role="group" aria-label={exercise.name}>
                  <Button type="button" disabled={!canRemove(exercise.id)} onClick={() => onRemove(exercise.id)} aria-label={`Убрать ${exercise.name}`}><Icon name="minus" /></Button>
                  <Inline aria-live="polite">{count}</Inline>
                  <Button type="button" onClick={() => selectExercise(exercise)} aria-label={`Добавить ${exercise.name}`}><Icon name="plus" /></Button>
                </Box>}
              </Box>
            </Box>;
          })}
          {!filtered.length && <Paragraph className="picker-empty">Ничего не найдено. Измени поиск или выбери другую мышечную группу.</Paragraph>}
        </Box>
        <Footer className="picker-footer"><Inline aria-live="polite">В тренировке: {exercises.length}</Inline><ActionButton icon="check" onClick={onClose}>Готово</ActionButton></Footer>
      </>}
    </ModalFrame>
  );
}
