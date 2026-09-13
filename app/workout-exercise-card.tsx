import { useState, type ReactNode } from 'react';
import { getExerciseSetPlans, type SetResult, type WorkoutExercise, type WorkoutSetPlan } from './reppy-data';
import Icon from './ui-icon';

function EditableNumberInput({ value, onChange, min = 0, step = 1, inputMode = 'numeric' }: { value: number; onChange: (value: number) => void; min?: number; step?: number; inputMode?: 'numeric' | 'decimal' }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const nextDraft = draft ?? String(value);
    if (!nextDraft.trim()) {
      setDraft(null);
      return;
    }
    const parsed = Number(nextDraft.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    setDraft(null);
    onChange(Math.max(min, parsed));
  };

  return <input type="number" min={min} step={step} inputMode={inputMode} value={draft ?? String(value)} onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }} onChange={(event) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const parsed = Number(nextDraft.replace(',', '.'));
    if (nextDraft.trim() && Number.isFinite(parsed)) onChange(Math.max(min, parsed));
  }} onBlur={commit} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} />;
}

function SetCountControl({
  exerciseName,
  count,
  canRemove,
  onRemove,
  onAdd,
}: {
  exerciseName: string;
  count: number;
  canRemove: boolean;
  onRemove: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="set-count-control" role="group" aria-label={`Подходы — ${exerciseName}`}>
      <span>Подходы</span>
      <button type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Удалить последний подход — ${exerciseName}`}><Icon name="minus" /></button>
      <strong aria-live="polite">{count}</strong>
      <button type="button" onClick={onAdd} aria-label={`Добавить подход — ${exerciseName}`}><Icon name="plus" /></button>
    </div>
  );
}

function ExerciseCardFrame({
  mode,
  exercise,
  index,
  metadata,
  completed = false,
  recentlyChanged,
  toolbar,
  children,
  footer,
  onShowInstruction,
  onShowActions,
}: {
  mode: 'plan' | 'active';
  exercise: WorkoutExercise;
  index: number;
  metadata: string;
  completed?: boolean;
  recentlyChanged: boolean;
  toolbar: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onShowInstruction: () => void;
  onShowActions: () => void;
}) {
  const className = [
    'active-exercise-card',
    mode === 'plan' ? 'plan-exercise-card' : '',
    completed ? 'completed' : '',
    recentlyChanged ? 'recently-moved' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={className}
      data-exercise-card={mode}
      data-plan-exercise={mode === 'plan' ? exercise.id : undefined}
      data-active-exercise={mode === 'active' ? exercise.id : undefined}
    >
      <header className="active-exercise-card-header">
        <span className="active-exercise-number">{String(index + 1).padStart(2, '0')}</span>
        <div><h2>{exercise.name}</h2><small className="active-exercise-meta">{metadata}</small></div>
        <div className="active-exercise-corner-actions">
          <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={onShowInstruction} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
          <button className="exercise-menu" type="button" aria-haspopup="dialog" onClick={onShowActions} aria-label={'Действия — ' + exercise.name}><Icon name="more" /></button>
        </div>
      </header>
      {toolbar}
      {children}
      {footer}
    </article>
  );
}

function ExerciseToolbar({ exercise, index, totalExercises, commentOpen, onToggleComment, onMoveUp, onMoveDown }: {
  exercise: WorkoutExercise;
  index: number;
  totalExercises: number;
  commentOpen: boolean;
  onToggleComment: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="exercise-toolbar">
      <div className="active-exercise-actions">
        <button className={exercise.coachNote ? 'has-value' : ''} type="button" aria-expanded={commentOpen} onClick={onToggleComment}><Icon name="edit" /> {commentOpen ? 'Скрыть комментарий' : exercise.coachNote ? 'Показать комментарий' : 'Добавить комментарий'}</button>
      </div>
      <div className="exercise-order-controls">
        <button className="move-up" type="button" disabled={index === 0} onClick={onMoveUp} aria-label={'Поднять ' + exercise.name + ' выше'}><Icon name="chevron-left" /></button>
        <button className="move-down" type="button" disabled={index === totalExercises - 1} onClick={onMoveDown} aria-label={'Опустить ' + exercise.name + ' ниже'}><Icon name="chevron-right" /></button>
      </div>
    </div>
  );
}

function ExerciseComment({ exercise, onNoteChange }: { exercise: WorkoutExercise; onNoteChange: (note: string) => void }) {
  return <label className="active-comment-field"><span>Комментарий к упражнению</span><textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => onNoteChange(event.target.value)} placeholder="Например: держи локти вдоль тела" autoFocus /></label>;
}

type SharedExerciseCardProps = {
  exercise: WorkoutExercise;
  metadata: string;
  index: number;
  totalExercises: number;
  recentlyMoved: boolean;
  onShowInstruction: () => void;
  onShowActions: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNoteChange: (note: string) => void;
  onAddSet: () => void;
  canRemoveSet: boolean;
  onRemoveSet: () => void;
  onAddAfter: () => void;
};

export function PlanExerciseCard({
  exercise,
  metadata,
  index,
  totalExercises,
  recentlyMoved,
  onShowInstruction,
  onShowActions,
  onMoveUp,
  onMoveDown,
  onNoteChange,
  onSetChange,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
  onAddAfter,
}: SharedExerciseCardProps & {
  onSetChange: (index: number, patch: Partial<WorkoutSetPlan>) => void;
}) {
  const [commentOpen, setCommentOpen] = useState(Boolean(exercise.coachNote));
  const bodyweight = exercise.loadMode === 'bodyweight';
  const plans = getExerciseSetPlans(exercise);
  return (
    <ExerciseCardFrame
      mode="plan"
      exercise={exercise}
      index={index}
      metadata={metadata}
      recentlyChanged={recentlyMoved}
      onShowInstruction={onShowInstruction}
      onShowActions={onShowActions}
      toolbar={<ExerciseToolbar exercise={exercise} index={index} totalExercises={totalExercises} commentOpen={commentOpen} onToggleComment={() => setCommentOpen((current) => !current)} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
      footer={<footer className="active-exercise-footer-actions"><SetCountControl exerciseName={exercise.name} count={plans.length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} /><button type="button" onClick={onAddAfter}><Icon name="plus" /> Ещё упражнение</button></footer>}
    >
      {commentOpen && <ExerciseComment exercise={exercise} onNoteChange={onNoteChange} />}
      <section className="active-card-sets plan-card-sets">
        {plans.map((set, setIndex) => (
          <article className={'set-card plan-set-card ' + (bodyweight ? 'bodyweight' : '')} key={setIndex}>
            <div className="set-number"><span>ПОДХОД</span><strong>{setIndex + 1}</strong></div>
            <div className={'set-metrics ' + (bodyweight ? 'single-metric' : '')}>
              {!bodyweight && <label><span>КГ</span><EditableNumberInput value={set.targetWeight} step={2.5} inputMode="decimal" onChange={(targetWeight) => onSetChange(setIndex, { targetWeight })} /></label>}
              <label><span>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</span><EditableNumberInput value={set.targetReps} inputMode="numeric" min={1} onChange={(targetReps) => onSetChange(setIndex, { targetReps })} /></label>
            </div>
          </article>
        ))}
      </section>
    </ExerciseCardFrame>
  );
}

export function ActiveExerciseCard({
  exercise,
  metadata,
  index,
  totalExercises,
  results,
  recentlyMoved,
  onNoteChange,
  onResultChange,
  onShowInstruction,
  onShowActions,
  onAddSet,
  canRemoveSet,
  onRemoveSet,
  onAddAfter,
  onMoveUp,
  onMoveDown,
}: SharedExerciseCardProps & {
  results: SetResult[];
  onResultChange: (setNumber: number, patch: Partial<SetResult>) => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const allCompleted = results.length > 0 && results.every((result) => result.completed);

  return (
    <ExerciseCardFrame
      mode="active"
      exercise={exercise}
      index={index}
      metadata={metadata}
      completed={allCompleted}
      recentlyChanged={recentlyMoved}
      onShowInstruction={onShowInstruction}
      onShowActions={onShowActions}
      toolbar={<ExerciseToolbar exercise={exercise} index={index} totalExercises={totalExercises} commentOpen={commentOpen} onToggleComment={() => setCommentOpen((current) => !current)} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
      footer={<footer className="active-exercise-footer-actions"><SetCountControl exerciseName={exercise.name} count={results.length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} /><button type="button" onClick={onAddAfter}><Icon name="plus" /> Ещё упражнение</button></footer>}
    >
      {commentOpen && <ExerciseComment exercise={exercise} onNoteChange={onNoteChange} />}
      <section className="active-card-sets">
        {results.map((result) => (
          <article className={'set-card ' + (result.completed ? 'completed' : '')} key={result.setNumber}>
            <div className="set-number"><span>ПОДХОД</span><strong>{result.setNumber}</strong></div>
            <div className={'set-metrics ' + (exercise.loadMode === 'bodyweight' ? 'single-metric' : '')}>
              {exercise.loadMode !== 'bodyweight' && <label><span>КГ</span><EditableNumberInput value={result.actualWeight} step={2.5} inputMode="decimal" onChange={(actualWeight) => onResultChange(result.setNumber, { actualWeight })} /></label>}
              <label><span>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</span><EditableNumberInput value={result.actualReps} inputMode="numeric" onChange={(actualReps) => onResultChange(result.setNumber, { actualReps })} /></label>
            </div>
            <button type="button" onClick={() => onResultChange(result.setNumber, { completed: !result.completed })} aria-label={(result.completed ? 'Отменить подход ' : 'Завершить подход ') + result.setNumber + ' — ' + exercise.name}><Icon name="check" /></button>
          </article>
        ))}
      </section>
    </ExerciseCardFrame>
  );
}
