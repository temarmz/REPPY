import { exerciseLibrary, exerciseMuscleGroups, type SetResult, type WorkoutExercise, type WorkoutSetPlan } from './reppy-data.ts';

export function formatElapsedTime(startedAt: string, currentTime: number) {
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return {
    elapsedSeconds,
    label: hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}

export function lessonWord(count: number) {
  return { zero: 'занятий', one: 'занятие', two: 'занятия', few: 'занятия', many: 'занятий', other: 'занятий' }[new Intl.PluralRules('ru').select(Math.abs(count))];
}

export function subscriptionBalanceLabel(balance: number, hasEntries = true) {
  if (!hasEntries) return 'Абонемент не добавлен';
  if (balance > 0) return `Осталось ${balance} ${lessonWord(balance)}`;
  if (balance === 0) return 'Абонемент закончился';
  return `${Math.abs(balance)} ${lessonWord(balance)} в долг`;
}

export function subscriptionTone(balance: number, hasEntries = true) {
  if (!hasEntries) return 'empty';
  if (balance <= 0) return 'debt';
  if (balance <= 2) return 'low';
  return 'active';
}

export function exerciseMetadata(exercise: WorkoutExercise) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const muscles = exerciseMuscleGroups({
    primaryMuscle: exercise.primaryMuscle ?? definition?.primaryMuscle,
    muscleGroups: exercise.muscleGroups ?? definition?.muscleGroups,
  }).join(', ');
  const equipment = exercise.equipment ?? definition?.equipment ?? (exercise.loadMode === 'bodyweight' ? 'Свой вес' : undefined);
  if (!definition) {
    const details = [muscles, equipment].filter(Boolean).join(' · ');
    return details ? 'Пользовательское упражнение · ' + details : 'Пользовательское упражнение';
  }
  if (muscles && equipment) return muscles + ' · ' + equipment;
  return muscles || equipment || 'Упражнение';
}

const russianPlurals = new Intl.PluralRules('ru', { maximumFractionDigits: 3 });

export function repetitionWord(count: number): string {
  return { zero: 'повторов', one: 'повтор', two: 'повтора', few: 'повтора', many: 'повторов', other: 'повтора' }[russianPlurals.select(Math.abs(count))];
}

export function workoutSetLabel(exercise: WorkoutExercise, amount: number, weight: number) {
  const measurement = exercise.measureType === 'duration' ? `${amount} сек.`
    : `${amount} ${repetitionWord(amount)}`;
  return exercise.loadMode === 'external' ? `${measurement} · ${weight.toLocaleString('ru-RU', { maximumFractionDigits: 3, useGrouping: false })} кг` : measurement;
}

export function plannedSetLabel(exercise: WorkoutExercise, set: WorkoutSetPlan) {
  return workoutSetLabel(exercise, set.targetReps, set.targetWeight);
}

export function actualSetLabel(exercise: WorkoutExercise, result: SetResult) {
  return workoutSetLabel(exercise, result.actualReps, result.actualWeight);
}
