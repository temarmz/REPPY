import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../app/reppy-data.ts';
import { STORAGE_KEY, createLocalStorageRepository } from '../app/reppy-repository.ts';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
      removeItem(key) {
        values.delete(key);
      },
    },
    value(key = STORAGE_KEY) {
      return values.get(key) ?? null;
    },
  };
}

test('repository создаёт исходное состояние при пустом хранилище', async () => {
  const memory = createMemoryStorage();
  const repository = createLocalStorageRepository(memory.storage);
  const state = await repository.load();

  assert.equal(state.loggedIn, false);
  assert.equal(state.role, 'trainer');
  assert.ok(state.students.length > 0);
  assert.ok(state.assignments.length > 0);
  assert.equal('workouts' in state, false);
});

test('repository мигрирует старый формат данных', async () => {
  const legacy = structuredClone(createInitialState());
  const legacyWorkout = structuredClone(legacy.assignments[0].workoutSnapshot);
  legacy.schemaVersion = 4;
  legacy.workouts = [legacyWorkout];
  legacy.studentWorkoutVersions = [];
  delete legacy.subscriptionEntries;
  legacy.assignments[0].workoutId = legacyWorkout.id;
  delete legacy.assignments[0].workoutSnapshot;
  const memory = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify(legacy) });
  const repository = createLocalStorageRepository(memory.storage);
  const state = await repository.load();

  assert.deepEqual(state.subscriptionEntries, []);
  assert.ok(state.assignments[0].workoutSnapshot.exercises.length > 0);
  assert.equal('workouts' in state, false);
  assert.equal('studentWorkoutVersions' in state, false);
  assert.equal('workoutId' in state.assignments[0], false);
  assert.equal('source' in state.assignments[0], false);
});

test('repository восстанавливает seed после повреждённого JSON', async () => {
  const memory = createMemoryStorage({ [STORAGE_KEY]: '{broken' });
  const repository = createLocalStorageRepository(memory.storage);
  const state = await repository.load();

  assert.equal(state.loggedIn, false);
  assert.equal(memory.value(), null);
});

test('repository сохраняет исходную запись, если миграция не удалась', async () => {
  const saved = JSON.stringify({ schemaVersion: 4 });
  const memory = createMemoryStorage({ [STORAGE_KEY]: saved });
  const repository = createLocalStorageRepository(memory.storage);

  await assert.rejects(repository.load());
  assert.equal(memory.value(), saved);
});

test('repository не подменяет данные seed-состоянием при недоступном хранилище', async () => {
  const repository = createLocalStorageRepository({
    getItem() {
      throw new DOMException('Хранилище временно недоступно', 'SecurityError');
    },
    setItem() {},
    removeItem() {},
  });

  await assert.rejects(repository.load(), { name: 'SecurityError' });
});

test('repository сохраняет и очищает состояние через единый контракт', async () => {
  const memory = createMemoryStorage();
  const repository = createLocalStorageRepository(memory.storage);
  const state = createInitialState();
  state.loggedIn = true;

  await repository.save(state);
  assert.equal(JSON.parse(memory.value()).loggedIn, true);

  await repository.clear();
  assert.equal(memory.value(), null);
});
