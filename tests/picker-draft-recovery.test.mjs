import assert from 'node:assert/strict';
import test from 'node:test';
import { loadExercisePickerDraft, saveUiDraft } from '../app/ui-persistence.ts';

function fixture(t) {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return values;
}

const valid = { search: 'Unsent exercise', selectedMuscle: 'Грудь', customLoadMode: 'external', customMeasureType: 'reps', customMuscleGroups: ['Грудь', 'Трицепс'] };

for (const patch of [{ search: {} }, { search: null }, { selectedMuscle: 'unknown' }, { customLoadMode: 'unknown' },
  { customMeasureType: 'unknown' }, { customMuscleGroups: {} }, { customMuscleGroups: [null] }, { customMuscleGroups: ['unknown'] }]) {
  test(`malformed picker data is ignored without changing unrelated state: ${JSON.stringify(patch)}`, t => {
    const values = fixture(t);
    saveUiDraft('picker', { ...valid, ...patch });
    saveUiDraft('other-picker', valid);
    values.set('reppy-ui:theme', 'light');
    assert.equal(loadExercisePickerDraft('picker'), null);
    assert.equal(values.has('reppy-ui:draft:picker'), false);
    assert.deepEqual(loadExercisePickerDraft('other-picker'), valid);
    assert.equal(values.get('reppy-ui:theme'), 'light');
  });
}

test('valid custom selection, zero-length search and optional muscle list restore without normalization or loss', t => {
  fixture(t);
  saveUiDraft('picker', valid);
  assert.deepEqual(loadExercisePickerDraft('picker'), valid);
  const empty = { search: '', selectedMuscle: 'all', customLoadMode: 'bodyweight', customMeasureType: 'duration' };
  saveUiDraft('picker', empty);
  assert.deepEqual(loadExercisePickerDraft('picker'), empty);
});

test('expired and malformed picker envelopes do not reopen a broken picker', t => {
  const values = fixture(t);
  for (const raw of ['{', 'null', '[]', JSON.stringify({ savedAt: 0, value: valid }), JSON.stringify({ savedAt: Date.now(), value: null })]) {
    values.set('reppy-ui:draft:picker', raw);
    assert.equal(loadExercisePickerDraft('picker'), null);
    assert.equal(values.has('reppy-ui:draft:picker'), false);
  }
});

test('unavailable browser storage never prevents opening the picker', t => {
  fixture(t);
  globalThis.window.localStorage = { getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadExercisePickerDraft('picker'), null);
});
