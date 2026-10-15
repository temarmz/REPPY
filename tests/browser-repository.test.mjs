import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserRepository } from '../app/browser-repository.ts';

test('browser repository defers blocked localStorage access to the recoverable load path', async () => {
  let accessed = false;
  const repository = createBrowserRepository(() => {
    accessed = true;
    throw new DOMException('Storage access is denied', 'SecurityError');
  });

  assert.equal(accessed, false);
  await assert.rejects(repository.load(), { name: 'SecurityError' });
  assert.equal(accessed, true);
});
