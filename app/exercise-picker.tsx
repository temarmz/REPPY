import { Box, Inline, Strong, Small, Section, Emphasis, Paragraph, Footer } from './ui/elements';
import { useEffect, useState } from 'react';
import { exerciseLibrary, exerciseMuscleGroups, makeId, muscleGroups, type ExerciseDefinition, type MuscleGroup, type WorkoutExercise } from './reppy-data';
import Icon from './ui/icon';
import ModalFrame from './ui/modal-frame';
import { ActionButton, Button, Input } from './ui/controls';
import { loadExercisePickerDraft, saveUiDraft } from './ui-persistence';

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
}: {
  exercise: WorkoutExercise;
  deleteDisabledReason?: string;
  onClose: () => void;
  onDeleteExercise: () => void;
}) {
  return (
    <ModalFrame title={exercise.name} className="exercise-actions-sheet" ariaLabel={'Действия — ' + exercise.name} closeLabel="Закрыть действия" onClose={onClose}>
      <Box className="exercise-action-list">
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
}) {
  const draftKey = persistenceKey ?? 'picker';
  const [restoredDraft] = useState(() => loadExercisePickerDraft(draftKey));
  const [search, setSearch] = useState(restoredDraft?.search ?? '');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>(restoredDraft?.selectedMuscle ?? 'all');
  const [customLoadMode, setCustomLoadMode] = useState<'external' | 'bodyweight'>(restoredDraft?.customLoadMode ?? 'external');
  const [customMeasureType, setCustomMeasureType] = useState<'reps' | 'duration'>(restoredDraft?.customMeasureType ?? 'reps');
  const [customMuscleGroups, setCustomMuscleGroups] = useState<MuscleGroup[]>(restoredDraft?.customMuscleGroups ?? []);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);

  useEffect(() => {
    saveUiDraft(draftKey, { search, selectedMuscle, customLoadMode, customMeasureType, customMuscleGroups });
  }, [customLoadMode, customMeasureType, customMuscleGroups, draftKey, search, selectedMuscle]);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = search.trim();
  const availableExercises = [...customExercises, ...exerciseLibrary];
  const editingExercise = customExercises.find((exercise) => exercise.id === editingExerciseId);
  const duplicateName = availableExercises.some((exercise) => exercise.id !== editingExerciseId && exercise.name.trim().toLocaleLowerCase('ru') === normalizedSearch);
  const canCreateCustom = Boolean(onCreateCustom) && !editingExercise && customName.length >= 2 && !duplicateName;
  const showCustomBuilder = Boolean(editingExercise) || canCreateCustom;
  const canSaveCustom = customName.length >= 2 && customMuscleGroups.length > 0 && !duplicateName;

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
    if (!canSaveCustom) return;
    const definition: ExerciseDefinition = {
      id: editingExercise?.id ?? makeId('custom-exercise'),
      name: customName,
      primaryMuscle: customMuscleGroups[0],
      muscleGroups: customMuscleGroups,
      equipment: customLoadMode === 'bodyweight' ? 'Свой вес' : 'Другое',
      loadMode: customLoadMode,
      measureType: customMeasureType,
    };
    if (editingExercise) {
      onUpdateCustom?.(definition);
      setEditingExerciseId(null);
      setSearch('');
    } else if (onCreateCustom) {
      onCreateCustom(definition);
      selectExercise(definition, true);
    }
    setCustomMuscleGroups([]);
  };
  const editCustomExercise = (exercise: ExerciseDefinition) => {
    setEditingExerciseId(exercise.id);
    setSearch(exercise.name);
    setCustomMuscleGroups(exerciseMuscleGroups(exercise));
    setCustomLoadMode(exercise.loadMode ?? (exercise.equipment === 'Свой вес' ? 'bodyweight' : 'external'));
    setCustomMeasureType(exercise.measureType ?? 'reps');
  };
  const toggleCustomMuscle = (muscle: MuscleGroup) => {
    setCustomMuscleGroups((current) => current.includes(muscle)
      ? current.filter((item) => item !== muscle)
      : [...current, muscle]);
  };
  const updateSearch = (value: string) => {
    if (!editingExercise && customName.length < 2 && value.trim().length >= 2 && selectedMuscle !== 'all' && !customMuscleGroups.length) {
      setCustomMuscleGroups([selectedMuscle]);
    }
    setSearch(value);
  };

  return (
    <ModalFrame title="Добавить упражнения" className="exercise-picker-sheet" ariaLabel="Добавить упражнения" onClose={onClose}>
      <Input className="text-input search-input" type="search" aria-label="Поиск упражнений" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
      <Box className="muscle-filter" aria-label="Фильтр по группе мышц">
        <Button className={selectedMuscle === 'all' ? 'selected' : ''} type="button" onClick={() => setSelectedMuscle('all')} aria-pressed={selectedMuscle === 'all'}>Все</Button>
        {muscleGroups.map((muscle) => <Button className={selectedMuscle === muscle ? 'selected' : ''} key={muscle} type="button" onClick={() => setSelectedMuscle(muscle)} aria-pressed={selectedMuscle === muscle}>{muscle}</Button>)}
      </Box>
      <Box className="picker-list">
        {showCustomBuilder && <Section className="custom-exercise-builder">
          <Box><Strong>{editingExercise ? `Редактирование «${editingExercise.name}»` : `Новое упражнение «${customName}»`}</Strong><Small>Выбери все группы мышц, которые участвуют в упражнении</Small></Box>
          <Box className="custom-muscle-groups" role="group" aria-label="Группы мышц упражнения">
            {muscleGroups.map((muscle) => <Button className={customMuscleGroups.includes(muscle) ? 'selected' : ''} key={muscle} type="button" onClick={() => toggleCustomMuscle(muscle)} aria-pressed={customMuscleGroups.includes(muscle)}>{muscle}</Button>)}
          </Box>
          {!customMuscleGroups.length && <Small className="custom-exercise-hint">Выбери хотя бы одну группу мышц</Small>}
          <Box className="custom-load-mode" aria-label="Тип нагрузки">
            <Button className={customLoadMode === 'external' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('external')} aria-pressed={customLoadMode === 'external'}>С весом</Button>
            <Button className={customLoadMode === 'bodyweight' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('bodyweight')} aria-pressed={customLoadMode === 'bodyweight'}>Свой вес</Button>
          </Box>
          <Box className="custom-load-mode" aria-label="Способ измерения">
            <Button className={customMeasureType === 'reps' ? 'selected' : ''} type="button" onClick={() => setCustomMeasureType('reps')} aria-pressed={customMeasureType === 'reps'}>Повторы</Button>
            <Button className={customMeasureType === 'duration' ? 'selected' : ''} type="button" onClick={() => { setCustomMeasureType('duration'); setCustomLoadMode('bodyweight'); }} aria-pressed={customMeasureType === 'duration'}>Секунды</Button>
          </Box>
          <Button className="custom-exercise-option" type="button" disabled={!canSaveCustom} onClick={saveCustomExercise}><Icon name={editingExercise ? 'check' : 'plus'} /> {editingExercise ? 'Сохранить изменения' : `Сохранить и добавить «${customName}»`}</Button>
        </Section>}
        {filtered.map((exercise) => {
          const count = exercises.filter((item) => item.exerciseId === exercise.id).length;
          const isCustom = customExercises.some((item) => item.id === exercise.id);
          const groups = exerciseMuscleGroups(exercise);
          return <Box className="picker-exercise-row" key={exercise.id}>
            <Box><Strong>{exercise.name}{isCustom && <Emphasis className="personal-exercise-label">Моё</Emphasis>}</Strong><Small>{groups.length ? groups.join(', ') : 'Другое'} · {exercise.equipment}</Small></Box>
            <Box className="picker-row-actions">
              {isCustom && onUpdateCustom && <Button className="picker-edit-exercise" type="button" onClick={() => editCustomExercise(exercise)} aria-label={`Редактировать ${exercise.name}`}><Icon name="edit" /></Button>}
              <Box className="picker-quantity" role="group" aria-label={exercise.name}>
                <Button type="button" disabled={!canRemove(exercise.id)} onClick={() => onRemove(exercise.id)} aria-label={`Убрать ${exercise.name}`}><Icon name="minus" /></Button>
                <Inline aria-live="polite">{count}</Inline>
                <Button type="button" onClick={() => selectExercise(exercise)} aria-label={`Добавить ${exercise.name}`}><Icon name="plus" /></Button>
              </Box>
            </Box>
          </Box>;
        })}
        {!filtered.length && !canCreateCustom && <Paragraph className="picker-empty">Ничего не найдено. Введи хотя бы два символа, чтобы добавить своё упражнение.</Paragraph>}
      </Box>
      <Footer className="picker-footer"><Inline aria-live="polite">В тренировке: {exercises.length}</Inline><ActionButton icon="check" onClick={onClose}>Готово</ActionButton></Footer>
    </ModalFrame>
  );
}
