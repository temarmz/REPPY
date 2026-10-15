import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../app/reppy-data.ts';
import { createBrowserRepository } from '../app/browser-repository.ts';

test('browser repository keeps the current session usable when localStorage is blocked', async () => {
  const repository = createBrowserRepository(() => {
    throw new DOMException('Storage access is denied', 'SecurityError');
  });
  const state = createInitialState();
  state.students.push({ ...state.students[0], id: 'local-storage-fallback-test', name: 'Edited in this tab' });

  await repository.save(state);

  const loaded = await repository.load();
  assert.equal(loaded.students.find((student) => student.id === 'local-storage-fallback-test')?.name, 'Edited in this tab');
});
