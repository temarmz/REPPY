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
  assert.ok(state.workouts.length > 0);
});

test('repository мигрирует старый формат данных', async () => {
  const legacy = structuredClone(createInitialState());
  delete legacy.studentWorkoutVersions;
  delete legacy.assignments[0].source;
  delete legacy.assignments[0].workoutSnapshot;
  const memory = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify(legacy) });
  const repository = createLocalStorageRepository(memory.storage);
  const state = await repository.load();

  assert.deepEqual(state.studentWorkoutVersions, []);
  assert.equal(state.assignments[0].source, 'template');
  assert.ok(state.assignments[0].workoutSnapshot.exercises.length > 0);
});

test('repository восстанавливает seed после повреждённого JSON', async () => {
  const memory = createMemoryStorage({ [STORAGE_KEY]: '{broken' });
  const repository = createLocalStorageRepository(memory.storage);
  const state = await repository.load();

  assert.equal(state.loggedIn, false);
  assert.equal(memory.value(), null);
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
