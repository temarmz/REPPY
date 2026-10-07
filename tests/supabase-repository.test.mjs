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
  return { repository: createSupabaseRepository(client, { id: accountId, role: 'student' }), calls, definitionId, instanceId };
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
