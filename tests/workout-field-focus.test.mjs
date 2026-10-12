import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldScrollDelta } from '../app/workout-field-focus.ts';

test('поле над клавиатурой не вызывает прокрутку, скрытое перемещается только на нужное расстояние', () => {
  assert.equal(fieldScrollDelta({ top: 150, bottom: 200 }, 100, 400), 0);
  assert.equal(fieldScrollDelta({ top: 380, bottom: 440 }, 100, 400), 40);
  assert.equal(fieldScrollDelta({ top: 70, bottom: 130 }, 100, 400), -30);
  assert.equal(fieldScrollDelta({ top: 70, bottom: 130 }, 400, 100), 0);
  assert.equal(fieldScrollDelta({ top: 70, bottom: 430 }, 100, 400), -30);
});
