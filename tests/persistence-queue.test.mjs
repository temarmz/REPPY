import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersistenceQueue } from '../app/persistence-queue.ts';
import { createBoundedFetch } from '../app/bounded-fetch.ts';
import { getPersistenceDiagnostics, recordPersistence } from '../app/persistence-diagnostics.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const progress = (id = 'session') => ({ type: 'session.progress', sessionId: id });

test('быстрые правки объединяются, а загрузка ждёт подтверждения записи', async () => {
  const gate = deferred();
  const calls = [];
  const queue = createPersistenceQueue({
    execute: async (_, state) => { calls.push(['save', state.value]); await gate.promise; },
    load: async () => { calls.push(['load']); return {}; },
  }, () => {}, { debounceMs: 50 });
  queue.enqueue(progress(), { value: 2 });
  queue.enqueue(progress(), { value: 25 });
  const read = queue.load();
  await tick();
  assert.deepEqual(calls, [['save', 25]]);
  gate.resolve();
  await read;
  assert.deepEqual(calls, [['save', 25], ['load']]);
  queue.dispose();
});

test('правки во время фоновой загрузки записываются после неё', async () => {
  const gate = deferred();
  const calls = [];
  const queue = createPersistenceQueue({
    load: async () => { calls.push('read'); await gate.promise; return {}; },
    execute: async () => { calls.push('write'); },
  }, () => {}, { debounceMs: 0 });
  const read = queue.load();
  await tick();
  queue.enqueue(progress(), {});
  await tick();
  assert.deepEqual(calls, ['read']);
  gate.resolve();
  await read;
  await tick();
  assert.deepEqual(calls, ['read', 'write']);
  queue.dispose();
});

test('фоновая загрузка не принимает ревизии, если пользователь начал правку', async () => {
  const gate = deferred();
  let accepted;
  const queue = createPersistenceQueue({
    load: async ({ accept }) => { await gate.promise; accepted = accept(); return {}; },
    execute: async () => {},
  }, () => {}, { debounceMs: 0 });
  const read = queue.load();
  await tick();
  queue.enqueue(progress(), {});
  gate.resolve();
  await read;
  assert.equal(accepted, false);
  await tick();
  queue.dispose();
});

test('повтор после временной ошибки сохраняет исходную запись, затем последнюю правку', async () => {
  const writes = [];
  const states = [];
  let queue;
  queue = createPersistenceQueue({
    execute: async (_, state) => {
      writes.push(state.value);
      if (writes.length === 1) {
        queue.enqueue(progress(), { value: 30 });
        throw Object.assign(new Error('Failed to fetch'), { code: 'REPPY_NETWORK' });
      }
    },
  }, (phase) => states.push(phase), { debounceMs: 0, retryMs: 1 });
  queue.enqueue(progress(), { value: 25 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(writes, [25, 25, 30]);
  assert.equal(states.at(-1), 'idle');
  assert.equal(queue.pendingCount, 0);
  queue.dispose();
});

test('настоящий конфликт останавливает очередь и не разрешает фоновую загрузку', async () => {
  let writes = 0;
  let reads = 0;
  const error = Object.assign(new Error('Conflict'), { code: 'REPPY_CONFLICT' });
  const queue = createPersistenceQueue({ execute: async () => { writes++; throw error; }, load: async () => { reads++; } }, () => {}, { debounceMs: 0 });
  queue.enqueue(progress(), {});
  await tick();
  await assert.rejects(queue.load(), (reason) => reason === error);
  queue.resume();
  await tick();
  assert.equal(writes, 1);
  assert.equal(reads, 0);
  queue.dispose();
});

test('оплаты не повторяются автоматически при потерянном ответе', async () => {
  let writes = 0;
  const queue = createPersistenceQueue({ execute: async () => { writes++; throw new Error('Failed to fetch'); } }, () => {}, { retryMs: 1 });
  queue.enqueue({ type: 'subscription.payment.create' }, {});
  await tick();
  assert.equal(writes, 1);
  assert.equal(queue.pendingCount, 1);
  queue.dispose();
});

test('после смены аккаунта старая очередь не выполняет следующие команды', async () => {
  const gate = deferred();
  const writes = [];
  const phases = [];
  const queue = createPersistenceQueue({ execute: async (_, state) => { writes.push(state.value); await gate.promise; } }, (phase) => phases.push(phase), { debounceMs: 0 });
  queue.enqueue(progress(), { value: 1 });
  await tick();
  queue.enqueue(progress(), { value: 2 });
  queue.dispose();
  gate.resolve();
  await tick();
  assert.deepEqual(writes, [1]);
  assert.ok(!phases.includes('idle'));
});

test('явная загрузка актуальных данных ждёт окончания отменённой очереди', async () => {
  const gate = deferred();
  const calls = [];
  const queue = createPersistenceQueue({
    execute: async () => { calls.push('write'); await gate.promise; throw new Error('Failed to fetch'); },
    load: async () => { calls.push('read'); return {}; },
  }, () => {}, { debounceMs: 0 });
  queue.enqueue(progress(), {});
  await tick();
  queue.discard();
  const read = queue.load();
  gate.resolve();
  await read;
  assert.deepEqual(calls, ['write', 'read']);
  queue.dispose();
});

test('deadline обрывает зависший запрос и медленное тело ответа', async () => {
  const fetcher = async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  await assert.rejects(createBoundedFetch(fetcher, 5)('https://example.test/rest/v1/rpc/save'), { code: 'REPPY_TIMEOUT' });
  const headersOnly = async (_, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true }); },
  }));
  await assert.rejects(createBoundedFetch(headersOnly, 5)('https://example.test/rest/v1/table'), { code: 'REPPY_TIMEOUT' });
});

test('deadline сохраняет отмену вызывающего и обычный JSON ответ', async () => {
  const abort = new AbortController();
  const fetcher = async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  const pending = createBoundedFetch(fetcher, 1000)('https://example.test/auth/v1/token', { signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  const response = await createBoundedFetch(async () => Response.json({ saved: true }), 5)('https://example.test/rest/v1/table');
  assert.deepEqual(await response.json(), { saved: true });
});

test('журнал не включает сообщения, содержимое тренировки или токены', () => {
  recordPersistence('session.progress', 'error', performance.now(), Object.assign(new Error('private-weight-123 secret-token'), {
    code: 'REPPY_NETWORK', body: { weight: 123 }, token: 'secret-token',
  }));
  const log = JSON.stringify(getPersistenceDiagnostics());
  assert.ok(log.includes('REPPY_NETWORK'));
  assert.ok(!log.includes('private-weight-123'));
  assert.ok(!log.includes('secret-token'));
  assert.ok(!log.includes('weight'));
});
