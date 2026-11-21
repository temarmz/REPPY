import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exerciseDefinitionError } from '../app/exercise-definition-validation.ts';

const cases = JSON.parse(readFileSync(new URL('../ios/REPPYTests/Fixtures/DefinitionValidation.json', import.meta.url)));
for (const entry of cases) test(`shared definition validation: ${entry.title}`, () => {
  assert.equal(exerciseDefinitionError({ ...entry.definition, muscleGroups: entry.definition.muscle_groups }, entry.definitions) ?? null, entry.error);
});
