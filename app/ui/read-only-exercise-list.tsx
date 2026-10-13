import { Section, Card, Header, Inline, Box, Heading, Small, Paragraph, Strong } from './elements';
import { useState } from 'react';
import { getExerciseSetPlans, type Workout, type WorkoutExercise } from '../reppy-data';
import Icon from './icon';
import { ActionButton, Button } from './controls';
import ExerciseInstructionModal from './exercise-instruction-modal';
import { exerciseMetadata, plannedSetLabel } from '../workout-display';

export default function ReadOnlyExerciseList({ workout, onProgress }: { workout: Workout; onProgress?: (exercise: WorkoutExercise) => (() => void) | undefined }) {
  const [instructionExercise, setInstructionExercise] = useState<WorkoutExercise | null>(null);
  return (
    <Section className="readonly-exercise-list">
      {workout.exercises.map((exercise, index) => {
        const progressAction = onProgress?.(exercise);
        return (
          <Card className="readonly-exercise-card" key={exercise.id}>
            <Header>
              <Inline>{String(index + 1).padStart(2, '0')}</Inline>
              <Box><Heading>{exercise.name}</Heading><Small>{exerciseMetadata(exercise)}</Small></Box>
              <Button className="exercise-help" type="button" aria-haspopup="dialog" onClick={() => setInstructionExercise(exercise)} aria-label={'Как выполнять — ' + exercise.name}><Icon name="help" /></Button>
            </Header>
            <Box className="readonly-set-list">
              {getExerciseSetPlans(exercise).map((set, setIndex) => (
                <Paragraph key={setIndex}><Inline>Подход {setIndex + 1}</Inline><Strong>{plannedSetLabel(exercise, set)}</Strong></Paragraph>
              ))}
            </Box>
            {exercise.coachNote && <Paragraph className="readonly-coach-note"><Icon name="edit" /> {exercise.coachNote}</Paragraph>}
            {progressAction && <ActionButton variant="secondary" className="exercise-progress-button" icon="history" onClick={progressAction}>Прогресс упражнения</ActionButton>}
          </Card>
        );
      })}
      {instructionExercise && <ExerciseInstructionModal exercise={instructionExercise} onClose={() => setInstructionExercise(null)} />}
    </Section>
  );
}
