import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseRepository } from '../app/supabase-repository.ts';
import { createPersistenceQueue } from '../app/persistence-queue.ts';

function fixture(kind, { committed = true } = {}) {
  const studentId = crypto.randomUUID();
  const relationshipId = crypto.randomUUID();
  const trainerId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const table = kind === 'assignment' ? 'assignments' : 'subscription_entries';
  const row = kind === 'assignment'
    ? { id, relationship_id: relationshipId, revision: 1, assigned_at: '2026-10-22T10:00:00Z',
      scheduled_for: '2026-10-23', scheduled_time: '18:30:00', format: 'in-person', status: 'assigned',
      timezone: 'UTC', workout_snapshot: { id: crypto.randomUUID(), name: 'Original', exercises: [] },
      repeated_from_assignment_id: null, reschedule_scheduled_for: null, reschedule_scheduled_time: null, reschedule_requested_at: null }
    : { id, relationship_id: relationshipId, revision: 1, kind: 'payment', lesson_delta: 2,
      occurred_at: '2026-10-22T10:00:00+00:00', created_at: '2026-10-22T10:00:00+00:00',
      amount_rub: '1000.00', payment_method: 'cash', comment: null };
  const tables = { students: [{ id: studentId, name: 'Student' }],
    trainer_student_relationships: [{ id: relationshipId, student_id: studentId, trainer_id: trainerId, status: 'active', color: 'lime' }],
    assignments: [], subscription_entries: [], workout_sessions: [], set_results: [], exercise_definitions: [] };
  tables[table] = [row];
  let writes = 0;
  let reads = 0;
  let failRead = false;
  const client = {
    from(name) {
      return {
        select: () => Object.assign(Promise.resolve({ data: structuredClone(tables[name]), error: null }), {
          eq: (_key, value) => ({ maybeSingle: async () => {
            reads++;
            if (failRead) return { data: null, error: { message: 'Failed to fetch' } };
            return { data: structuredClone(tables[name].find((item) => item.id === value) ?? null), error: null };
          } }),
        }),
        update(values) {
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            select: () => ({ maybeSingle: async () => {
              writes++;
              const record = tables[name].find((item) => filters.every(([key, value]) => item[key] === value));
              if (record && (writes > 1 || committed)) {
                Object.assign(record, structuredClone(values));
                record.revision++;
                // PostgREST serializes timestamps/numerics differently from the input.
                if (record.occurred_at) record.occurred_at = new Date(record.occurred_at).toISOString().replace('Z', '+00:00');
                if (record.amount_rub !== undefined) record.amount_rub = Number(record.amount_rub).toFixed(2);
              }
              if (writes === 1) return { data: null, error: { message: 'Failed to fetch' } };
              return { data: record ? { revision: record.revision } : null, error: null };
            } }),
          };
          return query;
        },
      };
    },
    rpc: async () => ({ data: structuredClone(tables.subscription_entries), error: null }),
    functions: { invoke: async () => ({ error: null }) },
  };
  const repository = createSupabaseRepository(client, { id: trainerId, role: 'trainer' });
  return { repository, row, tables, table, get writes() { return writes; }, get reads() { return reads; },
    set failRead(value) { failRead = value; },
    command(data) {
      if (kind === 'assignment') {
        const assignment = data.assignments[0];
        assignment.workoutSnapshot.name = 'Updated';
        assignment.rescheduleRequest = { scheduledFor: '2026-10-24', scheduledTime: '19:00', requestedAt: '2026-10-22T11:00:00.000Z' };
        return { type: 'assignment.update', assignment };
      }
      const entry = data.subscriptionEntries[0];
      Object.assign(entry, { lessonDelta: 5, amountRub: 2500.5, occurredAt: '2026-10-22T12:00:00.000Z', comment: 'Updated' });
      return { type: 'subscription.payment.update', entry };
    },
  };
}

for (const kind of ['assignment', 'payment']) {
  for (const committed of [true, false]) {
    test(`${kind}: retry ${committed ? 'recognizes a committed update' : 'saves an uncommitted update'} and releases the queue`, async (t) => {
      const f = fixture(kind, { committed });
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
      assert.equal(f.row.revision, 2);
      assert.equal(f.writes, committed ? 1 : 2);
    });
  }

  for (const change of ['different-values', 'later-revision', 'deleted']) {
    test(`${kind}: uncertain update does not acknowledge or overwrite ${change}`, async () => {
      const f = fixture(kind);
      const data = await f.repository.load();
      const command = f.command(data);
      await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
      if (change === 'different-values') {
        if (kind === 'assignment') f.row.workout_snapshot.name = 'Other device';
        else f.row.amount_rub = '999.00';
      } else if (change === 'later-revision') f.row.revision++;
      else f.tables[f.table] = [];
      await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
      assert.equal(f.writes, 1);
    });
  }

  test(`${kind}: a failed reconciliation stays pending and can be retried`, async () => {
    const f = fixture(kind);
    const data = await f.repository.load();
    const command = f.command(data);
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failRead = true;
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.failRead = false;
    await f.repository.execute(command, data);
    assert.equal(f.writes, 1);
    assert.equal(f.reads, 2);
  });

  test(`${kind}: only an accepted reload clears uncertainty and permits new edits after conflict`, async () => {
    const f = fixture(kind);
    const data = await f.repository.load();
    const command = f.command(data);
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_NETWORK' });
    f.row.revision++;
    await f.repository.load({ accept: () => false });
    await assert.rejects(f.repository.execute(command, data), { code: 'REPPY_CONFLICT' });
    const fresh = await f.repository.load();
    await f.repository.execute(f.command(fresh), fresh);
    assert.equal(f.row.revision, 4);
    assert.equal(f.writes, 2);
  });
}
