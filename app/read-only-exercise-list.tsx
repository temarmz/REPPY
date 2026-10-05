import { useState } from 'react';
import { getExerciseSetPlans, type Workout, type WorkoutExercise } from './reppy-data';
import Icon from './ui-icon';
import { ActionButton } from './ui-controls';
import ExerciseInstructionModal from './exercise-instruction-modal';
import { exerciseMetadata, plannedSetLabel } from './workout-display';

export default function ReadOnlyExerciseList({ workout, onProgress }: { workout: Workout; onProgress?: (exercise: WorkoutExercise) => (() => void) | undefined }) {
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  return (
    <section className="readonly-exercise-list">
      {workout.exercises.map((exercise, index) => {
        const progressAction = onProgress?.(exercise);
        return (
          <article className="readonly-exercise-card" key={exercise.id}>
            <header>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{exercise.name}</h2><small>{exerciseMetadata(exercise)}</small></div>
              <button className="exercise-help" type="button" aria-haspopup="dialog" onClick={() => setInstructionExercise(exercise)} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></button>
            </header>
            <div className="readonly-set-list">
              {getExerciseSetPlans(exercise).map((set, setIndex) => (
                <p key={setIndex}><span>Подход {setIndex + 1}</span><strong>{plannedSetLabel(exercise, set)}</strong></p>
              ))}
            </div>
            {exercise.coachNote && <p className="readonly-coach-note"><Icon name="edit" /> {exercise.coachNote}</p>}
            {progressAction && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={progressAction}>Прогресс упражнения</ActionButton>}
          </article>
        );
      })}
      {instructionExercise && <ExerciseInstructionModal exercise={instructionExercise} onClose={() => setInstructionExercise(null)} />}
    </section>
  );
}
