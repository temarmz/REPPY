import { exerciseLibrary, type SetResult, type WorkoutExercise, type WorkoutSetPlan } from './reppy-data';

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
  const muscle = exercise.primaryMuscle ?? definition?.primaryMuscle;
  const equipment = exercise.equipment ?? definition?.equipment ?? (exercise.loadMode === 'bodyweight' ? 'Свой вес' : undefined);
  if (!definition) {
    const details = [muscle, equipment].filter(Boolean).join(' · ');
    return details ? 'Пользовательское упражнение · ' + details : 'Пользовательское упражнение';
  }
  if (muscle && equipment) return muscle + ' · ' + equipment;
  return muscle ?? equipment ?? 'Упражнение';
}

export function plannedSetLabel(exercise: WorkoutExercise, set: WorkoutSetPlan) {
  if (exercise.measureType === 'duration') return set.targetReps + ' сек.';
  if (exercise.loadMode === 'bodyweight') return set.targetReps + ' повторов';
  return set.targetWeight + ' кг × ' + set.targetReps;
}

export function actualSetLabel(exercise: WorkoutExercise, result: SetResult) {
  if (exercise.measureType === 'duration') return result.actualReps + ' сек.';
  if (exercise.loadMode === 'bodyweight') return result.actualReps + ' повторов';
  return result.actualWeight + ' кг × ' + result.actualReps;
}
