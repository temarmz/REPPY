import type { WorkoutExercise } from '../reppy-data';
import { Box, Small, SelectOption } from './elements';
import { Select } from './controls';
import { Field } from './patterns';

export type ExerciseModePatch = Partial<Pick<WorkoutExercise, 'loadMode' | 'measureType'>>;

export default function ExerciseModes({ loadMode, measureType, measurementLocked = false, onChange }: Pick<WorkoutExercise, 'loadMode' | 'measureType'> & { measurementLocked?: boolean; onChange: (patch: ExerciseModePatch) => void }) {
  return <Box className="exercise-modes">
    <Field label="Нагрузка"><Select aria-label="Нагрузка" value={loadMode} onChange={event => onChange({ loadMode: event.target.value as WorkoutExercise['loadMode'] })}><SelectOption value="external">С весом</SelectOption><SelectOption value="bodyweight">Свой вес</SelectOption></Select></Field>
    <Field label="Измерение"><Select aria-label="Измерение" disabled={measurementLocked} value={measureType} onChange={event => onChange({ measureType: event.target.value as WorkoutExercise['measureType'] })}><SelectOption value="reps">Повторы</SelectOption><SelectOption value="duration">Длительность</SelectOption></Select></Field>
    {measurementLocked && <Small className="exercise-modes-hint">Чтобы сменить единицу, обнули значения подходов.</Small>}
  </Box>;
}
