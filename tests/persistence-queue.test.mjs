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

test('отмена во время паузы автоповтора не отправляет отменённую запись', async () => {
  const calls = [];
  const queue = createPersistenceQueue({
    execute: async () => { calls.push('write'); throw new Error('Failed to fetch'); },
    load: async () => { calls.push('read'); return {}; },
  }, () => {}, { debounceMs: 0, retryMs: 80 });
  queue.enqueue(progress(), {});
  await tick();
  queue.discard();
  await queue.load();
  assert.deepEqual(calls, ['write', 'read']);
  queue.dispose();
});

test('закрытие очереди прерывает паузу автоповтора', async () => {
  let writes = 0;
  const queue = createPersistenceQueue({
    execute: async () => { writes++; throw new Error('Failed to fetch'); },
  }, () => {}, { debounceMs: 0, retryMs: 80 });
  queue.enqueue(progress(), {});
  await tick();
  queue.dispose();
  await tick();
  assert.equal(writes, 1);
  assert.equal(queue.pendingCount, 0);
});

test('отменённый автоповтор не удаляет новую команду из очереди', async () => {
  const writes = [];
  const queue = createPersistenceQueue({ execute: async (_, state) => {
    writes.push(state.value);
    if (state.value === 1) throw new Error('Failed to fetch');
  } }, () => {}, { debounceMs: 0, retryMs: 80 });
  queue.enqueue(progress(), { value: 1 });
  await tick();
  queue.discard();
  queue.enqueue(progress(), { value: 2 });
  await tick();
  assert.deepEqual(writes, [1, 2]);
  assert.equal(queue.pendingCount, 0);
  queue.dispose();
});

test('deadline обрывает зависший запрос и медленное тело ответа', async () => {
  const fetcher = async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  await assert.rejects(createBoundedFetch(fetcher, 5)('https://example.test/rest/v1/rpc/save'), { code: 'REPPY_TIMEOUT' });
  await assert.rejects(createBoundedFetch(fetcher, 5)('https://example.test/functions/v1/telegram-auth'), { code: 'REPPY_TIMEOUT' });
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

test('hung save is observable without allowing another write or retry', async () => {
  const gate = deferred(); let writes = 0;
  const queue = createPersistenceQueue({ execute: async () => { writes++; await gate.promise; } }, () => {}, { pendingMs: 5 });
  queue.enqueue({ type: 'student.update' }, {});
  await new Promise(r => setTimeout(r, 20));
  queue.enqueue({ type: 'student.update' }, {}); queue.retry();
  const pending = getPersistenceDiagnostics().findLast(e => e.operation === 'student.update' && e.outcome === 'pending');
  assert.ok(pending?.operationId); assert.equal(writes, 1); assert.equal(queue.pendingCount, 2);
  gate.resolve(); await tick(); queue.dispose();
  const success = getPersistenceDiagnostics().find(e => e.operationId === pending.operationId && e.outcome === 'success');
  assert.ok(success);
});

test('diagnostics reject free-text operation, error code and message', () => {
  recordPersistence('student.update', 'error', performance.now(), { code: 'SECRET_TOKEN', message: 'person@example.com bearer-secret' });
  recordPersistence('person@example.com', 'error', performance.now());
  const serialized = JSON.stringify(getPersistenceDiagnostics());
  assert.ok(!serialized.includes('person@example.com')); assert.ok(!serialized.includes('bearer-secret')); assert.ok(!serialized.includes('SECRET_TOKEN'));
});

test('bounded fetch preserves headers and links server response to safe request ID', async () => {
  let headers;
  const serverId = crypto.randomUUID();
  const bounded = createBoundedFetch(async (_, init) => { headers = init.headers; return new Response('{}', { status: 503, headers: { 'sb-request-id': serverId } }); });
  await bounded('https://example.test/rest/v1/profiles?email=private', { headers: { authorization: 'Bearer SECRET', apikey: 'KEY' } });
  assert.equal(headers.get('authorization'), 'Bearer SECRET');
  const operationId = headers.get('x-client-info').split('request/')[1];
  const event = getPersistenceDiagnostics().findLast(e => e.requestId === serverId);
  assert.equal(event.operationId, operationId); assert.equal(event.code, 'HTTP_503');
  assert.ok(!JSON.stringify(event).includes('private')); assert.ok(!JSON.stringify(event).includes('SECRET'));
});
