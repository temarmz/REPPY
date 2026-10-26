import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUiDraft, saveUiDraft } from '../app/ui-persistence.ts';

function fixture(t) {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return values;
}

for (const raw of ['{', 'null', '[]', 'true', '{"savedAt":1e400,"value":{}}',
  JSON.stringify({ savedAt: 0, value: {} }), JSON.stringify({ savedAt: Date.now() }),
  ...[null, [], true, 42, 'draft'].map(value => JSON.stringify({ savedAt: Date.now(), value }))]) {
  test(`invalid UI draft envelope is discarded, not unrelated drafts: ${raw}`, t => {
    const values = fixture(t);
    saveUiDraft('other-account', { name: 'Private draft' });
    values.set('reppy-demo-v0', 'confirmed state');
    values.set('reppy-ui:draft:broken', raw);
    assert.equal(loadUiDraft('broken'), null);
    assert.equal(values.has('reppy-ui:draft:broken'), false);
    assert.deepEqual(loadUiDraft('other-account'), { name: 'Private draft' });
    assert.equal(values.get('reppy-demo-v0'), 'confirmed state');
  });
}

test('valid partial and empty UI draft records retain all values without normalization', t => {
  fixture(t);
  for (const value of [{}, { name: '' }, { amountRub: '0', lessons: '', comment: '  unfinished note  ' }, { editing: false, mood: null }]) {
    saveUiDraft('form', value);
    assert.deepEqual(loadUiDraft('form'), value);
  }
});

test('storage read and cleanup denial do not escape recovery', t => {
  fixture(t);
  globalThis.window.localStorage = { getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadUiDraft('form'), null);
  globalThis.window.localStorage.getItem = () => '{';
  assert.equal(loadUiDraft('form'), null);
});
