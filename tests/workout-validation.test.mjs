import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../app/reppy-data.ts';
import { applyReppyCommand } from '../app/reppy-commands.ts';

test('invalid submission creates nothing; correcting and retrying creates exactly one assignment', () => {
  const state = createInitialState();
  const assignment = structuredClone(state.assignments[0]);
  assignment.id = crypto.randomUUID();
  assignment.workoutSnapshot.exercises[0].plannedSets[0].targetReps = 0;
  const command = { type: 'assignment.create', assignment };
  assert.throws(() => applyReppyCommand(state, command), /больше нуля/);
  assert.equal(state.assignments.some(a => a.id === assignment.id), false);
  assignment.workoutSnapshot.exercises[0].plannedSets[0] = { targetReps: 8, targetWeight: 0 };
  const saved = applyReppyCommand(state, command);
  assert.equal(applyReppyCommand(saved, command).assignments.filter(a => a.id === assignment.id).length, 1);
});
