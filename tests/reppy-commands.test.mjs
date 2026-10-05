import assert from 'node:assert/strict';
import test from 'node:test';

import { applyReppyCommand } from '../app/reppy-commands.ts';
import { createInitialState, createWorkoutSession } from '../app/reppy-data.ts';

test('личное упражнение сохраняется в библиотеке тренера без дубля имени', () => {
  const state = createInitialState();
  const definition = {
    id: 'custom-exercise-balance',
    name: '  Баланс на подушке  ',
    equipment: 'Балансировочная подушка',
    loadMode: 'bodyweight',
    measureType: 'duration',
  };

  const created = applyReppyCommand(state, { type: 'exercise-definition.create', definition });
  const repeated = applyReppyCommand(created, {
    type: 'exercise-definition.create',
    definition: { ...definition, id: 'another-id', name: 'баланс на подушке' },
  });

  assert.deepEqual(created.customExercises, [{ ...definition, name: 'Баланс на подушке' }]);
  assert.strictEqual(repeated, created);
});

test('предметная команда изменяет только выбранное назначение', () => {
  const state = createInitialState();
  const original = state.assignments[0];
  const another = state.assignments[1];
  const updated = {
    ...original,
    scheduledFor: '2026-10-01',
    workoutSnapshot: { ...original.workoutSnapshot, name: 'Новый план' },
  };

  const next = applyReppyCommand(state, { type: 'assignment.update', assignment: updated });

  assert.equal(next.assignments.find((item) => item.id === original.id)?.scheduledFor, '2026-10-01');
  assert.equal(next.assignments.find((item) => item.id === original.id)?.workoutSnapshot.name, 'Новый план');
  assert.strictEqual(next.assignments.find((item) => item.id === another.id), another);
  assert.strictEqual(next.students, state.students);
  assert.strictEqual(next.sessions, state.sessions);
});

test('завершение сессии атомарно отмечает назначение и списывает занятие один раз', () => {
  const state = createInitialState();
  const assignment = state.assignments.find((item) => item.status === 'assigned');
  assert.ok(assignment);
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'student');
  const started = applyReppyCommand(state, { type: 'session.start', session });
  const command = {
    type: 'session.complete',
    sessionId: session.id,
    assignmentId: assignment.id,
    completedAt: '2026-09-28T12:00:00.000Z',
    chargeSubscription: true,
    workoutName: assignment.workoutSnapshot.name,
  };

  const completed = applyReppyCommand(started, command);
  const repeated = applyReppyCommand(completed, command);

  assert.equal(completed.assignments.find((item) => item.id === assignment.id)?.status, 'completed');
  assert.equal(completed.sessions.find((item) => item.id === session.id)?.subscriptionChargeStatus, 'charged');
  assert.equal(completed.subscriptionEntries.filter((entry) => entry.sessionId === session.id && entry.kind === 'session-charge').length, 1);
  assert.equal(repeated.subscriptionEntries.filter((entry) => entry.sessionId === session.id && entry.kind === 'session-charge').length, 1);
});

test('отзыв завершённой тренировки удаляет её и создаёт один возврат', () => {
  const state = createInitialState();
  const assignment = state.assignments.find((item) => item.status === 'assigned');
  assert.ok(assignment);
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'trainer');
  const started = applyReppyCommand(state, { type: 'session.start', session });
  const completed = applyReppyCommand(started, {
    type: 'session.complete',
    sessionId: session.id,
    assignmentId: assignment.id,
    completedAt: '2026-09-28T12:00:00.000Z',
    chargeSubscription: true,
    workoutName: assignment.workoutSnapshot.name,
  });
  const completedSession = completed.sessions.find((item) => item.id === session.id);
  assert.ok(completedSession);
  const workoutName = completedSession.workoutSnapshot.name;

  const archived = applyReppyCommand(completed, { type: 'session.archive', session: completedSession, workoutName });
  const repeated = applyReppyCommand(archived, { type: 'session.archive', session: completedSession, workoutName });

  assert.equal(archived.assignments.some((item) => item.id === session.assignmentId), false);
  assert.equal(archived.sessions.some((item) => item.id === session.id), false);
  assert.equal(repeated.subscriptionEntries.filter((entry) => entry.sessionId === session.id && entry.kind === 'session-refund').length, 1);
});

test('обратная связь не завершает незавершённую сессию неявно', () => {
  const state = createInitialState();
  const assignment = state.assignments.find((item) => item.status === 'assigned');
  assert.ok(assignment);
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'student');
  const started = applyReppyCommand(state, { type: 'session.start', session });

  const next = applyReppyCommand(started, {
    type: 'session.feedback',
    sessionId: session.id,
    mood: 'good',
    comment: '  Всё получилось  ',
  });

  const updated = next.sessions.find((item) => item.id === session.id);
  assert.equal(updated?.completedAt, undefined);
  assert.equal(updated?.mood, 'good');
  assert.equal(updated?.comment, 'Всё получилось');
});
