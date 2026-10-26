import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../app/reppy-data.ts';
import { loadWorkoutComposerDraft, loadWorkoutPicker, saveWorkoutComposerDraft, saveWorkoutPicker } from '../app/ui-persistence.ts';

function fixture(t) {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const exercise = structuredClone(createInitialState().assignments[0].workoutSnapshot.exercises[0]);
  const draft = { name: 'Unsent plan', format: 'in-person', scheduledFor: '2026-10-26', scheduledTime: '18:30', exercises: [exercise] };
  return { values, draft, put(value = draft, savedAt = Date.now()) {
    values.set('reppy-ui:workout-draft:plan', JSON.stringify({ baseline: 'baseline', savedAt, value }));
  } };
}

for (const [name, corrupt] of [
  ['name object', d => { d.name = {}; }],
  ['exercise collection object', d => { d.exercises = {}; }],
  ['null exercise', d => { d.exercises = [null]; }],
  ['exercise name object', d => { d.exercises[0].name = {}; }],
  ['set collection object', d => { d.exercises[0].plannedSets = {}; }],
  ['null set', d => { d.exercises[0].plannedSets = [null]; }],
  ['string weight', d => { d.exercises[0].plannedSets[0].targetWeight = '7.25'; }],
  ['negative repetitions', d => { d.exercises[0].plannedSets[0].targetReps = -1; }],
  ['invalid load mode', d => { d.exercises[0].loadMode = 'unknown'; }],
  ['invalid measurement', d => { d.exercises[0].measureType = 'unknown'; }],
  ['invalid format', d => { d.format = 'unknown'; }],
  ['invalid date', d => { d.scheduledFor = '2026-02-30'; }],
  ['invalid time', d => { d.scheduledTime = '25:00'; }],
  ['invalid muscle groups', d => { d.exercises[0].muscleGroups = {}; }],
  ['invalid note', d => { d.exercises[0].coachNote = {}; }],
  ['invalid video metadata', d => { d.exercises[0].instructionVideo = { id: 'v', name: {}, size: 100, mimeType: 'video/mp4', createdAt: 'now' }; }],
  ['duplicate instance IDs', d => { d.exercises.push(structuredClone(d.exercises[0])); }],
]) {
  test(`invalid workout draft cannot restore ${name} or its open picker`, t => {
    const f = fixture(t);
    corrupt(f.draft);
    f.put();
    saveWorkoutPicker('plan', 'start');
    f.values.set('reppy-ui:theme', 'light');
    saveWorkoutComposerDraft('other', 'baseline', { name: '', format: 'online', exercises: [] });
    assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
    assert.equal(loadWorkoutPicker('plan'), null);
    assert.equal(f.values.has('reppy-ui:workout-draft:plan'), false);
    assert.equal(f.values.get('reppy-ui:theme'), 'light');
    assert.deepEqual(loadWorkoutComposerDraft('other', 'baseline'), { name: '', format: 'online', exercises: [] });
  });
}

for (const envelope of [null, [], {}, { savedAt: 'now' }, { savedAt: null }, { value: null, savedAt: 1 }]) {
  test(`invalid workout envelope is ignored: ${JSON.stringify(envelope)}`, t => {
    const f = fixture(t);
    f.values.set('reppy-ui:workout-draft:plan', JSON.stringify(envelope));
    assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
    assert.equal(f.values.has('reppy-ui:workout-draft:plan'), false);
  });
}

test('valid blank and detailed drafts restore exactly, including zero values, metadata and past dates', t => {
  const f = fixture(t);
  f.draft.scheduledFor = '2025-01-01';
  f.draft.exercises[0].plannedSets = [{ targetReps: 0, targetWeight: 0 }, { targetReps: 12, targetWeight: 7.25 }];
  f.draft.exercises[0].coachNote = 'Long unsent note. '.repeat(12);
  f.draft.exercises[0].instructionText = 'Technique';
  f.draft.exercises[0].instructionVideo = { id: 'v', name: 'video.mp4', size: 100, mimeType: 'video/mp4', createdAt: '2026-10-26T10:00:00Z' };
  f.put();
  assert.deepEqual(loadWorkoutComposerDraft('plan', 'baseline'), f.draft);
  const blank = { name: '', format: 'online', scheduledFor: '', scheduledTime: '', exercises: [] };
  saveWorkoutComposerDraft('plan', 'baseline', blank);
  assert.deepEqual(loadWorkoutComposerDraft('plan', 'baseline'), blank);
});

test('expiry or baseline changes discard both draft and open picker without touching the source model', t => {
  const f = fixture(t);
  f.put(f.draft, Date.now() - 8 * 24 * 60 * 60 * 1000);
  saveWorkoutPicker('plan', 'start');
  assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
  assert.equal(loadWorkoutPicker('plan'), null);
  f.put();
  saveWorkoutPicker('plan', 'start');
  assert.equal(loadWorkoutComposerDraft('plan', 'new-baseline'), null);
  assert.equal(loadWorkoutPicker('plan'), null);
});

test('a matching baseline cannot make a draft with a missing or invalid timestamp valid', t => {
  const f = fixture(t);
  for (const savedAt of [undefined, 'now', null]) {
    f.put(f.draft, savedAt);
    if (savedAt === undefined) {
      f.values.set('reppy-ui:workout-draft:plan', JSON.stringify({ baseline: 'baseline', value: f.draft }));
    }
    assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
  }
});

test('invalid JSON clears its stale picker while storage denial still leaves the editor usable', t => {
  const f = fixture(t);
  f.values.set('reppy-ui:workout-draft:plan', '{');
  saveWorkoutPicker('plan', 'start');
  assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
  assert.equal(loadWorkoutPicker('plan'), null);
  globalThis.window.localStorage = { getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadWorkoutComposerDraft('plan', 'baseline'), null);
});
