import type { WorkoutExercise } from '../reppy-data';
import { Box, SelectOption } from './elements';
import { Select } from './controls';
import { Field } from './patterns';

export type ExerciseModePatch = Partial<Pick<WorkoutExercise, 'loadMode' | 'measureType'>>;

export default function ExerciseModes({ loadMode, measureType, onChange }: Pick<WorkoutExercise, 'loadMode' | 'measureType'> & { onChange: (patch: ExerciseModePatch) => void }) {
  return <Box className="exercise-modes">
    <Field label="Нагрузка"><Select aria-label="Нагрузка" value={loadMode} onChange={event => onChange({ loadMode: event.target.value as WorkoutExercise['loadMode'] })}><SelectOption value="external">С весом</SelectOption><SelectOption value="bodyweight">Свой вес</SelectOption></Select></Field>
    <Field label="Измерение"><Select aria-label="Измерение" value={measureType} onChange={event => onChange({ measureType: event.target.value as WorkoutExercise['measureType'] })}><SelectOption value="reps">Повторы</SelectOption><SelectOption value="duration">Длительность</SelectOption></Select></Field>
  </Box>;
}
