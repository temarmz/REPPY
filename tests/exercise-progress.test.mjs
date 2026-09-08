import assert from 'node:assert/strict';
import test from 'node:test';
import { collectExerciseProgress, compareProgress, bestProgressSet, filterProgressPeriod, progressMetric, progressSetLabel } from '../app/exercise-progress.ts';
const exercise = (overrides = {}) => ({ id: 'instance', exerciseId: 'bench', name: 'Жим', loadMode: 'external', measureType: 'reps', plannedSets: Array.from({ length: 3 }, () => ({ targetWeight: 80, targetReps: 8 })), ...overrides });
const session = (overrides = {}) => ({ id: 'session', studentId: 'a', completedAt: '2026-09-08T10:00:00Z', workoutSnapshot: { name: 'Тренировка', exercises: [exercise()] }, results: [{ exerciseId: 'instance', setNumber: 1, completed: true, actualReps: 8, actualWeight: 80 }, { exerciseId: 'instance', setNumber: 2, completed: false, actualReps: 8, actualWeight: 100 }], ...overrides });

test('собирает упражнение из разных снимков, изолирует ученика и не мутирует данные', () => {
  const sessions = [session(), session({ id: 'second', workoutSnapshot: { name: 'Другая', exercises: [exercise({ id: 'other' })] }, results: [{ exerciseId: 'other', setNumber: 1, completed: true, actualWeight: 85, actualReps: 5 }] }), session({ studentId: 'b' }), session({ completedAt: undefined }), session({ completedAt: 'broken' })];
  const before = structuredClone(sessions);
  const groups = collectExerciseProgress(sessions, 'a');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[0].entries[0].completed, 1);
  assert.equal(groups[0].entries[0].total, 3);
  assert.equal(progressMetric(groups[0].entries[0], 'max'), 80);
  assert.equal(progressMetric(groups[0].entries[0], 'sum'), 8);
  assert.deepEqual(sessions, before);
});

test('повтор упражнения объединяет блоки; другое упражнение и режимы не смешиваются', () => {
  const original = session();
  const copy = exercise({ id: 'copy' });
  const body = exercise({ id: 'body', loadMode: 'bodyweight' });
  const timed = exercise({ id: 'time', measureType: 'duration' });
  const other = exercise({ id: 'other', exerciseId: 'other-bench' });
  original.workoutSnapshot.exercises.push(copy, body, timed, other);
  original.results.push(...[copy, body, timed, other].map((item) => ({ exerciseId: item.id, setNumber: 1, completed: true, actualWeight: 60, actualReps: 10 })));
  const groups = collectExerciseProgress([original], 'a');
  assert.equal(groups.length, 4);
  const bench = groups.find((group) => group.exercise.id === 'instance');
  assert.equal(bench.entries.length, 1);
  assert.equal(bench.entries[0].blocks.length, 2);
  assert.equal(bench.entries[0].total, 6);
  assert.equal(progressMetric(bench.entries[0], 'sum'), 18);
});

test('незавершённые, некорректные, несвязанные и лишние подходы исключаются; ноль кг допустим', () => {
  const original = session({ results: [
    { exerciseId: 'instance', setNumber: 1, completed: true, actualWeight: 0, actualReps: 8 },
    { exerciseId: 'instance', setNumber: 2, completed: true, actualWeight: Infinity, actualReps: 10 },
    { exerciseId: 'instance', setNumber: 3, completed: false, actualWeight: 100, actualReps: 10 },
    { exerciseId: 'unknown', setNumber: 1, completed: true, actualWeight: 1000, actualReps: 10 },
    { exerciseId: 'instance', setNumber: 4, completed: true, actualWeight: 1000, actualReps: 10 },
  ] });
  const entry = collectExerciseProgress([original], 'a')[0].entries[0];
  assert.equal(entry.completed, 1);
  assert.equal(progressMetric(entry, 'max'), 0);
  assert.equal(progressMetric(entry, 'sum'), 8);
  original.results[0].actualReps = 0;
  assert.deepEqual(collectExerciseProgress([original], 'a'), []);
});

test('периоды используют начало календарного дня и исключают будущее', () => {
  const now = new Date(2026, 8, 8, 14);
  const first = new Date(2026, 7, 10, 0).getTime();
  const entries = [first - 1, first, now.getTime(), now.getTime() + 1].map((timestamp) => ({ timestamp }));
  assert.deepEqual(filterProgressPeriod(entries, '30', now).map((entry) => entry.timestamp), [first, now.getTime()]);
  assert.equal(filterProgressPeriod(entries, 'all', now).length, 3);
  const start90 = new Date(2026, 5, 11).getTime();
  assert.equal(filterProgressPeriod([{ timestamp: start90 - 1 }, { timestamp: start90 }], '90', now).length, 1);
});

test('свой вес и секунды имеют свои метрики и подписи', () => {
  for (const measureType of ['reps', 'duration']) {
    const original = session();
    original.workoutSnapshot.exercises[0] = exercise({ loadMode: 'bodyweight', measureType });
    const entry = collectExerciseProgress([original], 'a')[0].entries[0];
    assert.equal(progressMetric(entry, 'max'), 8);
    assert.equal(progressMetric(entry, 'sum'), 8);
    assert.equal(progressSetLabel(entry.blocks[0].exercise, original.results[0]), measureType === 'duration' ? '8 сек.' : '8 повт.');
  }
  assert.equal(progressSetLabel(exercise(), { actualWeight: 77.5, actualReps: 8 }), '77,5 кг × 8 повт.');
});

test('последний снимок задаёт имя; удаление сессии убирает её вклад', () => {
  const older = session({ id: 'older', completedAt: '2026-09-01T10:00:00Z' });
  const newer = session({ id: 'newer', workoutSnapshot: { name: 'Другой шаблон', exercises: [exercise({ name: 'Новое название' })] } });
  const group = collectExerciseProgress([older, newer], 'a')[0];
  assert.equal(group.exercise.name, 'Новое название');
  assert.equal(group.entries[0].session.id, 'newer');
  assert.equal(collectExerciseProgress([older], 'a')[0].entries.length, 1);
});


test('сравнение лучших подходов показывает точные изменения без оценки прогресса', () => {
  const compare = (beforeWeight, beforeReps, afterWeight, afterReps, mode = {}) => {
    const make = (id, weight, reps, date) => session({ id, completedAt: date, workoutSnapshot: { exercises: [exercise(mode)] }, results: [{ exerciseId: 'instance', setNumber: 1, completed: true, actualWeight: weight, actualReps: reps }] });
    const group = collectExerciseProgress([make('old', beforeWeight, beforeReps, '2026-09-01T10:00:00Z'), make('new', afterWeight, afterReps, '2026-09-08T10:00:00Z')], 'a')[0];
    return compareProgress(group.entries);
  };
  assert.equal(compare(80, 8, 82.5, 8).label, '+2,5 кг при тех же повторах');
  assert.equal(compare(80, 8, 80, 10).label, '+2 повт.');
  assert.equal(compare(80, 8, 85, 5).label, '+5 кг, −3 повт.');
  assert.equal(compare(80, 8, 80, 8).label, 'Без изменений');
  assert.equal(compare(80, 8, 75, 6).label, '−5 кг, −2 повт.');
  assert.equal(compare(0, 8, 0, 10, { loadMode: 'bodyweight' }).label, '+2 повт.');
  assert.equal(compare(0, 30, 0, 45, { loadMode: 'bodyweight', measureType: 'duration' }).label, '+15 сек.');
  const entries = collectExerciseProgress([session()], 'a')[0].entries;
  assert.equal(compareProgress(entries).label, '');
  assert.equal(compareProgress(entries).trend, 'none');
  assert.equal(compare(80, 8, 82.5, 8).trend, 'up');
  assert.equal(compare(80, 8, 85, 5).trend, 'mixed');
  assert.equal(compare(80, 8, 80, 8).trend, 'flat');
  assert.equal(compare(80, 8, 75, 6).trend, 'down');
  assert.equal(compareProgress([]), undefined);
});

test('лучший подход выбирается целиком: сначала вес, затем повторы', () => {
  const original = session();
  original.results = [
    { exerciseId: 'instance', setNumber: 1, completed: true, actualWeight: 80, actualReps: 15 },
    { exerciseId: 'instance', setNumber: 2, completed: true, actualWeight: 85, actualReps: 5 },
    { exerciseId: 'instance', setNumber: 3, completed: true, actualWeight: 85, actualReps: 7 },
  ];
  const best = bestProgressSet(collectExerciseProgress([original], 'a')[0].entries[0]);
  assert.equal(best.actualWeight, 85);
  assert.equal(best.actualReps, 7);
  assert.equal(best.setNumber, 3);
});
