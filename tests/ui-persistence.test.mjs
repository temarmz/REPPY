import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearUiDraft,
  clearWorkoutComposerDraft,
  loadAllDaysPreference,
  loadLastRoute,
  loadThemePreference,
  loadUiDraft,
  loadWorkoutComposerDraft,
  loadWorkoutPicker,
  saveAllDaysPreference,
  saveLastRoute,
  saveThemePreference,
  saveUiDraft,
  saveWorkoutComposerDraft,
  saveWorkoutPicker,
} from '../app/ui-persistence.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function withWindow(run) {
  const previousWindow = globalThis.window;
  const localStorage = memoryStorage();
  globalThis.window = { localStorage };
  try {
    return run(localStorage);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('настройки интерфейса сохраняются отдельно от маршрута аккаунта', () => withWindow(() => {
  saveAllDaysPreference(true);
  saveThemePreference('light');
  saveLastRoute('/trainer/clients/student-1', 'trainer-1');

  assert.equal(loadAllDaysPreference(), true);
  assert.equal(loadThemePreference(), 'light');
  assert.equal(loadLastRoute('trainer', 'trainer-1'), '/trainer/clients/student-1');
  assert.equal(loadLastRoute('student', 'trainer-1'), '/student');
}));

test('черновик тренировки действует только для своей версии исходных данных', () => withWindow(() => {
  const draft = { name: 'Ноги', format: 'in-person', exercises: [] };
  saveWorkoutComposerDraft('assignment-1', 'revision-1', draft);

  assert.deepEqual(loadWorkoutComposerDraft('assignment-1', 'revision-1'), draft);
  assert.equal(loadWorkoutComposerDraft('assignment-1', 'revision-2'), null);
}));

test('просроченные и повреждённые UI-черновики безопасно удаляются', () => withWindow((storage) => {
  storage.setItem('reppy-ui:draft:expired', JSON.stringify({ savedAt: 0, value: { name: 'old' } }));
  storage.setItem('reppy-ui:draft:broken', '{');

  assert.equal(loadUiDraft('expired'), null);
  assert.equal(storage.getItem('reppy-ui:draft:expired'), null);
  assert.equal(loadUiDraft('broken'), null);
}));

test('очистка редактора удаляет и черновик, и состояние выбора тренировки', () => withWindow(() => {
  saveWorkoutComposerDraft('new-workout', 'baseline', { name: 'Спина', format: 'online', exercises: [] });
  saveWorkoutPicker('new-workout', 'start');
  saveUiDraft('invite', { name: 'Анна' });

  clearWorkoutComposerDraft('new-workout');
  assert.equal(loadWorkoutComposerDraft('new-workout', 'baseline'), null);
  assert.equal(loadWorkoutPicker('new-workout'), null);

  assert.deepEqual(loadUiDraft('invite'), { name: 'Анна' });
  clearUiDraft('invite');
  assert.equal(loadUiDraft('invite'), null);
}));

test('недоступный localStorage не ломает интерфейс', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } };
  try {
    assert.equal(loadThemePreference(), 'dark');
    assert.equal(loadAllDaysPreference(), false);
    assert.equal(loadLastRoute('trainer', 'trainer-1'), '/trainer');
    assert.doesNotThrow(() => saveThemePreference('light'));
    assert.doesNotThrow(() => saveUiDraft('key', { value: 1 }));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
