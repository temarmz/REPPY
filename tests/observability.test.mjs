import test from 'node:test';
import assert from 'node:assert/strict';
import { observeHandler } from '../supabase/functions/_shared/observability.ts';

test('server logs sanitize failure and correlate request and release', async () => {
  const original = console.error; const logs = []; console.error = value => logs.push(value);
  try {
    const id = crypto.randomUUID(); const release = 'a'.repeat(40) + '-123-1';
    const handler = observeHandler('test', async () => { throw new Error('Bearer secret person@example.com https://private'); });
    const response = await handler(new Request('https://example.test?token=private', { headers: { 'x-client-info': `reppy/${release} request/${id}`, authorization: 'Bearer secret' } }));
    assert.equal(response.status, 500);
    const entry = JSON.parse(logs[0]);
    assert.equal(entry.clientRequestId, id); assert.equal(entry.release, release);
    assert.equal(response.headers.get('x-reppy-operation-id'), entry.operationId);
    assert.ok(!logs.join('').includes('secret')); assert.ok(!logs.join('').includes('private')); assert.ok(!logs.join('').includes('@'));
  } finally { console.error = original; }
});
