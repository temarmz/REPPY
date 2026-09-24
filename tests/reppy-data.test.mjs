import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialState,
  createWorkoutSession,
  exerciseLibrary,
  findAssignmentWorkout,
  findSessionWorkout,
  getExerciseSetPlans,
  migrateDemoState,
  muscleGroups,
  repeatAssignment,
  updateSessionWorkout,
  workoutFromSession,
} from '../app/reppy-data.ts';

test('назначения хранят независимые снимки тренировок', () => {
  const state = createInitialState();
  const assignment = state.assignments.find((item) => item.id === 'assignment-maria-legs');
  const anotherAssignment = state.assignments.find((item) => item.id === 'assignment-anton-legs-1');

  assert.ok(assignment);
  assert.ok(anotherAssignment);
  assert.notStrictEqual(assignment.workoutSnapshot, anotherAssignment.workoutSnapshot);
  assert.notStrictEqual(assignment.workoutSnapshot.exercises, anotherAssignment.workoutSnapshot.exercises);

  const originalName = anotherAssignment.workoutSnapshot.name;
  const originalWeight = getExerciseSetPlans(anotherAssignment.workoutSnapshot.exercises[0])[0].targetWeight;
  assignment.workoutSnapshot.name = 'Изменённая тренировка';
  assignment.workoutSnapshot.exercises[0].plannedSets[0].targetWeight += 50;

  assert.equal(findAssignmentWorkout(state, anotherAssignment)?.name, originalName);
  assert.equal(getExerciseSetPlans(findAssignmentWorkout(state, anotherAssignment).exercises[0])[0].targetWeight, originalWeight);
});

test('миграция переносит старые шаблоны в снимки и удаляет устаревшие поля', () => {
  const legacy = structuredClone(createInitialState());
  const legacyWorkout = structuredClone(legacy.assignments[0].workoutSnapshot);
  legacy.schemaVersion = 4;
  legacy.workouts = [legacyWorkout];
  legacy.studentWorkoutVersions = [];
  legacy.assignments[0].workoutId = legacyWorkout.id;
  delete legacy.assignments[0].format;
  delete legacy.assignments[0].workoutSnapshot;
  legacy.sessions.push({
    id: 'legacy-session',
    assignmentId: legacy.assignments[0].id,
    studentId: legacy.assignments[0].studentId,
    workoutId: legacyWorkout.id,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: [],
  });

  const migrated = migrateDemoState(legacy);
  const assignment = migrated.assignments[0];
  const session = migrated.sessions.at(-1);

  assert.ok(assignment.workoutSnapshot.exercises.length > 0);
  assert.equal('workouts' in migrated, false);
  assert.equal('studentWorkoutVersions' in migrated, false);
  assert.equal('workoutId' in assignment, false);
  assert.equal('source' in assignment, false);
  assert.equal(assignment.format, 'in-person');
  assert.ok(session?.workoutSnapshot.exercises.length > 0);
  assert.equal('workoutId' in session, false);
  assert.notStrictEqual(session?.workoutSnapshot, assignment.workoutSnapshot);
  assert.equal(session?.recordedBy, 'student');
});


test('состояние использует явную версию схемы и единый массив подходов', () => {
  const state = createInitialState();
  assert.equal(state.schemaVersion, 6);
  assert.equal('workouts' in state, false);
  assert.equal('studentWorkoutVersions' in state, false);
  for (const workout of state.assignments.map((assignment) => assignment.workoutSnapshot)) {
    for (const exercise of workout.exercises) {
      assert.ok(Array.isArray(exercise.plannedSets));
      assert.equal('sets' in exercise, false);
      assert.equal('targetReps' in exercise, false);
      assert.equal('targetWeight' in exercise, false);
    }
  }
})

test('завершённая сессия читает собственный снимок, а не новое назначение', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const sessionWorkout = structuredClone(assignment.workoutSnapshot);
  sessionWorkout.name = 'Версия на момент выполнения';
  const session = {
    id: 'session-snapshot-test',
    assignmentId: assignment.id,
    studentId: assignment.studentId,
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


test('миграция удаляет агрегатные поля упражнения и сохраняет подходы', () => {
  const legacy = structuredClone(createInitialState());
  const exercise = legacy.assignments[0].workoutSnapshot.exercises[0];
  exercise.sets = 2;
  exercise.targetReps = 7;
  exercise.targetWeight = 42.5;
  delete exercise.plannedSets;
  delete legacy.schemaVersion;

  const migrated = migrateDemoState(legacy);
  const migratedExercise = migrated.assignments.find((assignment) => assignment.id === legacy.assignments[0].id).workoutSnapshot.exercises[0];

  assert.equal(migrated.schemaVersion, 6);
  assert.deepEqual(getExerciseSetPlans(migratedExercise), [
    { targetReps: 7, targetWeight: 42.5 },
    { targetReps: 7, targetWeight: 42.5 },
  ]);
  assert.equal('sets' in migratedExercise, false);
})

test('демо Артёма содержит пять тренировок ног с прогрессией и одно активное назначение', () => {
  const state = createInitialState();
  const activeAssignments = state.assignments.filter((assignment) => assignment.studentId === 'artem' && assignment.status === 'assigned');
  const completedAssignments = state.assignments.filter((assignment) => assignment.studentId === 'artem' && assignment.status === 'completed');
  const sessions = state.sessions
    .filter((session) => session.studentId === 'artem' && session.completedAt)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  assert.equal(activeAssignments.length, 1);
  assert.equal(activeAssignments[0].id, 'assignment-artem-push-today');
  assert.equal(completedAssignments.length, 5);
  assert.equal(sessions.length, 5);
  assert.ok(sessions.every((session) => session.workoutSnapshot.name === 'Ноги'));
  assert.ok(sessions.every((session) => session.results.every((result) => result.completed)));

  for (const exerciseId of ['squat', 'leg-press', 'deadlift']) {
    const bestSets = sessions.map((session) => {
      const exercise = session.workoutSnapshot.exercises.find((item) => item.exerciseId === exerciseId);
      assert.ok(exercise);
      const results = session.results.filter((result) => result.exerciseId === exercise.id);
      return results.sort((a, b) => b.actualWeight - a.actualWeight || b.actualReps - a.actualReps)[0];
    });
    assert.ok(bestSets.every((result, index) => index === 0 || result.actualWeight > bestSets[index - 1].actualWeight));
    assert.ok(bestSets.every((result, index) => index === 0 || result.actualReps >= bestSets[index - 1].actualReps));
    assert.ok(bestSets.at(-1).actualReps > bestSets[0].actualReps);
  }
});

test('повтор копирует тренировку тому же ученику и оставляет исходник независимым', () => {
  const state = createInitialState();
  const source = state.assignments[0];
  const sourceWorkout = structuredClone(source.workoutSnapshot);
  sourceWorkout.exercises[0].coachNote = 'Держи спину нейтрально';

  const repeated = repeatAssignment(source, sourceWorkout, '2026-09-10', '19:15', '2026-09-01T12:00:00.000Z');

  assert.equal(repeated.studentId, source.studentId);
  assert.equal('workoutId' in repeated, false);
  assert.equal('source' in repeated, false);
  assert.notEqual(repeated.workoutSnapshot.id, sourceWorkout.id);
  assert.equal(repeated.repeatedFromAssignmentId, source.id);
  assert.equal(repeated.scheduledFor, '2026-09-10');
  assert.equal(repeated.scheduledTime, '19:15');
  assert.equal(repeated.workoutSnapshot.exercises[0].coachNote, 'Держи спину нейтрально');
  repeated.workoutSnapshot.exercises.forEach((exercise, index) => {
    assert.notEqual(exercise.id, sourceWorkout.exercises[index].id);
  });

  repeated.workoutSnapshot.exercises[0].plannedSets[0].targetWeight += 20;
  assert.notEqual(getExerciseSetPlans(repeated.workoutSnapshot.exercises[0])[0].targetWeight, getExerciseSetPlans(sourceWorkout.exercises[0])[0].targetWeight);
});

test('онлайн-формат и инструкция упражнения сохраняются в повторе', () => {
  const state = createInitialState();
  const source = structuredClone(state.assignments[0]);
  source.format = 'online';
  delete source.scheduledTime;
  source.workoutSnapshot.exercises[0].instructionText = 'Поставь стопы под коленями и сохрани нейтральную спину.';
  source.workoutSnapshot.exercises[0].instructionVideo = {
    id: 'video-technique-1',
    name: 'Техника.mp4',
    mimeType: 'video/mp4',
    size: 2048,
    createdAt: '2026-09-01T12:00:00.000Z',
  };

  const repeated = repeatAssignment(source, source.workoutSnapshot, '2026-09-12', undefined, '2026-09-01T12:00:00.000Z');

  assert.equal(repeated.format, 'online');
  assert.equal(repeated.scheduledTime, undefined);
  assert.equal(repeated.workoutSnapshot.exercises[0].instructionText, source.workoutSnapshot.exercises[0].instructionText);
  assert.deepEqual(repeated.workoutSnapshot.exercises[0].instructionVideo, source.workoutSnapshot.exercises[0].instructionVideo);
  assert.notStrictEqual(repeated.workoutSnapshot.exercises[0].instructionVideo, source.workoutSnapshot.exercises[0].instructionVideo);
});

test('повтор завершённой тренировки берёт факт выполненных подходов и план остальных', () => {
  const state = createInitialState();
  const assignment = state.assignments[0];
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'trainer');
  const exercise = assignment.workoutSnapshot.exercises[0];
  const exerciseResults = session.results.filter((result) => result.exerciseId === exercise.id);
  exerciseResults[0].completed = true;
  exerciseResults[0].actualReps = 6;
  exerciseResults[0].actualWeight = 77.5;
  exerciseResults[1].actualReps = 99;
  exerciseResults[1].actualWeight = 999;

  const repeatedSource = workoutFromSession(session);
  const plans = getExerciseSetPlans(repeatedSource.exercises[0]);

  assert.deepEqual(plans[0], { targetReps: 6, targetWeight: 77.5 });
  assert.deepEqual(plans[1], getExerciseSetPlans(exercise)[1]);
  assert.notStrictEqual(repeatedSource, session.workoutSnapshot);
})

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
  const pullUps = legacy.assignments[0].workoutSnapshot.exercises[0];
  pullUps.exerciseId = 'pull-ups';
  pullUps.name = 'Подтягивания';
  delete pullUps.equipment;
  delete pullUps.loadMode;
  delete pullUps.plannedSets;
  pullUps.targetWeight = 25;

  const migrated = migrateDemoState(legacy);
  const migratedPullUps = migrated.assignments.find((assignment) => assignment.id === legacy.assignments[0].id).workoutSnapshot.exercises[0];

  assert.equal(migratedPullUps.loadMode, 'bodyweight');
  assert.ok(migratedPullUps.plannedSets.every((set) => set.targetWeight === 0));
});

test('библиотека упражнений покрывает основные мышечные группы', () => {
  assert.equal(exerciseLibrary.length, 66);
  assert.equal(new Set(exerciseLibrary.map((exercise) => exercise.id)).size, exerciseLibrary.length);
  for (const muscle of muscleGroups) {
    assert.ok(exerciseLibrary.filter((exercise) => exercise.primaryMuscle === muscle).length >= 3, `Недостаточно упражнений для категории «${muscle}»`);
  }
  assert.ok(exerciseLibrary.every((exercise) => exercise.equipment));
  assert.equal(exerciseLibrary.find((exercise) => exercise.id === 'side-plank')?.measureType, 'duration');
  assert.equal(exerciseLibrary.find((exercise) => exercise.id === 'nordic-curl')?.equipment, 'Свой вес');
});
