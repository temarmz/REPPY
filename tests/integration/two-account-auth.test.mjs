import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../app/supabase-repository.ts';
import { updateSessionWorkout } from '../../app/reppy-data.ts';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = (key = anonKey) => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertSuccess(result, label) {
  assert.ifError(result.error, `${label}: ${result.error?.message}`);
  return result.data;
}

async function createTrainer(admin, email, displayName) {
  const result = await admin.auth.admin.createUser({
    email,
    password: 'Integration-test-password-2026!',
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { reppy_role: 'trainer' },
  });
  return assertSuccess(result, `create trainer ${email}`).user;
}

async function signIn(email) {
  const supabase = client();
  assertSuccess(await supabase.auth.signInWithPassword({
    email,
    password: 'Integration-test-password-2026!',
  }), `sign in ${email}`);
  return supabase;
}

test('trainer invitation, student registration and workout lifecycle obey RLS', async (t) => {
  assert.ok(url && anonKey && serviceRoleKey, 'Supabase integration environment is required');

  const admin = client(serviceRoleKey);
  const suffix = crypto.randomUUID();
  const trainerEmail = `trainer-${suffix}@example.com`;
  const studentEmail = `student-${suffix}@example.com`;
  const outsiderEmail = `outsider-${suffix}@example.com`;
  const createdUserIds = [];

  t.after(async () => {
    await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  const trainerUser = await createTrainer(admin, trainerEmail, 'Тестовый тренер');
  createdUserIds.push(trainerUser.id);
  const outsiderUser = await createTrainer(admin, outsiderEmail, 'Чужой тренер');
  createdUserIds.push(outsiderUser.id);

  const trainer = await signIn(trainerEmail);
  const outsider = await signIn(outsiderEmail);
  const trainerProfile = assertSuccess(
    await trainer.from('profiles').select('id, role, display_name').eq('id', trainerUser.id).single(),
    'load trainer profile',
  );
  assert.deepEqual(trainerProfile, {
    id: trainerUser.id,
    role: 'trainer',
    display_name: 'Тестовый тренер',
  });

  const invitation = assertSuccess(await trainer.rpc('create_student_with_invitation', {
    p_name: 'Тестовый ученик',
    p_color: 'lime',
    p_timezone: 'Europe/Moscow',
  }), 'create student invitation');
  assert.match(invitation.token, /^[A-Za-z0-9_-]{40,128}$/);

  const preview = assertSuccess(
    await client().rpc('get_student_invitation_preview', { p_token: invitation.token }),
    'load public invitation preview',
  );
  assert.equal(preview.studentName, 'Тестовый ученик');
  assert.equal(preview.trainerName, 'Тестовый тренер');

  const createdStudent = assertSuccess(await admin.auth.admin.createUser({
    email: studentEmail,
    password: 'Integration-test-password-2026!',
    email_confirm: true,
  }), 'register student').user;
  assert.ok(createdStudent.id, 'student Auth user was created');
  createdUserIds.push(createdStudent.id);
  const student = await signIn(studentEmail);

  const profileBeforeAcceptance = assertSuccess(
    await student.from('profiles').select('id').eq('id', createdStudent.id).maybeSingle(),
    'check profile before invitation acceptance',
  );
  assert.equal(profileBeforeAcceptance, null);

  const relationship = assertSuccess(
    await student.rpc('accept_student_invitation', { p_token: invitation.token }),
    'accept student invitation',
  );
  assert.equal(relationship.id, invitation.relationshipId);
  assert.equal(relationship.status, 'active');

  const studentProfile = assertSuccess(
    await student.from('profiles').select('id, role, display_name').eq('id', createdStudent.id).single(),
    'load student profile',
  );
  assert.deepEqual(studentProfile, {
    id: createdStudent.id,
    role: 'student',
    display_name: 'Тестовый ученик',
  });

  const exerciseInstanceId = crypto.randomUUID();
  const privateExerciseInstanceId = crypto.randomUUID();
  const privateDefinitionId = crypto.randomUUID();
  assertSuccess(await trainer.from('exercise_definitions').insert({
    id: privateDefinitionId, owner_id: trainerUser.id, name: 'Личная тяга тренера',
    primary_muscle: 'Спина', muscle_groups: ['Спина'], equipment: 'Блок',
    measure_type: 'reps', load_mode: 'external',
  }), 'trainer creates a private exercise');
  assert.deepEqual(assertSuccess(await student.from('exercise_definitions').select('id').eq('id', privateDefinitionId),
    'student cannot read the private library'), []);
  const workoutSnapshot = {
    id: crypto.randomUUID(),
    name: 'Интеграционная тренировка',
    exercises: [{
      id: exerciseInstanceId,
      exerciseId: '00000000-0000-4000-8000-000000000003',
      name: 'Отжимания',
      primaryMuscle: 'Грудь',
      equipment: 'Свой вес',
      measureType: 'reps',
      loadMode: 'bodyweight',
      plannedSets: [{ targetReps: 12, targetWeight: 0 }],
    }, {
      id: privateExerciseInstanceId, exerciseId: privateDefinitionId, name: 'Личная тяга тренера',
      primaryMuscle: 'Спина', equipment: 'Блок', loadMode: 'external', measureType: 'reps', plannedSets: [],
    }],
  };
  const assignment = assertSuccess(await trainer.from('assignments').insert({
    relationship_id: invitation.relationshipId,
    scheduled_for: '2026-09-24',
    scheduled_time: '18:30:00',
    timezone: 'Europe/Moscow',
    format: 'in-person',
    status: 'assigned',
    workout_snapshot: workoutSnapshot,
  }).select('id, status, workout_snapshot').single(), 'trainer creates assignment');

  const studentAssignment = assertSuccess(
    await student.from('assignments').select('id, status').eq('id', assignment.id).single(),
    'student reads own assignment',
  );
  assert.equal(studentAssignment.status, 'assigned');

  const outsiderAssignments = assertSuccess(
    await outsider.from('assignments').select('id').eq('id', assignment.id),
    'outsider queries assignment',
  );
  assert.deepEqual(outsiderAssignments, []);

  const sessionId = crypto.randomUUID();
  const session = assertSuccess(await student.rpc('start_workout_session_with_id', {
    p_assignment_id: assignment.id,
    p_session_id: sessionId,
  }), 'student starts workout');
  assert.equal(session.recorded_by_role, 'student');

  const saved = assertSuccess(await student.rpc('save_session_progress', {
    p_session_id: sessionId,
    p_expected_revision: session.revision,
    p_workout_snapshot: workoutSnapshot,
    p_results: [{
      exerciseInstanceId,
      setNumber: 1,
      actualReps: 12,
      actualWeight: 0,
      completed: true,
    }],
  }), 'student saves workout progress');
  assert.ok(saved.revision > session.revision);

  // Exercise the app's repository, not only the RPC: a student's definition
  // query omits the private exercise, but its assigned snapshot must retain it.
  const repository = createSupabaseRepository(student, { id: createdStudent.id, role: 'student' });
  const appState = await repository.load();
  const activeSession = appState.sessions.find((item) => item.id === sessionId);
  assert.ok(activeSession);
  const updatedWorkout = structuredClone(activeSession.workoutSnapshot);
  updatedWorkout.exercises[1].plannedSets.push({ targetReps: 0, targetWeight: 0 });
  const withEmptySet = updateSessionWorkout(activeSession, updatedWorkout);
  appState.sessions = appState.sessions.map((item) => item.id === sessionId ? withEmptySet : item);
  await repository.execute({ type: 'session.progress', sessionId }, appState);
  assert.deepEqual(assertSuccess(await trainer.from('set_results').select('actual_reps, actual_weight, completed')
    .eq('session_id', sessionId).eq('exercise_instance_id', privateExerciseInstanceId).single(),
  'new custom-exercise set is saved empty'), { actual_reps: 0, actual_weight: 0, completed: false });
  withEmptySet.results = withEmptySet.results.map((result) => result.exerciseId === privateExerciseInstanceId
    ? { ...result, actualWeight: 2.5, actualReps: 8, completed: true } : result);
  await repository.execute({ type: 'session.progress', sessionId }, appState);
  assert.deepEqual(assertSuccess(await trainer.from('set_results').select('actual_reps, actual_weight, completed')
    .eq('session_id', sessionId).eq('exercise_instance_id', privateExerciseInstanceId).single(),
  'student saves a fractional weight for the private exercise'), { actual_reps: 8, actual_weight: 2.5, completed: true });

  // Simulate a real committed save whose HTTP acknowledgement never reaches
  // the app. A retry must recognize it without increasing the revision twice.
  let loseResponse = true;
  const lostResponseClient = {
    from: student.from.bind(student), functions: student.functions,
    rpc: async (name, args) => {
      const result = await student.rpc(name, args);
      if (name === 'save_session_progress' && loseResponse && !result.error) {
        loseResponse = false;
        return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      }
      return result;
    },
  };
  const recoveryRepository = createSupabaseRepository(lostResponseClient, { id: createdStudent.id, role: 'student' });
  const recoveryState = await recoveryRepository.load();
  const recoverySession = recoveryState.sessions.find((item) => item.id === sessionId);
  recoverySession.results = recoverySession.results.map((item) => item.exerciseId === privateExerciseInstanceId
    ? { ...item, actualWeight: 3.5 } : item);
  await assert.rejects(recoveryRepository.execute({ type: 'session.progress', sessionId }, recoveryState), { code: 'REPPY_NETWORK' });
  const beforeRecovery = assertSuccess(await student.from('workout_sessions').select('revision').eq('id', sessionId).single(), 'read committed revision');
  await recoveryRepository.execute({ type: 'session.progress', sessionId }, recoveryState);
  const afterRecovery = assertSuccess(await student.from('workout_sessions').select('revision').eq('id', sessionId).single(), 'read recovered revision');
  assert.equal(afterRecovery.revision, beforeRecovery.revision);
  assert.deepEqual(assertSuccess(await trainer.from('set_results').select('actual_weight').eq('session_id', sessionId)
    .eq('exercise_instance_id', privateExerciseInstanceId).single(), 'trainer sees recovered progress'), { actual_weight: 3.5 });

  const completed = assertSuccess(await student.rpc('complete_workout_session', {
    p_session_id: sessionId,
    p_charge_subscription: true,
  }), 'student completes workout');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.charge_status, 'charged');

  const trainerResult = assertSuccess(
    await trainer.from('set_results').select('actual_reps, completed').eq('session_id', sessionId).eq('exercise_instance_id', exerciseInstanceId).single(),
    'trainer reads student result',
  );
  assert.deepEqual(trainerResult, { actual_reps: 12, completed: true });

  const finalAssignment = assertSuccess(
    await trainer.from('assignments').select('status').eq('id', assignment.id).single(),
    'trainer reads completed assignment',
  );
  assert.equal(finalAssignment.status, 'completed');

  const outsiderSessions = assertSuccess(
    await outsider.from('workout_sessions').select('id').eq('id', sessionId),
    'outsider queries workout session',
  );
  assert.deepEqual(outsiderSessions, []);
});
