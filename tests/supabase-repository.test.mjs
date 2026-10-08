import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseRepository } from '../app/supabase-repository.ts';
import { createWorkoutSession, updateSessionWorkout } from '../app/reppy-data.ts';

function assignedWorkoutClient({ active = false } = {}) {
  const studentId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const trainerId = crypto.randomUUID();
  const relationshipId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();
  const instanceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const workout = {
    id: crypto.randomUUID(), name: 'Тренировка', updatedAt: new Date().toISOString(),
    exercises: [{ id: instanceId, exerciseId: definitionId, name: 'Упражнение тренера',
      loadMode: 'external', measureType: 'reps', plannedSets: [
        { targetReps: 10, targetWeight: 40 }, { targetReps: 8, targetWeight: 45 }, { targetReps: 6, targetWeight: 50 },
      ] }],
  };
  const tables = {
    students: [{ id: studentId, account_id: accountId, name: 'Ученик' }],
    trainer_student_relationships: [{ id: relationshipId, trainer_id: trainerId, student_id: studentId, status: 'active', color: 'lime' }],
    assignments: [{ id: assignmentId, relationship_id: relationshipId, assigned_at: new Date().toISOString(),
      scheduled_for: '2026-10-07', format: 'online', status: 'assigned', revision: 1, workout_snapshot: workout }],
    workout_sessions: active ? [{ id: sessionId, assignment_id: assignmentId, recorded_by_role: 'student',
      revision: 1, started_at: new Date().toISOString(), workout_snapshot: workout }] : [],
    // RLS hides the trainer's private definition. Only its assigned snapshot is visible.
    exercise_definitions: [], set_results: [], subscription_entries: [],
  };
  const calls = [];
  const client = {
    from(table) {
      return {
        select: async () => ({ data: tables[table], error: null }),
        insert: async () => { throw new Error(`Unexpected insert into ${table}`); },
      };
    },
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: { id: payload.p_session_id, revision: calls.length + 1 }, error: null };
    },
    functions: { invoke: async () => ({ error: null }) },
  };
  return { client, tables, repository: createSupabaseRepository(client, { id: accountId, role: 'student' }), calls, definitionId, instanceId };
}

test('ученик запускает тренировку с личным упражнением тренера, сохраняя исходные UUID', async () => {
  const { repository, calls, definitionId, instanceId } = assignedWorkoutClient();
  const data = await repository.load();
  const assignment = data.assignments[0];
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'student');
  data.sessions.push(session);
  await repository.execute({ type: 'session.start', session }, data);
  const save = calls.find((call) => call.name === 'save_session_progress');
  assert.equal(save.payload.p_workout_snapshot.exercises[0].exerciseId, definitionId);
  assert.equal(save.payload.p_workout_snapshot.exercises[0].id, instanceId);
  assert.equal(save.payload.p_results.length, 3);
  assert.ok(save.payload.p_results.every((result) => result.exerciseInstanceId === instanceId));
});

for (const changedElsewhere of [false, true]) {
  test(`потерянный ответ сохранения: ${changedElsewhere ? 'чужие изменения защищены' : 'принятая запись не повторяется'}`, async () => {
    const { client, tables, repository } = assignedWorkoutClient({ active: true });
    const data = await repository.load();
    const session = data.sessions[0];
    let writes = 0;
    client.rpc = async (_, payload) => {
      writes++;
      tables.workout_sessions[0].revision = 2;
      tables.workout_sessions[0].workout_snapshot = structuredClone(payload.p_workout_snapshot);
      if (changedElsewhere) tables.workout_sessions[0].workout_snapshot.name = 'Изменено тренером';
      tables.set_results = payload.p_results.map((row) => ({ exercise_instance_id: row.exerciseInstanceId,
        set_number: row.setNumber, actual_reps: row.actualReps, actual_weight: row.actualWeight, completed: row.completed }));
      return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    };
    await assert.rejects(repository.execute({ type: 'session.progress', sessionId: session.id }, data), { code: 'REPPY_NETWORK' });
    client.from = (table) => ({ select: () => ({ eq: () => table === 'workout_sessions'
      ? { single: async () => ({ data: tables[table][0], error: null }) }
      : Promise.resolve({ data: tables[table], error: null }) }) });
    const retry = repository.execute({ type: 'session.progress', sessionId: session.id }, data);
    if (changedElsewhere) await assert.rejects(retry, { code: 'REPPY_CONFLICT' });
    else await retry;
    assert.equal(writes, 1);
  });
}

test('загрузка, перекрытая локальной правкой, не подменяет её базовую ревизию', async () => {
  const { client, tables, repository } = assignedWorkoutClient({ active: true });
  const data = await repository.load();
  tables.workout_sessions[0].revision = 2; // A real update from the trainer.
  await repository.load({ accept: () => false });
  client.rpc = async (_, payload) => {
    assert.equal(payload.p_expected_revision, 1);
    return { data: null, error: { code: '40001', message: 'Session revision conflict' } };
  };
  await assert.rejects(repository.execute({ type: 'session.progress', sessionId: data.sessions[0].id }, data), { code: 'REPPY_CONFLICT' });
});

test('после потерянного ответа и конфликта принятая загрузка разрешает новые правки', async () => {
  const { client, tables, repository } = assignedWorkoutClient({ active: true });
  const data = await repository.load();
  const sessionId = data.sessions[0].id;
  client.rpc = async () => ({ data: null, error: { message: 'Failed to fetch' } });
  await assert.rejects(repository.execute({ type: 'session.progress', sessionId }, data), { code: 'REPPY_NETWORK' });
  tables.workout_sessions[0].revision = 2;
  tables.workout_sessions[0].workout_snapshot.name = 'Изменено тренером';
  // Support both full loads and reconciliation queries.
  client.from = (table) => ({ select: () => Object.assign(Promise.resolve({ data: tables[table], error: null }), {
    eq: () => table === 'workout_sessions'
      ? { single: async () => ({ data: tables[table][0], error: null }) }
      : Promise.resolve({ data: tables[table], error: null }),
  }) });
  await repository.load({ accept: () => false });
  await assert.rejects(repository.execute({ type: 'session.progress', sessionId }, data), { code: 'REPPY_CONFLICT' });
  const refreshed = await repository.load();
  refreshed.sessions[0].workoutSnapshot.name = 'Новая правка ученика';
  let writes = 0;
  client.rpc = async (_, payload) => {
    writes++;
    assert.equal(payload.p_expected_revision, 2);
    assert.equal(payload.p_workout_snapshot.name, 'Новая правка ученика');
    return { data: { revision: 3 }, error: null };
  };
  await repository.execute({ type: 'session.progress', sessionId }, refreshed);
  assert.equal(writes, 1);
});

test('ученик сохраняет дробный вес и пустой добавленный подход без записи в библиотеку', async () => {
  const { repository, calls, definitionId } = assignedWorkoutClient({ active: true });
  const data = await repository.load();
  const previous = data.sessions[0];
  const snapshot = structuredClone(previous.workoutSnapshot);
  // A session left without results must grow from the displayed zero, not its old plan.
  snapshot.exercises[0].plannedSets = [{ targetReps: 0, targetWeight: 0 }];
  const session = updateSessionWorkout(previous, snapshot);
  assert.equal(session.results.length, 1);
  assert.equal(session.results[0].actualReps, 0);
  assert.equal(session.results[0].actualWeight, 0);
  session.results[0].actualWeight = 2.5;
  session.results[0].actualReps = 8;
  data.sessions[0] = session;
  await repository.execute({ type: 'session.progress', sessionId: session.id }, data);
  assert.equal(calls[0].payload.p_workout_snapshot.exercises[0].exerciseId, definitionId);
  assert.equal(calls[0].payload.p_results.length, 1);
  assert.equal(calls[0].payload.p_results[0].actualWeight, 2.5);
});
