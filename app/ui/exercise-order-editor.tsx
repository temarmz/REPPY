import { useRef, useState } from 'react';
import type { WorkoutExercise } from '../reppy-data';
import { Box, Inline, Strong, Small } from './elements';
import { ActionButton, Button } from './controls';
import ModalFrame from './modal-frame';
import Icon from './icon';

export default function ExerciseOrderEditor({ exercises, onChange, onClose }: { exercises: WorkoutExercise[]; onChange: (exercises: WorkoutExercise[]) => void; onClose: () => void }) {
  const dragged = useRef<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const move = (id: string, to: number) => {
    const from = exercises.findIndex((item) => item.id === id);
    if (from < 0 || from === to || to < 0 || to >= exercises.length) return;
    const next = [...exercises];
    const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next);
  };
  return <ModalFrame title="Порядок упражнений" ariaLabel="Порядок упражнений" className="exercise-order-sheet" onClose={onClose}>
    <Box className="exercise-order-list">
      {exercises.map((exercise, index) => <Box key={exercise.id} data-order-id={exercise.id} className={`exercise-order-row${moving === exercise.id ? ' moving' : ''}`}>
        <Inline>{index + 1}</Inline><Box><Strong>{exercise.name}</Strong><Small>{exercise.plannedSets.length} {new Intl.PluralRules('ru').select(exercise.plannedSets.length) === 'one' ? 'подход' : new Intl.PluralRules('ru').select(exercise.plannedSets.length) === 'few' ? 'подхода' : 'подходов'}</Small></Box>
        <Button className="exercise-drag-handle" aria-label={`Переместить ${exercise.name}`} aria-describedby="exercise-order-help"
          onPointerDown={(event) => { if (event.button !== 0) return; dragged.current = exercise.id; setMoving(exercise.id); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (dragged.current !== exercise.id) return; const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-order-id]'); if (row?.dataset.orderId) move(exercise.id, exercises.findIndex((item) => item.id === row.dataset.orderId)); }}
          onPointerUp={() => { dragged.current = null; setMoving(null); }} onPointerCancel={() => { dragged.current = null; setMoving(null); }}
          onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); move(exercise.id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><Icon name="grip" /></Button>
      </Box>)}
    </Box>
    <Small className="sr-only" id="exercise-order-help">Перетаскивай за маркер. С клавиатуры — стрелками вверх и вниз.</Small>
    <Inline role="status" className="sr-only">{moving ? `Перемещается: ${exercises.find((item) => item.id === moving)?.name}` : ''}</Inline>
    <ActionButton onClick={onClose}>Готово</ActionButton>
  </ModalFrame>;
}
