import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialState,
  createWorkoutTemplate,
  findAssignmentWorkout,
  findSessionWorkout,
  migrateDemoState,
  resolveAssignmentWorkout,
  resolveEditedAssignmentSource,
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
});

test('персональная версия применяется только нужному ученику и может быть обойдена', () => {
  const state = createInitialState();
  const template = state.workouts[0];
  const adapted = structuredClone(template);
  adapted.name = `${template.name} · Артем`;
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
