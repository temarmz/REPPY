import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

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
  const trainerEmail = `trainer-${suffix}@example.test`;
  const studentEmail = `student-${suffix}@example.test`;
  const outsiderEmail = `outsider-${suffix}@example.test`;
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
    p_target_email: studentEmail,
    p_color: 'lime',
    p_timezone: 'Europe/Moscow',
  }), 'create student invitation');
  assert.equal(invitation.targetEmail, studentEmail);
  assert.match(invitation.token, /^[A-Za-z0-9_-]{40,128}$/);

  const preview = assertSuccess(
    await client().rpc('get_student_invitation_preview', { p_token: invitation.token }),
    'load public invitation preview',
  );
  assert.equal(preview.studentName, 'Тестовый ученик');
  assert.equal(preview.trainerName, 'Тестовый тренер');

  const student = client();
  const signUp = assertSuccess(await student.auth.signUp({
    email: studentEmail,
    password: 'Integration-test-password-2026!',
  }), 'register student');
  assert.ok(signUp.user?.id, 'student Auth user was created');
  createdUserIds.push(signUp.user.id);
  if (!signUp.session) {
    assertSuccess(await admin.auth.admin.updateUserById(signUp.user.id, { email_confirm: true }), 'confirm student email');
    assertSuccess(await student.auth.signInWithPassword({
      email: studentEmail,
      password: 'Integration-test-password-2026!',
    }), 'sign in confirmed student');
  }

  const profileBeforeAcceptance = assertSuccess(
    await student.from('profiles').select('id').eq('id', signUp.user.id).maybeSingle(),
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
    await student.from('profiles').select('id, role, display_name').eq('id', signUp.user.id).single(),
    'load student profile',
  );
  assert.deepEqual(studentProfile, {
    id: signUp.user.id,
    role: 'student',
    display_name: 'Тестовый ученик',
  });

  const exerciseInstanceId = crypto.randomUUID();
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

  const completed = assertSuccess(await student.rpc('complete_workout_session', {
    p_session_id: sessionId,
    p_charge_subscription: true,
  }), 'student completes workout');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.charge_status, 'charged');

  const trainerResult = assertSuccess(
    await trainer.from('set_results').select('actual_reps, completed').eq('session_id', sessionId).single(),
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
