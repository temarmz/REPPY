import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseRepository } from '../app/supabase-repository.ts';
import { createPersistenceQueue } from '../app/persistence-queue.ts';

function fixture({ failTable = 'students', committed = true, role = 'trainer' } = {}) {
  const trainerId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 22, 10, 0, ++clock)).toISOString();
  const student = { id: studentId, account_id: accountId, name: 'Before', phone: null, height_cm: null,
    weight_kg: null, gender: null, contraindications: null, updated_at: stamp() };
  const relationship = { id: crypto.randomUUID(), trainer_id: trainerId, student_id: studentId,
    color: 'lime', status: 'active', updated_at: stamp() };
  const tables = { students: [student], trainer_student_relationships: [relationship], assignments: [],
    workout_sessions: [], set_results: [], subscription_entries: [], exercise_definitions: [] };
  const writes = { students: 0, trainer_student_relationships: 0 };
  let failure = failTable;
  let failReads = false;
  const client = {
    from(table) {
      return {
        select: () => Object.assign(Promise.resolve({ data: structuredClone(tables[table]), error: null }), {
          eq: (_key, id) => ({ maybeSingle: async () => failReads
            ? { data: null, error: { message: 'Failed to fetch' } }
            : { data: structuredClone(tables[table].find((row) => row.id === id) ?? null), error: null } }),
        }),
        update(values) {
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            select: () => ({ maybeSingle: async () => {
              writes[table]++;
              const record = tables[table].find((row) => filters.every(([key, value]) => row[key] === value));
              const fails = failure === table;
              if (record && (!fails || committed)) {
                Object.assign(record, structuredClone(values), { updated_at: stamp() });
                for (const key of ['height_cm', 'weight_kg']) {
                  if (record[key] != null) record[key] = Number(record[key]).toFixed(2);
                }
              }
              if (fails) { failure = null; return { data: null, error: { message: 'Failed to fetch' } }; }
              return { data: record ? { updated_at: record.updated_at } : null, error: null };
            } }),
          };
          return query;
        },
      };
    },
    rpc: async () => ({ data: [], error: null }),
    functions: { invoke: async () => ({ error: null }) },
  };
  return { repository: createSupabaseRepository(client, { id: role === 'trainer' ? trainerId : accountId, role }),
    student, relationship, tables, writes, stamp, set failReads(value) { failReads = value; },
    command(data) { return { type: 'student.update', student: { ...data.students[0], name: 'After', color: 'orange', height: 182.5, weight: 75.25 } }; },
  };
}

for (const failTable of ['students', 'trainer_student_relationships']) {
  for (const committed of [true, false]) {
    test(`${failTable}: recover ${committed ? 'lost acknowledgement' : 'uncommitted request'} without repeating the accepted profile step`, async (t) => {
      const f = fixture({ failTable, committed });
      const data = await f.repository.load();
      const phases = [];
      const queue = createPersistenceQueue(f.repository, (phase) => phases.push(phase));
      t.after(() => queue.dispose());
      queue.enqueue(f.command(data), data);
      await new Promise(setImmediate);
      assert.equal(queue.pendingCount, 1);
      assert.equal(phases.at(-1), 'error');
      queue.retry();
      await new Promise(setImmediate);
      assert.equal(queue.pendingCount, 0);
      assert.equal(phases.at(-1), 'idle');
      assert.equal(f.student.name, 'After');
      assert.equal(f.student.height_cm, '182.50');
      assert.equal(f.relationship.color, 'orange');
      assert.equal(f.writes.students, failTable === 'students' && !committed ? 2 : 1);
      assert.equal(f.writes.trainer_student_relationships, failTable === 'trainer_student_relationships' && !committed ? 2 : 1);
      queue.enqueue({ type: 'student.update', student: { ...f.command(data).student, name: 'Next', color: 'violet' } }, data);
      await new Promise(setImmediate);
      assert.equal(queue.pendingCount, 0);
      assert.equal(f.student.name, 'Next');
      assert.equal(f.relationship.color, 'violet');
    });
  }

  for (const change of ['different-values', 'deleted']) {
    test(`${failTable}: uncertain write does not acknowledge or overwrite ${change}`, async () => {
      const f = fixture({ failTable });
      const data = await f.repository.load();
      const command = f.command(data);
      await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
      const row = failTable === 'students' ? f.student : f.relationship;
      if (change === 'deleted') f.tables[failTable] = [];
      else { Object.assign(row, failTable === 'students' ? { name: 'Other device' } : { color: 'violet' }); row.updated_at = f.stamp(); }
      await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
      assert.equal(f.writes.students, 1);
      assert.equal(f.writes.trainer_student_relationships, failTable === 'students' ? 0 : 1);
    });
  }

  test(`${failTable}: failed reconciliation remains pending for a later retry`, async () => {
    const f = fixture({ failTable });
    const data = await f.repository.load();
    const command = f.command(data);
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failReads = true;
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failReads = false;
    await f.repository.execute(command, data);
    assert.deepEqual(f.writes, { students: 1, trainer_student_relationships: 1 });
  });
}

for (const change of ['values', 'timestamp-only']) {
  test(`a known accepted profile is not rewritten or acknowledged after a concurrent ${change} edit`, async () => {
    const f = fixture({ failTable: 'trainer_student_relationships', committed: false });
    const data = await f.repository.load();
    const command = f.command(data);
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    if (change === 'values') f.student.name = 'Other device';
    f.student.updated_at = f.stamp();
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
    assert.deepEqual(f.writes, { students: 1, trainer_student_relationships: 1 });
  });
}

test('only accepted reload clears a partially saved profile and permits a new edit after conflict', async () => {
  const f = fixture({ failTable: 'trainer_student_relationships' });
  const data = await f.repository.load();
  const command = f.command(data);
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  f.student.updated_at = f.stamp();
  await f.repository.load({ accept: () => false });
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
  const fresh = await f.repository.load();
  await f.repository.execute(f.command(fresh), fresh);
  assert.deepEqual(f.writes, { students: 2, trainer_student_relationships: 2 });
});

test('student profile retry never writes trainer-only relationship color', async () => {
  const f = fixture({ role: 'student' });
  const data = await f.repository.load();
  const command = f.command(data);
  await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
  await f.repository.execute(command, data);
  assert.deepEqual(f.writes, { students: 1, trainer_student_relationships: 0 });
  assert.equal(f.relationship.color, 'lime');
});
