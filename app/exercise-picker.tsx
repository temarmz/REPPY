import { useEffect, useState } from 'react';
import { exerciseLibrary, makeId, muscleGroups, type ExerciseDefinition, type MuscleGroup, type WorkoutExercise } from './reppy-data';
import Icon from './ui-icon';
import ModalFrame from './modal-frame';
import { ActionButton } from './ui-controls';
import { loadUiDraft, saveUiDraft } from './ui-persistence';

export type ExercisePickerChoice = {
  id: string;
  name: string;
  primaryMuscle?: MuscleGroup;
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
      <div className="exercise-action-list">
        <button className="danger" type="button" disabled={Boolean(deleteDisabledReason)} onClick={onDeleteExercise}>
          <Icon name="trash" />
          <span><strong>Удалить упражнение</strong><small>{deleteDisabledReason ?? 'Упражнение исчезнет из этой тренировки'}</small></span>
        </button>
      </div>
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
  onRemove,
  canRemove,
}: {
  persistenceKey?: string;
  exercises: WorkoutExercise[];
  customExercises?: ExerciseDefinition[];
  onClose: () => void;
  onSelect: (exercise: ExercisePickerChoice) => void;
  onCreateCustom?: (exercise: ExerciseDefinition) => void;
  onRemove: (exerciseId: string) => void;
  canRemove: (exerciseId: string) => boolean;
}) {
  const draftKey = persistenceKey ?? 'picker';
  const [restoredDraft] = useState(() => loadUiDraft<{
    search: string;
    selectedMuscle: 'all' | MuscleGroup;
    customLoadMode: 'external' | 'bodyweight';
    customMeasureType: 'reps' | 'duration';
  }>(draftKey));
  const [search, setSearch] = useState(restoredDraft?.search ?? '');
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleGroup>(restoredDraft?.selectedMuscle ?? 'all');
  const [customLoadMode, setCustomLoadMode] = useState<'external' | 'bodyweight'>(restoredDraft?.customLoadMode ?? 'external');
  const [customMeasureType, setCustomMeasureType] = useState<'reps' | 'duration'>(restoredDraft?.customMeasureType ?? 'reps');

  useEffect(() => {
    saveUiDraft(draftKey, { search, selectedMuscle, customLoadMode, customMeasureType });
  }, [customLoadMode, customMeasureType, draftKey, search, selectedMuscle]);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const customName = search.trim();
  const availableExercises = [...customExercises, ...exerciseLibrary];
  const canCreateCustom = Boolean(onCreateCustom) && customName.length >= 2 && !availableExercises.some((exercise) => exercise.name.toLocaleLowerCase('ru') === normalizedSearch);
  const filtered = availableExercises.filter((exercise) => {
    const matchesMuscle = selectedMuscle === 'all' || exercise.primaryMuscle === selectedMuscle;
    const haystack = (exercise.name + ' ' + (exercise.primaryMuscle ?? '') + ' ' + exercise.equipment).toLocaleLowerCase('ru');
    return matchesMuscle && haystack.includes(normalizedSearch);
  });
  const selectExercise = (exercise: ExercisePickerChoice, custom = false) => {
    onSelect(exercise);
    if (custom) setSearch('');
  };
  const createCustomExercise = () => {
    if (!onCreateCustom) return;
    const definition: ExerciseDefinition = {
      id: makeId('custom-exercise'),
      name: customName,
      primaryMuscle: selectedMuscle === 'all' ? undefined : selectedMuscle,
      equipment: customLoadMode === 'bodyweight' ? 'Свой вес' : 'Другое',
      loadMode: customLoadMode,
      measureType: customMeasureType,
    };
    onCreateCustom(definition);
    selectExercise(definition, true);
  };

  return (
    <ModalFrame title="Добавить упражнения" subtitle="Добавляй упражнения по кругу кнопкой +, убирай кнопкой −" className="exercise-picker-sheet" ariaLabel="Добавить упражнения" onClose={onClose}>
      <input className="text-input search-input" type="search" aria-label="Поиск упражнений" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Упражнение, мышца или инвентарь" />
      <div className="muscle-filter" aria-label="Фильтр по основной мышце">
        <button className={selectedMuscle === 'all' ? 'selected' : ''} type="button" onClick={() => setSelectedMuscle('all')} aria-pressed={selectedMuscle === 'all'}>Все</button>
        {muscleGroups.map((muscle) => <button className={selectedMuscle === muscle ? 'selected' : ''} key={muscle} type="button" onClick={() => setSelectedMuscle(muscle)} aria-pressed={selectedMuscle === muscle}>{muscle}</button>)}
      </div>
      <div className="picker-list">
        {canCreateCustom && <section className="custom-exercise-builder">
          <div><strong>Новое упражнение «{customName}»</strong><small>{selectedMuscle === 'all' ? 'Пользовательское упражнение' : selectedMuscle}</small></div>
          <div className="custom-load-mode" aria-label="Тип нагрузки">
            <button className={customLoadMode === 'external' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('external')} aria-pressed={customLoadMode === 'external'}>С весом</button>
            <button className={customLoadMode === 'bodyweight' ? 'selected' : ''} type="button" onClick={() => setCustomLoadMode('bodyweight')} aria-pressed={customLoadMode === 'bodyweight'}>Свой вес</button>
          </div>
          <div className="custom-load-mode" aria-label="Способ измерения">
            <button className={customMeasureType === 'reps' ? 'selected' : ''} type="button" onClick={() => setCustomMeasureType('reps')} aria-pressed={customMeasureType === 'reps'}>Повторы</button>
            <button className={customMeasureType === 'duration' ? 'selected' : ''} type="button" onClick={() => { setCustomMeasureType('duration'); setCustomLoadMode('bodyweight'); }} aria-pressed={customMeasureType === 'duration'}>Секунды</button>
          </div>
          <button className="custom-exercise-option" type="button" onClick={createCustomExercise}><Icon name="plus" /> Сохранить и добавить «{customName}»</button>
        </section>}
        {filtered.map((exercise) => {
          const count = exercises.filter((item) => item.exerciseId === exercise.id).length;
          return <div className="picker-exercise-row" key={exercise.id}>
            <div><strong>{exercise.name}{customExercises.some((item) => item.id === exercise.id) && <em className="personal-exercise-label">Моё</em>}</strong><small>{exercise.primaryMuscle ?? 'Другое'} · {exercise.equipment}</small></div>
            <div className="picker-quantity" role="group" aria-label={exercise.name}>
              <button type="button" disabled={!canRemove(exercise.id)} onClick={() => onRemove(exercise.id)} aria-label={`Убрать ${exercise.name}`}><Icon name="minus" /></button>
              <span aria-live="polite">{count}</span>
              <button type="button" onClick={() => selectExercise(exercise)} aria-label={`Добавить ${exercise.name}`}><Icon name="plus" /></button>
            </div>
          </div>;
        })}
        {!filtered.length && !canCreateCustom && <p className="picker-empty">Ничего не найдено. Введи хотя бы два символа, чтобы добавить своё упражнение.</p>}
      </div>
      <footer className="picker-footer"><span aria-live="polite">В тренировке: {exercises.length}</span><ActionButton icon="check" onClick={onClose}>Готово</ActionButton></footer>
    </ModalFrame>
  );
}
