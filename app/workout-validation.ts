import type { Workout } from './reppy-data.ts';

// A composer draft is local. Only a complete, valid snapshot may be assigned.
export function validateAssignedWorkout(workout: Pick<Workout, 'name' | 'exercises'>) {
  if (!workout.name.trim()) throw new Error('Добавь название тренировки.');
  if (!workout.exercises.length) throw new Error('Добавь хотя бы одно упражнение.');
  for (const exercise of workout.exercises) {
    for (const set of exercise.plannedSets) {
      if (!Number.isInteger(set.targetReps) || set.targetReps <= 0
        || !Number.isFinite(set.targetWeight) || set.targetWeight < 0) {
        throw new Error('Проверь подходы: количество должно быть больше нуля, вес — неотрицательным.');
      }
    }
  }
}
