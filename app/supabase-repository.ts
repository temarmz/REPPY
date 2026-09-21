import type { SupabaseClient } from '@supabase/supabase-js';
import {
  exerciseLibrary,
  type Assignment,
  type DemoState,
  type Role,
  type Student,
  type SubscriptionEntry,
  type Workout,
  type WorkoutExercise,
  type WorkoutSession,
} from './reppy-data';
import type { ReppyRepository } from './reppy-repository';

type AuthProfile = { id: string; role: Role };

type RelationshipRow = {
  id: string;
  trainer_id: string;
  student_id: string;
  status: Student['status'];
  color: Student['color'];
  updated_at: string;
};

type StudentRow = {
  id: string;
  account_id: string | null;
  name: string;
  phone: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  gender: Student['gender'] | null;
  contraindications: string | null;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  relationship_id: string;
  assigned_at: string;
  scheduled_for: string;
  scheduled_time: string | null;
  format: Assignment['format'];
  status: Assignment['status'];
  workout_snapshot: Workout;
  repeated_from_assignment_id: string | null;
  reschedule_scheduled_for: string | null;
  reschedule_scheduled_time: string | null;
  reschedule_requested_at: string | null;
  revision: number;
};

type SessionRow = {
  id: string;
  assignment_id: string;
  workout_snapshot: Workout;
  recorded_by_role: Role;
  started_at: string;
  completed_at: string | null;
  mood: WorkoutSession['mood'] | null;
  comment: string | null;
  charge_status: WorkoutSession['subscriptionChargeStatus'] | null;
  revision: number;
};

type ResultRow = {
  session_id: string;
  exercise_instance_id: string;
  set_number: number;
  actual_reps: number;
  actual_weight: number | string;
  completed: boolean;
};

type SubscriptionRow = {
  id: string;
  relationship_id: string;
  kind: SubscriptionEntry['kind'];
  lesson_delta: number;
  occurred_at: string;
  created_at: string;
  updated_at: string | null;
  amount_rub: number | string | null;
  payment_method: SubscriptionEntry['paymentMethod'] | null;
  comment: string | null;
  session_id: string | null;
  workout_name: string | null;
  revision: number;
};

type DefinitionRow = { id: string; slug: string | null };

const REALTIME_TABLES = [
  'students',
  'trainer_student_relationships',
  'exercise_definitions',
  'assignments',
  'workout_sessions',
  'set_results',
  'subscription_entries',
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function numberOrUndefined(value: number | string | null) {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function throwIfError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

function revisionConflict(entity: string) {
  return new Error(`${entity} уже изменён на другом устройстве. Обнови страницу и повтори действие.`);
}

function indexById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function uuid() {
  return crypto.randomUUID();
}

function timeForDatabase(value?: string) {
  return value ? `${value}:00`.replace(/:00:00$/, ':00') : null;
}

function timeForUi(value: string | null) {
  return value ? value.slice(0, 5) : undefined;
}

export function createSupabaseRepository(
  client: SupabaseClient,
  profile: AuthProfile,
): ReppyRepository {
  let baseline: DemoState | null = null;
  const relationshipByStudent = new Map<string, string>();
  const trainerByStudent = new Map<string, string>();
  const remoteStudentId = new Map<string, string>();
  const remoteAssignmentId = new Map<string, string>();
  const remoteSessionId = new Map<string, string>();
  const remoteSubscriptionId = new Map<string, string>();
  const remoteExerciseDefinitionId = new Map<string, string>();
  const remoteExerciseInstanceId = new Map<string, string>();
  const sessionRevision = new Map<string, number>();
  const assignmentRevision = new Map<string, number>();
  const subscriptionRevision = new Map<string, number>();
  const studentUpdatedAt = new Map<string, string>();
  const relationshipUpdatedAt = new Map<string, string>();

  const getRemoteId = (mapping: Map<string, string>, localId: string) => {
    const existing = mapping.get(localId);
    if (existing) return existing;
    const next = uuid();
    mapping.set(localId, next);
    return next;
  };

  const serializeWorkout = (workout: Workout): Workout => ({
    ...clone(workout),
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      id: getRemoteId(remoteExerciseInstanceId, exercise.id),
      exerciseId: getRemoteId(remoteExerciseDefinitionId, exercise.exerciseId),
    })),
  });

  const deserializeWorkout = (workout: Workout, slugByDefinition: Map<string, string>): Workout => ({
    ...clone(workout),
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      exerciseId: slugByDefinition.get(exercise.exerciseId) ?? exercise.exerciseId,
    })),
  });

  async function ensureExerciseDefinitions(workouts: Workout[]) {
    const exercises = workouts.flatMap((workout) => workout.exercises);
    const missing = new Map<string, WorkoutExercise>();
    for (const exercise of exercises) {
      if (remoteExerciseDefinitionId.has(exercise.exerciseId)) continue;
      const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
      if (definition) {
        throw new Error(`В Supabase не найдено системное упражнение «${definition.name}».`);
      }
      missing.set(exercise.exerciseId, exercise);
    }
    if (!missing.size) return;

    const rows = [...missing.values()].map((exercise) => ({
      id: getRemoteId(remoteExerciseDefinitionId, exercise.exerciseId),
      owner_id: profile.id,
      name: exercise.name,
      primary_muscle: exercise.primaryMuscle ?? 'Другое',
      equipment: exercise.equipment ?? (exercise.loadMode === 'bodyweight' ? 'Свой вес' : 'Другое'),
      measure_type: exercise.measureType,
      load_mode: exercise.loadMode,
    }));
    throwIfError(await client.from('exercise_definitions').insert(rows));
  }

  async function load(): Promise<DemoState> {
    const [relationshipsResult, studentsResult, assignmentsResult, sessionsResult, resultsResult, subscriptionsResult, definitionsResult] = await Promise.all([
      client.from('trainer_student_relationships').select('id, trainer_id, student_id, status, color, updated_at'),
      client.from('students').select('id, account_id, name, phone, height_cm, weight_kg, gender, contraindications, updated_at'),
      client.from('assignments').select('id, relationship_id, assigned_at, scheduled_for, scheduled_time, format, status, workout_snapshot, repeated_from_assignment_id, reschedule_scheduled_for, reschedule_scheduled_time, reschedule_requested_at, revision'),
      client.from('workout_sessions').select('id, assignment_id, workout_snapshot, recorded_by_role, started_at, completed_at, mood, comment, charge_status, revision'),
      client.from('set_results').select('session_id, exercise_instance_id, set_number, actual_reps, actual_weight, completed'),
      client.from('subscription_entries').select('id, relationship_id, kind, lesson_delta, occurred_at, created_at, updated_at, amount_rub, payment_method, comment, session_id, workout_name, revision'),
      client.from('exercise_definitions').select('id, slug'),
    ]);
    for (const result of [relationshipsResult, studentsResult, assignmentsResult, sessionsResult, resultsResult, subscriptionsResult, definitionsResult]) {
      throwIfError(result);
    }

    const relationships = (relationshipsResult.data ?? []) as RelationshipRow[];
    const studentRows = (studentsResult.data ?? []) as StudentRow[];
    const assignmentRows = (assignmentsResult.data ?? []) as AssignmentRow[];
    const sessionRows = (sessionsResult.data ?? []) as SessionRow[];
    const resultRows = (resultsResult.data ?? []) as ResultRow[];
    const subscriptionRows = (subscriptionsResult.data ?? []) as SubscriptionRow[];
    const definitions = (definitionsResult.data ?? []) as DefinitionRow[];
    const slugByDefinition = new Map<string, string>();

    for (const definition of definitions) {
      const uiId = definition.slug ?? definition.id;
      remoteExerciseDefinitionId.set(uiId, definition.id);
      slugByDefinition.set(definition.id, uiId);
    }
    for (const relationship of relationships) {
      relationshipByStudent.set(relationship.student_id, relationship.id);
      trainerByStudent.set(relationship.student_id, relationship.trainer_id);
      remoteStudentId.set(relationship.student_id, relationship.student_id);
      relationshipUpdatedAt.set(relationship.student_id, relationship.updated_at);
    }
    for (const student of studentRows) studentUpdatedAt.set(student.id, student.updated_at);
    for (const assignment of assignmentRows) {
      remoteAssignmentId.set(assignment.id, assignment.id);
      assignmentRevision.set(assignment.id, assignment.revision);
    }
    for (const session of sessionRows) {
      remoteSessionId.set(session.id, session.id);
      sessionRevision.set(session.id, session.revision);
    }
    for (const entry of subscriptionRows) {
      remoteSubscriptionId.set(entry.id, entry.id);
      subscriptionRevision.set(entry.id, entry.revision);
    }

    const relationshipById = new Map(relationships.map((row) => [row.id, row]));
    const assignmentById = new Map(assignmentRows.map((row) => [row.id, row]));
    const resultsBySession = new Map<string, ResultRow[]>();
    for (const result of resultRows) {
      const list = resultsBySession.get(result.session_id) ?? [];
      list.push(result);
      resultsBySession.set(result.session_id, list);
      remoteExerciseInstanceId.set(result.exercise_instance_id, result.exercise_instance_id);
    }

    const students: Student[] = studentRows.flatMap((student) => {
      const relationship = relationships.find((item) => item.student_id === student.id);
      if (!relationship) return [];
      return [{
        id: student.id,
        name: student.name,
        status: relationship.status,
        color: relationship.color,
        height: numberOrUndefined(student.height_cm),
        weight: numberOrUndefined(student.weight_kg),
        gender: student.gender ?? undefined,
        phone: student.phone ?? undefined,
        contraindications: student.contraindications ?? undefined,
      }];
    });

    const assignments: Assignment[] = assignmentRows.flatMap((assignment) => {
      const relationship = relationshipById.get(assignment.relationship_id);
      if (!relationship) return [];
      const rescheduleRequest = assignment.reschedule_scheduled_for && assignment.reschedule_scheduled_time && assignment.reschedule_requested_at
        ? {
            scheduledFor: assignment.reschedule_scheduled_for,
            scheduledTime: timeForUi(assignment.reschedule_scheduled_time) ?? '',
            requestedAt: assignment.reschedule_requested_at,
          }
        : undefined;
      return [{
        id: assignment.id,
        studentId: relationship.student_id,
        assignedAt: assignment.assigned_at,
        scheduledFor: assignment.scheduled_for,
        scheduledTime: timeForUi(assignment.scheduled_time),
        format: assignment.format,
        status: assignment.status,
        workoutSnapshot: deserializeWorkout(assignment.workout_snapshot, slugByDefinition),
        repeatedFromAssignmentId: assignment.repeated_from_assignment_id ?? undefined,
        rescheduleRequest,
      }];
    });

    const sessions: WorkoutSession[] = sessionRows.flatMap((session) => {
      const assignment = assignmentById.get(session.assignment_id);
      const relationship = assignment && relationshipById.get(assignment.relationship_id);
      if (!relationship) return [];
      const workout = deserializeWorkout(session.workout_snapshot, slugByDefinition);
      for (const exercise of workout.exercises) remoteExerciseInstanceId.set(exercise.id, exercise.id);
      return [{
        id: session.id,
        assignmentId: session.assignment_id,
        studentId: relationship.student_id,
        workoutSnapshot: workout,
        startedAt: session.started_at,
        recordedBy: session.recorded_by_role,
        completedAt: session.completed_at ?? undefined,
        mood: session.mood ?? undefined,
        comment: session.comment ?? undefined,
        subscriptionChargeStatus: session.charge_status ?? undefined,
        results: (resultsBySession.get(session.id) ?? []).map((result) => ({
          exerciseId: result.exercise_instance_id,
          setNumber: result.set_number,
          actualReps: result.actual_reps,
          actualWeight: Number(result.actual_weight),
          completed: result.completed,
        })),
      }];
    });

    const subscriptionEntries: SubscriptionEntry[] = subscriptionRows.flatMap((entry) => {
      const relationship = relationshipById.get(entry.relationship_id);
      if (!relationship) return [];
      return [{
        id: entry.id,
        trainerId: relationship.trainer_id,
        studentId: relationship.student_id,
        kind: entry.kind,
        lessonDelta: entry.lesson_delta,
        occurredAt: entry.occurred_at,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at ?? undefined,
        amountRub: numberOrUndefined(entry.amount_rub),
        paymentMethod: entry.payment_method ?? undefined,
        comment: entry.comment ?? undefined,
        sessionId: entry.session_id ?? undefined,
        workoutName: entry.workout_name ?? undefined,
      }];
    });

    const ownStudent = profile.role === 'student'
      ? studentRows.find((student) => student.account_id === profile.id)?.id
      : undefined;
    const state: DemoState = {
      schemaVersion: 6,
      loggedIn: true,
      role: profile.role,
      activeStudentId: ownStudent ?? students[0]?.id ?? '',
      students,
      assignments,
      sessions,
      subscriptionEntries,
    };
    baseline = clone(state);
    return state;
  }

  async function save(state: DemoState) {
    if (!baseline) {
      baseline = clone(state);
      return;
    }
    const previous = baseline;
    const previousStudents = indexById(previous.students);

    for (const student of state.students) {
      const before = previousStudents.get(student.id);
      if (!before) {
        if (profile.role !== 'trainer') throw new Error('Только тренер может добавить ученика.');
        const studentId = getRemoteId(remoteStudentId, student.id);
        const relationshipId = uuid();
        throwIfError(await client.from('students').insert({
          id: studentId,
          created_by: profile.id,
          name: student.name,
          phone: student.phone || null,
          height_cm: student.height ?? null,
          weight_kg: student.weight ?? null,
          gender: student.gender ?? null,
          contraindications: student.contraindications || null,
        }));
        throwIfError(await client.from('trainer_student_relationships').insert({
          id: relationshipId,
          trainer_id: profile.id,
          student_id: studentId,
          status: 'invited',
          color: student.color,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }));
        relationshipByStudent.set(student.id, relationshipId);
        trainerByStudent.set(student.id, profile.id);
      } else if (!same(before, student)) {
        const studentId = getRemoteId(remoteStudentId, student.id);
        let updateStudent = client.from('students').update({
          name: student.name,
          phone: student.phone || null,
          height_cm: student.height ?? null,
          weight_kg: student.weight ?? null,
          gender: student.gender ?? null,
          contraindications: student.contraindications || null,
        }).eq('id', studentId);
        const expectedUpdatedAt = studentUpdatedAt.get(student.id);
        if (expectedUpdatedAt) updateStudent = updateStudent.eq('updated_at', expectedUpdatedAt);
        const updatedStudent = await updateStudent.select('updated_at').maybeSingle();
        throwIfError(updatedStudent);
        if (!updatedStudent.data) throw revisionConflict('Профиль ученика');
        studentUpdatedAt.set(student.id, updatedStudent.data.updated_at);
        if (profile.role === 'trainer' && before.color !== student.color) {
          let updateRelationship = client.from('trainer_student_relationships')
            .update({ color: student.color })
            .eq('id', relationshipByStudent.get(student.id)!);
          const expectedRelationshipUpdatedAt = relationshipUpdatedAt.get(student.id);
          if (expectedRelationshipUpdatedAt) updateRelationship = updateRelationship.eq('updated_at', expectedRelationshipUpdatedAt);
          const updatedRelationship = await updateRelationship.select('updated_at').maybeSingle();
          throwIfError(updatedRelationship);
          if (!updatedRelationship.data) throw revisionConflict('Карточка ученика');
          relationshipUpdatedAt.set(student.id, updatedRelationship.data.updated_at);
        }
      }
    }

    let telegramNotificationCreated = false;
    const previousAssignments = indexById(previous.assignments);
    const nextAssignments = indexById(state.assignments);
    const addedAssignments = state.assignments.filter((item) => !previousAssignments.has(item.id));
    if (profile.role !== 'trainer' && addedAssignments.length > 0) {
      throw new Error('Только тренер может назначить тренировку.');
    }
    await ensureExerciseDefinitions(addedAssignments.map((item) => item.workoutSnapshot));
    for (const assignment of addedAssignments) {
      const relationshipId = relationshipByStudent.get(assignment.studentId);
      if (!relationshipId) throw new Error('Не найдена связь тренера с учеником.');
      const assignmentId = getRemoteId(remoteAssignmentId, assignment.id);
      throwIfError(await client.from('assignments').insert({
        id: assignmentId,
        relationship_id: relationshipId,
        assigned_at: assignment.assignedAt,
        scheduled_for: assignment.scheduledFor,
        scheduled_time: assignment.format === 'in-person' ? timeForDatabase(assignment.scheduledTime) : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        format: assignment.format,
        status: 'assigned',
        workout_snapshot: serializeWorkout(assignment.workoutSnapshot),
        repeated_from_assignment_id: assignment.repeatedFromAssignmentId
          ? getRemoteId(remoteAssignmentId, assignment.repeatedFromAssignmentId)
          : null,
      }));
      assignmentRevision.set(assignment.id, 1);
    }
    for (const assignment of state.assignments) {
      const before = previousAssignments.get(assignment.id);
      if (!before || same(before, assignment) || before.status === 'completed') continue;
      if (profile.role === 'student') {
        if (!same(before.rescheduleRequest, assignment.rescheduleRequest) && assignment.rescheduleRequest) {
          const requested = await client.rpc('request_assignment_reschedule', {
            p_assignment_id: getRemoteId(remoteAssignmentId, assignment.id),
            p_scheduled_for: assignment.rescheduleRequest.scheduledFor,
            p_scheduled_time: timeForDatabase(assignment.rescheduleRequest.scheduledTime),
          });
          throwIfError(requested);
          assignmentRevision.set(assignment.id, (requested.data as AssignmentRow).revision);
          telegramNotificationCreated = true;
        }
        continue;
      }
      await ensureExerciseDefinitions([assignment.workoutSnapshot]);
      let updateAssignment = client.from('assignments').update({
        scheduled_for: assignment.scheduledFor,
        scheduled_time: assignment.format === 'in-person' ? timeForDatabase(assignment.scheduledTime) : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        format: assignment.format,
        workout_snapshot: serializeWorkout(assignment.workoutSnapshot),
        repeated_from_assignment_id: assignment.repeatedFromAssignmentId
          ? getRemoteId(remoteAssignmentId, assignment.repeatedFromAssignmentId)
          : null,
        reschedule_scheduled_for: assignment.rescheduleRequest?.scheduledFor ?? null,
        reschedule_scheduled_time: timeForDatabase(assignment.rescheduleRequest?.scheduledTime),
        reschedule_requested_at: assignment.rescheduleRequest?.requestedAt ?? null,
      }).eq('id', getRemoteId(remoteAssignmentId, assignment.id));
      const expectedRevision = assignmentRevision.get(assignment.id);
      if (expectedRevision) updateAssignment = updateAssignment.eq('revision', expectedRevision);
      const updatedAssignment = await updateAssignment.select('revision').maybeSingle();
      throwIfError(updatedAssignment);
      if (!updatedAssignment.data) throw revisionConflict('Назначение');
      assignmentRevision.set(assignment.id, updatedAssignment.data.revision);
    }

    const previousSessions = indexById(previous.sessions);
    const nextSessions = indexById(state.sessions);
    for (const session of state.sessions) {
      const before = previousSessions.get(session.id);
      const sessionId = getRemoteId(remoteSessionId, session.id);
      if (!before) {
        await ensureExerciseDefinitions([session.workoutSnapshot]);
        const started = await client.rpc('start_workout_session_with_id', {
          p_assignment_id: getRemoteId(remoteAssignmentId, session.assignmentId),
          p_session_id: sessionId,
        });
        throwIfError(started);
        const startedRow = started.data as SessionRow;
        sessionRevision.set(session.id, startedRow.revision);
      }
      const progressChanged = !before || !same(before.results, session.results) || !same(before.workoutSnapshot, session.workoutSnapshot);
      if (progressChanged && !before?.completedAt) {
        await ensureExerciseDefinitions([session.workoutSnapshot]);
        const progress = await client.rpc('save_session_progress', {
          p_session_id: sessionId,
          p_expected_revision: sessionRevision.get(session.id) ?? 1,
          p_workout_snapshot: serializeWorkout(session.workoutSnapshot),
          p_results: session.results.map((result) => ({
            exerciseInstanceId: getRemoteId(remoteExerciseInstanceId, result.exerciseId),
            setNumber: result.setNumber,
            actualReps: result.actualReps,
            actualWeight: result.actualWeight,
            completed: result.completed,
          })),
        });
        throwIfError(progress);
        sessionRevision.set(session.id, (progress.data as SessionRow).revision);
      }
      if (session.completedAt && !before?.completedAt) {
        const completed = await client.rpc('complete_workout_session', {
          p_session_id: sessionId,
          p_charge_subscription: session.subscriptionChargeStatus !== 'waived',
        });
        throwIfError(completed);
        sessionRevision.set(session.id, (completed.data as SessionRow).revision);
        if (profile.role === 'student') telegramNotificationCreated = true;
      }
      if (session.completedAt && (!before || before.mood !== session.mood || before.comment !== session.comment)) {
        throwIfError(await client.rpc('save_session_feedback', {
          p_session_id: sessionId,
          p_mood: session.mood ?? null,
          p_comment: session.comment?.trim() || null,
        }));
      }
    }

    for (const removed of previous.sessions.filter((item) => !nextSessions.has(item.id))) {
      throwIfError(await client.rpc('archive_workout_session', { p_session_id: getRemoteId(remoteSessionId, removed.id) }));
    }
    for (const removed of previous.assignments.filter((item) => !nextAssignments.has(item.id))) {
      if (previous.sessions.some((session) => session.assignmentId === removed.id)) continue;
      throwIfError(await client.from('assignments').delete().eq('id', getRemoteId(remoteAssignmentId, removed.id)));
    }

    const previousEntries = indexById(previous.subscriptionEntries);
    for (const entry of state.subscriptionEntries) {
      const before = previousEntries.get(entry.id);
      if (entry.kind !== 'payment') continue;
      const relationshipId = relationshipByStudent.get(entry.studentId);
      if (!relationshipId) throw new Error('Не найдена связь абонемента с учеником.');
      const values = {
        relationship_id: relationshipId,
        kind: 'payment' as const,
        lesson_delta: entry.lessonDelta,
        occurred_at: entry.occurredAt,
        amount_rub: entry.amountRub ?? 0,
        payment_method: entry.paymentMethod,
        comment: entry.comment || null,
      };
      if (!before) {
        throwIfError(await client.from('subscription_entries').insert({
          id: getRemoteId(remoteSubscriptionId, entry.id),
          ...values,
        }));
        subscriptionRevision.set(entry.id, 1);
      } else if (!same(before, entry)) {
        let updateSubscription = client.from('subscription_entries').update({
          lesson_delta: values.lesson_delta,
          occurred_at: values.occurred_at,
          amount_rub: values.amount_rub,
          payment_method: values.payment_method,
          comment: values.comment,
        }).eq('id', getRemoteId(remoteSubscriptionId, entry.id));
        const expectedRevision = subscriptionRevision.get(entry.id);
        if (expectedRevision) updateSubscription = updateSubscription.eq('revision', expectedRevision);
        const updatedSubscription = await updateSubscription.select('revision').maybeSingle();
        throwIfError(updatedSubscription);
        if (!updatedSubscription.data) throw revisionConflict('Платёж');
        subscriptionRevision.set(entry.id, updatedSubscription.data.revision);
      }
    }

    baseline = clone(state);
    if (telegramNotificationCreated) {
      const delivery = await client.functions.invoke('telegram-notifications', { body: {} });
      if (delivery.error) console.warn('Telegram notification delivery was deferred.', delivery.error);
    }
  }

  async function createStudentInvitation(name: string, email: string) {
    if (profile.role !== 'trainer') throw new Error('Только тренер может приглашать учеников.');
    const result = await client.rpc('create_student_with_invitation', {
      p_name: name.trim(),
      p_target_email: email.trim(),
      p_color: 'orange',
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    throwIfError(result);
    const created = result.data as {
      studentId: string;
      relationshipId: string;
      token: string;
      expiresAt: string;
    };
    const student: Student = {
      id: created.studentId,
      name: name.trim(),
      status: 'invited',
      color: 'orange',
    };
    remoteStudentId.set(student.id, student.id);
    relationshipByStudent.set(student.id, created.relationshipId);
    trainerByStudent.set(student.id, profile.id);
    if (baseline && !baseline.students.some((item) => item.id === student.id)) {
      baseline = { ...baseline, students: [...baseline.students, student] };
    }
    return { student, token: created.token, expiresAt: created.expiresAt };
  }

  return {
    load,
    save,
    createStudentInvitation,
    subscribe(onChange) {
      let active = true;
      let channel = client.channel(`reppy-sync:${profile.id}:${uuid()}`);
      for (const table of REALTIME_TABLES) {
        channel = channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
        }, onChange);
      }
      void client.realtime.setAuth().then(() => {
        if (active) channel.subscribe();
      }).catch(() => undefined);
      return () => {
        active = false;
        void client.removeChannel(channel);
      };
    },
    async clear() {
      baseline = null;
    },
  };
}
