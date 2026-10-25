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

  // A second lost response followed by another device's edit is a real
  // conflict. Explicitly loading that edit must allow future saves again.
  loseResponse = true;
  recoverySession.results = recoverySession.results.map((item) => item.exerciseId === privateExerciseInstanceId
    ? { ...item, actualWeight: 4.5 } : item);
  await assert.rejects(recoveryRepository.execute({ type: 'session.progress', sessionId }, recoveryState), { code: 'REPPY_NETWORK' });
  const trainerRepository = createSupabaseRepository(trainer, { id: trainerUser.id, role: 'trainer' });
  const trainerState = await trainerRepository.load();

  for (const failTable of ['students', 'trainer_student_relationships']) {
    const writes = { students: 0, trainer_student_relationships: 0 };
    let loseProfileResponse = true;
    const profileTransport = {
      rpc: trainer.rpc.bind(trainer), functions: trainer.functions,
      from(table) {
        const query = trainer.from(table);
        if (!(table in writes)) return query;
        return {
          select: query.select.bind(query),
          update(values) {
            const update = query.update(values);
            const maybeSingle = update.maybeSingle.bind(update);
            update.maybeSingle = async () => {
              writes[table]++;
              const result = await maybeSingle();
              assertSuccess(result, `update profile ${table} through RLS`);
              if (loseProfileResponse && table === failTable) {
                loseProfileResponse = false;
                return { data: null, error: { message: 'Failed to fetch' } };
              }
              return result;
            };
            return update;
          },
        };
      },
    };
    const profiles = createSupabaseRepository(profileTransport, { id: trainerUser.id, role: 'trainer' });
    const profileState = await profiles.load();
    const originalStudent = profileState.students.find((item) => item.id === invitation.studentId);
    const profileCommand = { type: 'student.update', student: { ...originalStudent,
      name: `Recovered ${failTable}`, height: 182.5, weight: 75.25,
      color: originalStudent.color === 'orange' ? 'violet' : 'orange' } };
    await assert.rejects(profiles.execute(profileCommand, profileState), { code: 'REPPY_NETWORK' });
    const acceptedProfile = assertSuccess(await trainer.from('students').select('*').eq('id', invitation.studentId).single(), 'read partially accepted profile');
    await profiles.execute(profileCommand, profileState);
    assert.deepEqual(writes, { students: 1, trainer_student_relationships: 1 });
    assert.deepEqual(assertSuccess(await trainer.from('students').select('*').eq('id', invitation.studentId).single(), 'read recovered profile'), acceptedProfile);
    assert.equal(Number(acceptedProfile.height_cm), 182.5);
    assert.equal(Number(acceptedProfile.weight_kg), 75.25);
    assert.equal(assertSuccess(await trainer.from('trainer_student_relationships').select('color')
      .eq('id', invitation.relationshipId).single(), 'read recovered color').color, profileCommand.student.color);

    // A later real edit remains protected on either side of a lost response.
    loseProfileResponse = true;
    await assert.rejects(profiles.execute(profileCommand, profileState), { code: 'REPPY_NETWORK' });
    assertSuccess(await trainer.from('students').update({ name: 'Concurrent profile edit' }).eq('id', invitation.studentId), 'another device edits profile');
    const beforeRetry = { ...writes };
    await assert.rejects(profiles.execute(profileCommand, profileState), { code: 'REPPY_CONFLICT' });
    assert.deepEqual(writes, beforeRetry);
    assert.equal(assertSuccess(await trainer.from('students').select('name')
      .eq('id', invitation.studentId).single(), 'concurrent profile is not overwritten').name, 'Concurrent profile edit');
    assert.deepEqual(assertSuccess(await outsider.from('students').select('id')
      .eq('id', invitation.studentId), 'outsider cannot read profile during recovery'), []);
  }

  const customDefinition = { id: `retry-${suffix}`, name: `Retry exercise ${suffix}`,
    equipment: 'Другое', measureType: 'reps', loadMode: 'external' };
  let loseDefinitionResponse = true;
  const retryTrainer = createSupabaseRepository({
    from(table) {
      const query = trainer.from(table);
      if (table !== 'exercise_definitions') return query;
      return { upsert: async (...args) => {
        const result = await query.upsert(...args);
        assertSuccess(result, 'create custom definition through RLS');
        if (loseDefinitionResponse) {
          loseDefinitionResponse = false;
          return { data: null, error: { message: 'Failed to fetch' } };
        }
        return result;
      } };
    },
  }, { id: trainerUser.id, role: 'trainer' });
  const createDefinition = { type: 'exercise-definition.create', definition: customDefinition };
  await assert.rejects(retryTrainer.execute(createDefinition, trainerState), { code: 'REPPY_NETWORK' });
  const storedDefinition = assertSuccess(await trainer.from('exercise_definitions').select('id')
    .eq('name', customDefinition.name).single(), 'read committed custom exercise');
  assertSuccess(await trainer.from('exercise_definitions').update({ name: 'Updated on another device' })
    .eq('id', storedDefinition.id), 'edit committed custom exercise');
  await retryTrainer.execute(createDefinition, trainerState);
  assert.deepEqual(assertSuccess(await trainer.from('exercise_definitions').select('id, name')
    .eq('id', storedDefinition.id), 'read retried exercise'), [{ id: storedDefinition.id, name: 'Updated on another device' }]);
  assert.deepEqual(assertSuccess(await student.from('exercise_definitions').select('id')
    .eq('id', storedDefinition.id), 'student cannot read private retried exercise'), []);

  for (const table of ['assignments', 'subscription_entries']) {
    const transport = { from: (name) => trainer.from(name), rpc: (...args) => trainer.rpc(...args), functions: trainer.functions };
    const retryRepository = createSupabaseRepository(transport, { id: trainerUser.id, role: 'trainer' });
    const state = await retryRepository.load();
    const command = table === 'assignments'
      ? { type: 'assignment.create', assignment: { ...state.assignments[0], id: `retry-assignment-${suffix}` } }
      : { type: 'subscription.payment.create', entry: { id: `retry-payment-${suffix}`, studentId: state.students[0].id,
        kind: 'payment', lessonDelta: 2, occurredAt: new Date().toISOString(), amountRub: 1000, paymentMethod: 'cash' } };
    let remoteId;
    let loseResponse = true;
    transport.from = (name) => {
      const query = trainer.from(name);
      if (name !== table) return query;
      return { upsert: async (row, options) => {
        remoteId = row.id;
        const result = await query.upsert(row, options);
        assertSuccess(result, `create ${table} through RLS`);
        if (loseResponse) {
          loseResponse = false;
          return { data: null, error: { message: 'Failed to fetch' } };
        }
        return result;
      } };
    };
    await assert.rejects(retryRepository.execute(command, state), { code: 'REPPY_NETWORK' });
    await retryRepository.execute(command, state);
    assert.deepEqual(assertSuccess(await trainer.from(table).select('id').eq('id', remoteId), `retried ${table}`), [{ id: remoteId }]);
    assert.deepEqual(assertSuccess(await outsider.from(table).select('id').eq('id', remoteId), `outsider cannot read ${table}`), []);

    // A committed UPDATE with a lost response must not become a false conflict.
    // Keep the real PostgREST builder, replacing only its final acknowledgement.
    transport.from = (name) => {
      const query = trainer.from(name);
      if (name !== table) return query;
      return {
        select: query.select.bind(query),
        update(values) {
          const update = query.update(values);
          const maybeSingle = update.maybeSingle.bind(update);
          update.maybeSingle = async () => {
            const result = await maybeSingle();
            assertSuccess(result, `update ${table} through RLS`);
            if (loseResponse) {
              loseResponse = false;
              return { data: null, error: { message: 'Failed to fetch' } };
            }
            return result;
          };
          return update;
        },
      };
    };
    const editingState = await retryRepository.load();
    const editingCommand = table === 'assignments'
      ? { type: 'assignment.update', assignment: editingState.assignments.find((item) => item.id === remoteId) }
      : { type: 'subscription.payment.update', entry: editingState.subscriptionEntries.find((item) => item.id === remoteId) };
    if (table === 'assignments') {
      editingCommand.assignment.workoutSnapshot.name = 'Updated with uncertain response';
      editingCommand.assignment.rescheduleRequest = { scheduledFor: '2026-10-24', scheduledTime: '19:00', requestedAt: '2026-10-22T12:00:00.000Z' };
    } else {
      Object.assign(editingCommand.entry, { lessonDelta: 5, amountRub: 2500.5, occurredAt: '2026-10-22T12:00:00.000Z', comment: 'Updated' });
    }
    loseResponse = true;
    await assert.rejects(retryRepository.execute(editingCommand, editingState), { code: 'REPPY_NETWORK' });
    const committedUpdate = assertSuccess(await trainer.from(table).select('*').eq('id', remoteId).single(), `committed ${table} update`);
    await retryRepository.execute(editingCommand, editingState);
    assert.deepEqual(assertSuccess(await trainer.from(table).select('*').eq('id', remoteId).single(), `recovered ${table} update`), committedUpdate);

    // A later revision must stay a conflict rather than acknowledge this retry.
    loseResponse = true;
    await assert.rejects(retryRepository.execute(editingCommand, editingState), { code: 'REPPY_NETWORK' });
    const change = table === 'assignments' ? { scheduled_for: '2026-10-25' } : { amount_rub: 999 };
    assertSuccess(await trainer.from(table).update(change).eq('id', remoteId), `another device edits ${table}`);
    const concurrentUpdate = assertSuccess(await trainer.from(table).select('*').eq('id', remoteId).single(), `concurrent ${table} update`);
    await assert.rejects(retryRepository.execute(editingCommand, editingState), { code: 'REPPY_CONFLICT' });
    assert.deepEqual(assertSuccess(await trainer.from(table).select('*').eq('id', remoteId).single(), `protected ${table} update`), concurrentUpdate);
  }

  for (const scenario of ['committed', 'uncommitted', 'concurrent-edit', 'account-changed', 'related-student']) {
    const paymentId = crypto.randomUUID();
    assertSuccess(await trainer.from('subscription_entries').insert({ id: paymentId, relationship_id: invitation.relationshipId,
      kind: 'payment', lesson_delta: 2, amount_rub: 1000, payment_method: 'cash', occurred_at: new Date().toISOString() }), 'create payment for delete recovery');
    let loseResponse = true;
    let deleteCalls = 0;
    let reader = trainer;
    const transport = { from: name => reader.from(name), auth: { getUser: () => reader.auth.getUser() }, functions: trainer.functions,
      async rpc(name, args) {
        if (name !== 'delete_subscription_payment') return trainer.rpc(name, args);
        deleteCalls++;
        if (loseResponse) {
          loseResponse = false;
          if (['committed', 'account-changed', 'related-student'].includes(scenario)) {
            assertSuccess(await trainer.rpc(name, args), 'delete payment before losing acknowledgement');
          }
          return { error: { message: 'Failed to fetch' } };
        }
        return trainer.rpc(name, args);
      } };
    const repository = createSupabaseRepository(transport, { id: trainerUser.id, role: 'trainer' });
    const state = await repository.load();
    const command = { type: 'subscription.payment.delete', entryId: paymentId };
    await assert.rejects(repository.execute(command, state), { code: 'REPPY_NETWORK' });
    if (scenario === 'account-changed') reader = outsider;
    if (scenario === 'related-student') reader = student;
    if (scenario === 'concurrent-edit') {
      assertSuccess(await trainer.from('subscription_entries').update({ amount_rub: 999 }).eq('id', paymentId), 'concurrent payment edit');
    }
    if (['concurrent-edit', 'account-changed', 'related-student'].includes(scenario)) {
      await assert.rejects(repository.execute(command, state), { code: 'REPPY_CONFLICT' });
      assert.equal(deleteCalls, 1, 'no repeat delete after changed record or unavailable relationship');
      if (scenario === 'concurrent-edit') {
        assert.equal(assertSuccess(await trainer.from('subscription_entries').select('amount_rub').eq('id', paymentId).single(), 'protected concurrent payment').amount_rub, 999);
      }
    } else {
      await repository.execute(command, state);
      assert.equal(deleteCalls, scenario === 'committed' ? 1 : 2);
      assert.deepEqual(assertSuccess(await trainer.from('subscription_entries').select('id').eq('id', paymentId), 'payment is deleted'), []);
    }
    assert.deepEqual(assertSuccess(await outsider.from('subscription_entries').select('id').eq('id', paymentId), 'outsider cannot inspect recovered payment'), []);
  }

  const trainerSession = trainerState.sessions.find((item) => item.id === sessionId);
  trainerSession.results = trainerSession.results.map((item) => item.exerciseId === privateExerciseInstanceId
    ? { ...item, actualWeight: 5.5 } : item);
  await trainerRepository.execute({ type: 'session.progress', sessionId }, trainerState);
  await assert.rejects(recoveryRepository.execute({ type: 'session.progress', sessionId }, recoveryState), { code: 'REPPY_CONFLICT' });
  const freshState = await recoveryRepository.load();
  const freshSession = freshState.sessions.find((item) => item.id === sessionId);
  assert.equal(freshSession.results.find((item) => item.exerciseId === privateExerciseInstanceId).actualWeight, 5.5);
  freshSession.results = freshSession.results.map((item) => item.exerciseId === privateExerciseInstanceId
    ? { ...item, actualWeight: 6.5 } : item);
  await recoveryRepository.execute({ type: 'session.progress', sessionId }, freshState);
  assert.deepEqual(assertSuccess(await trainer.from('set_results').select('actual_weight').eq('session_id', sessionId)
    .eq('exercise_instance_id', privateExerciseInstanceId).single(), 'new edits save after conflict recovery'), { actual_weight: 6.5 });

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
