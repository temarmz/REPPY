import { Field } from './patterns';
import { Box, Inline, Card, Header, Heading, Small, Footer, Section, Strong } from './elements';
import { Button, Input, Textarea } from './controls';
import { useState, type ReactNode } from 'react';
import { getExerciseSetPlans, type SetResult, type WorkoutExercise, type WorkoutSetPlan } from '../reppy-data';
import Icon from './icon';

function EditableNumberInput({ value, onChange, min = 0, step = 1, inputMode = 'numeric', emptyWhenZero = false }: { value: number; onChange: (value: number) => void; min?: number; step?: number; inputMode?: 'numeric' | 'decimal'; emptyWhenZero?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = emptyWhenZero && value === 0 ? '' : String(value);

  const commit = () => {
    const nextDraft = draft ?? displayValue;
    if (!nextDraft.trim()) {
      setDraft(null);
      if (emptyWhenZero && value !== 0) onChange(0);
      return;
    }
    const parsed = Number(nextDraft.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    setDraft(null);
    const nextValue = Math.max(min, parsed);
    if (nextValue !== value) onChange(nextValue);
  };

  return <Input type={inputMode === 'decimal' ? 'text' : 'number'} min={min} step={inputMode === 'decimal' ? 'any' : step} inputMode={inputMode} placeholder={emptyWhenZero ? '—' : undefined} value={draft ?? displayValue} onFocus={(event) => { setDraft(displayValue); event.currentTarget.select(); }} onChange={(event) => {
    const nextDraft = event.target.value;
    if (inputMode === 'decimal' && !/^\d*(?:[.,]\d*)?$/.test(nextDraft)) return;
    setDraft(nextDraft);
    if (!nextDraft.trim()) { if (emptyWhenZero && value !== 0) onChange(0); return; }
    const parsed = Number(nextDraft.replace(',', '.'));
    if (nextDraft.trim() && Number.isFinite(parsed)) {
      const nextValue = Math.max(min, parsed);
      if (nextValue !== value) onChange(nextValue);
    }
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
  if (count === 0) {
    return <Button className="add-first-set" type="button" aria-label={`Добавить подход — ${exerciseName}`} onClick={onAdd}><Icon name="plus" /> Добавить подход</Button>;
  }
  return (
    <Box className="set-count-control" role="group" aria-label={`Подходы — ${exerciseName}`}>
      <Inline>Подходы</Inline>
      <Box className="set-count-actions">
        <Button type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Удалить последний подход — ${exerciseName}`}><Icon name="minus" /></Button>
        <Button type="button" onClick={onAdd} aria-label={`Добавить подход — ${exerciseName}`}><Icon name="plus" /></Button>
      </Box>
    </Box>
  );
}

function ExerciseCardFrame({
  mode,
  exercise,
  index,
  metadata,
  completed = false,
  recentlyChanged,
  orderControls,
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
  orderControls: ReactNode;
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
    <Card
      className={className}
      data-exercise-card={mode}
      data-plan-exercise={mode === 'plan' ? exercise.id : undefined}
      data-active-exercise={mode === 'active' ? exercise.id : undefined}
    >
      <Header className="active-exercise-card-header">
        <Inline className="active-exercise-number">{String(index + 1).padStart(2, '0')}</Inline>
        <Box><Heading>{exercise.name}</Heading><Small className="active-exercise-meta">{metadata}</Small></Box>
        <Box className="active-exercise-corner-actions">
          {orderControls}
          <Box className="exercise-info-controls">
          <Button className="exercise-help" type="button" aria-haspopup="dialog" onClick={onShowInstruction} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></Button>
          <Button className="exercise-menu" type="button" aria-haspopup="dialog" onClick={onShowActions} aria-label={(mode === 'plan' ? 'Удалить упражнение — ' : 'Действия — ') + exercise.name}><Icon name={mode === 'plan' ? 'trash' : 'more'} /></Button>
          </Box>
        </Box>
      </Header>
      {children}
      {footer}
    </Card>
  );
}

function ExerciseOrderControls({ exercise, index, totalExercises, onMoveUp, onMoveDown }: {
  exercise: WorkoutExercise;
  index: number;
  totalExercises: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
      <Box className="exercise-order-controls" role="group" aria-label={'Порядок — ' + exercise.name}>
        <Button className="move-up" type="button" disabled={index === 0} onClick={onMoveUp} aria-label={'Поднять ' + exercise.name + ' выше'}><Icon name="move-up" /></Button>
        <Button className="move-down" type="button" disabled={index === totalExercises - 1} onClick={onMoveDown} aria-label={'Опустить ' + exercise.name + ' ниже'}><Icon name="move-down" /></Button>
      </Box>
  );
}

function ExerciseCommentButton({ exercise, open, onToggle }: { exercise: WorkoutExercise; open: boolean; onToggle: () => void }) {
  return <Button className={'exercise-comment-button' + (exercise.coachNote ? ' has-value' : '')} type="button" aria-expanded={open} onClick={onToggle}><Icon name="edit" /> {open ? 'Скрыть комментарий' : exercise.coachNote ? 'Показать комментарий' : 'Добавить комментарий'}</Button>;
}

function ExerciseComment({ exercise, onNoteChange }: { exercise: WorkoutExercise; onNoteChange: (note: string) => void }) {
  return <Field label={<>Комментарий к упражнению</>} className="active-comment-field"><Textarea maxLength={240} value={exercise.coachNote ?? ''} onChange={(event) => onNoteChange(event.target.value)} placeholder="Например: держи локти вдоль тела" autoFocus /></Field>;
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
      orderControls={<ExerciseOrderControls exercise={exercise} index={index} totalExercises={totalExercises} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
      footer={<Footer className="active-exercise-footer-actions"><ExerciseCommentButton exercise={exercise} open={commentOpen} onToggle={() => setCommentOpen((current) => !current)} /><SetCountControl exerciseName={exercise.name} count={plans.length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} /></Footer>}
    >
      {plans.length > 0 && <Section className="active-card-sets plan-card-sets">
        {plans.map((set, setIndex) => (
          <Card className={'set-card plan-set-card ' + (bodyweight ? 'bodyweight' : '')} key={setIndex}>
            <Box className="set-number"><Inline>ПОДХОД</Inline><Strong>{setIndex + 1}</Strong></Box>
            <Box className={'set-metrics ' + (bodyweight ? 'single-metric' : '')}>
              {!bodyweight && <Field label={<>КГ</>} ><EditableNumberInput value={set.targetWeight} step={2.5} inputMode="decimal" emptyWhenZero onChange={(targetWeight) => onSetChange(setIndex, { targetWeight })} /></Field>}
              <Field label={<>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</>} ><EditableNumberInput value={set.targetReps} inputMode="numeric" min={1} emptyWhenZero onChange={(targetReps) => onSetChange(setIndex, { targetReps })} /></Field>
            </Box>
          </Card>
        ))}
      </Section>}
      {commentOpen && <ExerciseComment exercise={exercise} onNoteChange={onNoteChange} />}
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
      orderControls={<ExerciseOrderControls exercise={exercise} index={index} totalExercises={totalExercises} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
      footer={<Footer className="active-exercise-footer-actions"><ExerciseCommentButton exercise={exercise} open={commentOpen} onToggle={() => setCommentOpen((current) => !current)} /><SetCountControl exerciseName={exercise.name} count={results.length} canRemove={canRemoveSet} onRemove={onRemoveSet} onAdd={onAddSet} /></Footer>}
    >
      {results.length > 0 && <Section className="active-card-sets">
        {results.map((result) => (
          <Card className={'set-card ' + (result.completed ? 'completed' : '')} key={result.setNumber}>
            <Box className="set-number"><Inline>ПОДХОД</Inline><Strong>{result.setNumber}</Strong></Box>
            <Box className={'set-metrics ' + (exercise.loadMode === 'bodyweight' ? 'single-metric' : '')}>
              {exercise.loadMode !== 'bodyweight' && <Field label={<>КГ</>} ><EditableNumberInput value={result.actualWeight} step={2.5} inputMode="decimal" emptyWhenZero onChange={(actualWeight) => onResultChange(result.setNumber, { actualWeight })} /></Field>}
              <Field label={<>{exercise.measureType === 'duration' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</>} ><EditableNumberInput value={result.actualReps} inputMode="numeric" emptyWhenZero onChange={(actualReps) => onResultChange(result.setNumber, { actualReps })} /></Field>
            </Box>
            <Button
              type="button"
              disabled={!result.completed && (result.actualReps <= 0 || (exercise.loadMode !== 'bodyweight' && result.actualWeight <= 0))}
              title={!result.completed && (result.actualReps <= 0 || (exercise.loadMode !== 'bodyweight' && result.actualWeight <= 0)) ? 'Сначала заполни повторы и вес' : undefined}
              onClick={() => onResultChange(result.setNumber, { completed: !result.completed })}
              aria-label={(result.completed ? 'Отменить подход ' : 'Завершить подход ') + result.setNumber + ' — ' + exercise.name}
            ><Icon name="check" /></Button>
          </Card>
        ))}
      </Section>}
      {commentOpen && <ExerciseComment exercise={exercise} onNoteChange={onNoteChange} />}
    </ExerciseCardFrame>
  );
}
