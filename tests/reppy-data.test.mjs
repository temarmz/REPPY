import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialState,
  createWorkoutSession,
  createWorkoutTemplate,
  exerciseLibrary,
  findAssignmentWorkout,
  findSessionWorkout,
  migrateDemoState,
  muscleGroups,
  repeatAssignment,
  resolveAssignmentWorkout,
  resolveEditedAssignmentSource,
  updateSessionWorkout,
  upsertStudentWorkoutVersion,
} from '../app/reppy-data.ts';

test('назначения хранят независимый снимок шаблона', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const template = state.workouts.find((workout) => workout.id === assignment.workoutId);

  assert.ok(template);
  assert.notStrictEqual(assignment.workoutSnapshot, template);
  assert.notStrictEqual(assignment.workoutSnapshot.exercises, template.exercises);

  const originalName = assignment.workoutSnapshot.name;
  const originalWeight = assignment.workoutSnapshot.exercises[0].targetWeight;
  template.name = 'Изменённый шаблон';
  template.exercises[0].targetWeight += 50;

  assert.equal(findAssignmentWorkout(state, assignment)?.name, originalName);
  assert.equal(findAssignmentWorkout(state, assignment)?.exercises[0].targetWeight, originalWeight);
});

test('миграция дополняет старые назначения и сессии снимками', () => {
  const legacy = structuredClone(createInitialState());
  delete legacy.studentWorkoutVersions;
  delete legacy.assignments[0].workoutSnapshot;
  delete legacy.assignments[0].source;
  legacy.sessions.push({
    id: 'legacy-session',
    assignmentId: legacy.assignments[0].id,
    studentId: legacy.assignments[0].studentId,
    workoutId: legacy.assignments[0].workoutId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: [],
  });

  const migrated = migrateDemoState(legacy);
  const assignment = migrated.assignments[0];
  const session = migrated.sessions.at(-1);

  assert.equal(assignment.source, 'template');
  assert.ok(assignment.workoutSnapshot.exercises.length > 0);
  assert.deepEqual(migrated.studentWorkoutVersions, []);
  assert.ok(session?.workoutSnapshot.exercises.length > 0);
  assert.notStrictEqual(session?.workoutSnapshot, assignment.workoutSnapshot);
  assert.equal(session?.recordedBy, 'student');
});

test('персональная версия применяется только нужному ученику и может быть обойдена', () => {
  const state = createInitialState();
  const template = state.workouts[0];
  const adapted = structuredClone(template);
  adapted.name = `${template.name} · Артем`;
  adapted.exercises[0].plannedSets = adapted.exercises[0].plannedSets.map((set) => ({ ...set, targetWeight: 37.5 }));
  adapted.exercises[0].targetWeight = 37.5;
  state.studentWorkoutVersions = upsertStudentWorkoutVersion([], 'artem', template.id, adapted, '2026-08-31T10:00:00.000Z');

  const personal = resolveAssignmentWorkout(state, 'artem', template);
  const anotherStudent = resolveAssignmentWorkout(state, 'maria', template);
  const original = resolveAssignmentWorkout(state, 'artem', template, true);

  assert.equal(personal.source, 'student-version');
  assert.equal(personal.workoutSnapshot.exercises[0].targetWeight, 37.5);
  assert.equal(anotherStudent.source, 'template');
  assert.equal(original.source, 'template');
  assert.equal(original.workoutSnapshot.exercises[0].targetWeight, template.exercises[0].targetWeight);
});

test('завершённая сессия читает собственный снимок, а не новое назначение', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const sessionWorkout = structuredClone(assignment.workoutSnapshot);
  sessionWorkout.name = 'Версия на момент выполнения';
  const session = {
    id: 'session-snapshot-test',
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    workoutId: assignment.workoutId,
    workoutSnapshot: sessionWorkout,
    startedAt: '2026-08-31T10:00:00.000Z',
    recordedBy: 'student',
    completedAt: '2026-08-31T11:00:00.000Z',
    results: [],
  };
  state.sessions.push(session);
  assignment.workoutSnapshot.name = 'Позднее изменение назначения';

  assert.equal(findSessionWorkout(state, session)?.name, 'Версия на момент выполнения');
});

test('изменение только расписания сохраняет источник назначения', () => {
  assert.equal(resolveEditedAssignmentSource('template', false, false), 'template');
  assert.equal(resolveEditedAssignmentSource('student-version', false, false), 'student-version');
  assert.equal(resolveEditedAssignmentSource('template', true, false), 'manual-edit');
  assert.equal(resolveEditedAssignmentSource('manual-edit', false, true), 'student-version');
});

test('новый шаблон получает независимые идентификаторы и упражнения', () => {
  const state = createInitialState();
  const source = state.workouts[0];
  const originalWeight = source.exercises[0].targetWeight;
  const copy = createWorkoutTemplate(source, `${source.name} — копия`, '2026-08-31T12:00:00.000Z');

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, `${source.name} — копия`);
  assert.equal(copy.createdAt, '2026-08-31T12:00:00.000Z');
  assert.equal(copy.updatedAt, undefined);
  assert.equal(copy.exercises.length, source.exercises.length);
  copy.exercises.forEach((exercise, index) => {
    assert.notEqual(exercise, source.exercises[index]);
    assert.notEqual(exercise.id, source.exercises[index].id);
    assert.equal(exercise.exerciseId, source.exercises[index].exerciseId);
  });
  source.exercises[0].targetWeight += 50;
  assert.equal(copy.exercises[0].targetWeight, originalWeight);
});
test('повтор копирует тренировку тому же ученику и оставляет исходник независимым', () => {
  const state = createInitialState();
  const source = state.assignments[0];
  const sourceWorkout = structuredClone(source.workoutSnapshot);
  sourceWorkout.exercises[0].coachNote = 'Держи спину нейтрально';

  const repeated = repeatAssignment(source, sourceWorkout, '2026-09-10', '19:15', '2026-09-01T12:00:00.000Z');

  assert.equal(repeated.studentId, source.studentId);
  assert.equal(repeated.workoutId, source.workoutId);
  assert.equal(repeated.source, 'repeated');
  assert.equal(repeated.repeatedFromAssignmentId, source.id);
  assert.equal(repeated.scheduledFor, '2026-09-10');
  assert.equal(repeated.scheduledTime, '19:15');
  assert.equal(repeated.workoutSnapshot.exercises[0].coachNote, 'Держи спину нейтрально');
  repeated.workoutSnapshot.exercises.forEach((exercise, index) => {
    assert.notEqual(exercise.id, sourceWorkout.exercises[index].id);
  });

  repeated.workoutSnapshot.exercises[0].targetWeight += 20;
  assert.notEqual(repeated.workoutSnapshot.exercises[0].targetWeight, sourceWorkout.exercises[0].targetWeight);
});

test('тренер может начать сессию и безопасно менять план по ходу занятия', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const workout = structuredClone(assignment.workoutSnapshot);
  workout.exercises[0].coachNote = 'Колени направлены по линии стоп';
  const session = createWorkoutSession(assignment, workout, 'trainer', '2026-09-01T12:00:00.000Z');
  const originalSets = workout.exercises[0].plannedSets.length;
  const originalWeight = workout.exercises[0].plannedSets[0].targetWeight;

  session.results[0] = { ...session.results[0], completed: true, actualWeight: 72.5 };
  const edited = structuredClone(workout);
  edited.exercises[0].plannedSets = edited.exercises[0].plannedSets.map((set) => ({ ...set, targetWeight: set.targetWeight + 5 }));
  edited.exercises[0].plannedSets.push({ ...edited.exercises[0].plannedSets.at(-1) });
  edited.exercises[0].coachNote = 'Не заваливай колени внутрь';

  const updated = updateSessionWorkout(session, edited);
  const firstExerciseResults = updated.results.filter((result) => result.exerciseId === edited.exercises[0].id);

  assert.equal(updated.recordedBy, 'trainer');
  assert.equal(updated.workoutSnapshot.exercises[0].coachNote, 'Не заваливай колени внутрь');
  assert.equal(firstExerciseResults.length, originalSets + 1);
  assert.equal(firstExerciseResults[0].completed, true);
  assert.equal(firstExerciseResults[0].actualWeight, 72.5);
  assert.equal(firstExerciseResults[1].actualWeight, originalWeight + 5);
  assert.equal(firstExerciseResults.at(-1)?.completed, false);

  const withoutCompletedExercise = { ...edited, exercises: edited.exercises.slice(1) };
  const protectedUpdate = updateSessionWorkout(updated, withoutCompletedExercise);
  assert.ok(protectedUpdate.workoutSnapshot.exercises.some((exercise) => exercise.id === edited.exercises[0].id));
  assert.ok(protectedUpdate.results.some((result) => result.exerciseId === edited.exercises[0].id && result.completed));
});

test('каждый плановый подход задаёт собственные повторы и вес в новой сессии', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const workout = structuredClone(assignment.workoutSnapshot);
  workout.exercises[0].plannedSets = [
    { targetReps: 12, targetWeight: 40 },
    { targetReps: 10, targetWeight: 45 },
    { targetReps: 8, targetWeight: 50 },
  ];

  const session = createWorkoutSession(assignment, workout, 'trainer');
  const results = session.results.filter((result) => result.exerciseId === workout.exercises[0].id);

  assert.deepEqual(results.map(({ actualReps, actualWeight }) => ({ actualReps, actualWeight })), [
    { actualReps: 12, actualWeight: 40 },
    { actualReps: 10, actualWeight: 45 },
    { actualReps: 8, actualWeight: 50 },
  ]);
});

test('миграция распознаёт упражнения со своим весом и не создаёт для них килограммы', () => {
  const legacy = structuredClone(createInitialState());
  const pullUps = legacy.workouts.find((workout) => workout.id === 'pull-day').exercises[0];
  delete pullUps.loadMode;
  delete pullUps.plannedSets;
  pullUps.targetWeight = 25;

  const migrated = migrateDemoState(legacy);
  const migratedPullUps = migrated.workouts.find((workout) => workout.id === 'pull-day').exercises[0];

  assert.equal(migratedPullUps.loadMode, 'bodyweight');
  assert.ok(migratedPullUps.plannedSets.every((set) => set.targetWeight === 0));
});

test('библиотека упражнений покрывает основные мышечные группы', () => {
  assert.ok(exerciseLibrary.length >= 25);
  for (const muscle of muscleGroups) {
    assert.ok(exerciseLibrary.some((exercise) => exercise.primaryMuscle === muscle), `Нет упражнений для категории «${muscle}»`);
  }
  assert.ok(exerciseLibrary.every((exercise) => exercise.equipment));
});
