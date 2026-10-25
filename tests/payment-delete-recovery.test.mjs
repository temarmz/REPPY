import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseRepository } from '../app/supabase-repository.ts';
import { createPersistenceQueue } from '../app/persistence-queue.ts';

function fixture({ committed = true, role = 'trainer', definitive = false } = {}) {
  const trainerId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const relationship = { id: crypto.randomUUID(), trainer_id: trainerId, student_id: studentId, status: 'active', color: 'lime' };
  const payment = { id: crypto.randomUUID(), relationship_id: relationship.id, revision: 1, kind: 'payment', lesson_delta: 2,
    occurred_at: '2026-10-25T10:00:00Z', created_at: '2026-10-25T10:00:00Z', amount_rub: '1000.00', payment_method: 'cash', comment: null };
  const nextPayment = { ...payment, id: crypto.randomUUID() };
  const tables = { trainer_student_relationships: [relationship], students: [{ id: studentId, name: 'Student' }],
    subscription_entries: [payment, nextPayment], assignments: [], workout_sessions: [], set_results: [], exercise_definitions: [] };
  let deletes = 0;
  let failRead = null;
  let reads = 0;
  let currentUserId = trainerId;
  let failAuth = false;
  const client = {
    auth: { getUser: async () => failAuth ? { data: { user: null }, error: { message: 'Failed to fetch' } }
      : { data: { user: { id: currentUserId } }, error: null } },
    from(table) {
      return {
        async upsert(row) {
          if (!tables[table].some(item => item.id === row.id)) tables[table].push({ ...row, revision: 1, created_at: '2026-10-25T11:00:00Z' });
          return { error: null };
        },
        select() {
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            async maybeSingle() {
              reads++;
              if (table === failRead) return { data: null, error: { message: 'Failed to fetch' } };
              return { data: structuredClone(tables[table].find(row => filters.every(([key, value]) => row[key] === value)) ?? null), error: null };
            },
            then(resolve, reject) { return Promise.resolve({ data: structuredClone(tables[table]), error: null }).then(resolve, reject); },
          };
          return query;
        },
      };
    },
    async rpc(name, args) {
      if (name === 'get_trainer_subscription_entries') return { data: structuredClone(tables.subscription_entries), error: null };
      assert.equal(name, 'delete_subscription_payment');
      deletes++;
      if (definitive) return { error: { code: '40001', message: 'Changed or access denied' } };
      const index = tables.subscription_entries.findIndex(row => row.id === args.p_entry_id && row.revision === args.p_expected_revision
        && row.kind === 'payment' && row.relationship_id === relationship.id && relationship.trainer_id === trainerId && relationship.status !== 'archived');
      if (index < 0) return { error: { code: '40001', message: 'Changed or access denied' } };
      if (deletes > 1 || committed) tables.subscription_entries.splice(index, 1);
      return deletes === 1 ? { error: { message: 'Failed to fetch' } } : { error: null };
    },
    functions: { invoke: async () => ({ error: null }) },
  };
  return { repository: createSupabaseRepository(client, { id: trainerId, role }), tables, payment, nextPayment, relationship,
    get deletes() { return deletes; }, get reads() { return reads; }, set failRead(value) { failRead = value; },
    set currentUserId(value) { currentUserId = value; }, set failAuth(value) { failAuth = value; } };
}

for (const committed of [true, false]) {
  test(`payment delete ${committed ? 'lost acknowledgement' : 'uncommitted request'} releases the queue and preserves the next command`, async t => {
    const f = fixture({ committed });
    const data = await f.repository.load();
    const phases = [];
    const queue = createPersistenceQueue(f.repository, phase => phases.push(phase));
    t.after(() => queue.dispose());
    queue.enqueue({ type: 'subscription.payment.delete', entryId: f.payment.id }, data);
    await new Promise(setImmediate);
    assert.equal(queue.pendingCount, 1);
    assert.equal(phases.at(-1), 'error');
    queue.retry();
    await new Promise(setImmediate);
    assert.equal(queue.pendingCount, 0);
    assert.equal(phases.at(-1), 'idle');
    assert.equal(f.deletes, committed ? 1 : 2);
    assert.deepEqual(f.tables.subscription_entries.map(row => row.id), [f.nextPayment.id]);
    queue.enqueue({ type: 'subscription.payment.delete', entryId: f.nextPayment.id }, data);
    await new Promise(setImmediate);
    assert.equal(queue.pendingCount, 0);
    assert.deepEqual(f.tables.subscription_entries, []);
  });
}

for (const change of ['archived', 'other-trainer', 'missing-relationship', 'revision', 'relationship', 'kind']) {
  test(`uncertain payment deletion does not acknowledge or delete after ${change}`, async () => {
    const f = fixture({ committed: !['revision', 'relationship', 'kind'].includes(change) });
    const data = await f.repository.load();
    const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    if (change === 'archived') f.relationship.status = 'archived';
    else if (change === 'other-trainer') f.relationship.trainer_id = crypto.randomUUID();
    else if (change === 'missing-relationship') f.tables.trainer_student_relationships = [];
    else if (change === 'revision') f.payment.revision++;
    else if (change === 'relationship') f.payment.relationship_id = crypto.randomUUID();
    else f.payment.kind = 'charge';
    const before = structuredClone(f.tables.subscription_entries);
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
    assert.equal(f.deletes, 1);
    assert.deepEqual(f.tables.subscription_entries, before);
  });
}

for (const table of ['subscription_entries', 'trainer_student_relationships']) {
  test(`failed ${table} reconciliation stays pending until a successful retry`, async () => {
    const f = fixture();
    const data = await f.repository.load();
    const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failRead = table;
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failRead = null;
    await f.repository.execute(command, data);
    assert.equal(f.deletes, 1);
  });
}

test('only accepted reload discards an uncertain delete baseline', async () => {
  const f = fixture();
  const data = await f.repository.load();
  const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  await f.repository.load({ accept: () => false });
  await f.repository.execute(command, data);
  assert.equal(f.deletes, 1);
  // Use a separate uncertainty after the successful recovery.
  const g = fixture();
  const otherData = await g.repository.load();
  const next = { type: 'subscription.payment.delete', entryId: g.payment.id };
  await assert.rejects(g.repository.execute(next, otherData), { code: 'REPPY_NETWORK' });
  await g.repository.load();
  await assert.rejects(g.repository.execute(next, otherData), { code: 'REPPY_CONFLICT' });
});

test('definitive conflicts and student requests never enter missing-row recovery', async () => {
  const f = fixture({ definitive: true });
  const data = await f.repository.load();
  const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
  f.tables.subscription_entries = [];
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
  assert.equal(f.reads, 0);
  const student = fixture({ role: 'student' });
  const studentData = await student.repository.load();
  await assert.rejects(student.repository.execute({ ...command, entryId: student.payment.id }, studentData), /Только тренер/);
  assert.equal(student.deletes, 0);
});

test('a related student who can read the same relationship cannot acknowledge the previous trainer delete', async () => {
  const f = fixture();
  const data = await f.repository.load();
  const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  f.currentUserId = crypto.randomUUID();
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
  assert.equal(f.deletes, 1);
});

test('failed Auth verification does not falsely acknowledge deletion and can be retried', async () => {
  const f = fixture();
  const data = await f.repository.load();
  const command = { type: 'subscription.payment.delete', entryId: f.payment.id };
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  f.failAuth = true;
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  f.failAuth = false;
  await f.repository.execute(command, data);
  assert.equal(f.deletes, 1);
});

test('a newly created payment can recover deletion before any reload maps its remote ID', async () => {
  const f = fixture();
  const data = await f.repository.load();
  const entry = { ...data.subscriptionEntries[0], id: 'new-local-payment' };
  await f.repository.execute({ type: 'subscription.payment.create', entry }, data);
  const command = { type: 'subscription.payment.delete', entryId: entry.id };
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  await f.repository.execute(command, data);
  assert.equal(f.deletes, 1);
  assert.deepEqual(f.tables.subscription_entries.map(row => row.id), [f.payment.id, f.nextPayment.id]);
});
