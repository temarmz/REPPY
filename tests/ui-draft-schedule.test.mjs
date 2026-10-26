import assert from 'node:assert/strict';
import test from 'node:test';
import { isDraftDateString, isDraftTimeString } from '../app/ui-persistence.ts';

test('restored dates are real calendar dates, including leap days and dates in the past', () => {
  for (const value of ['2024-02-29', '2000-01-01', '2030-12-31']) assert.equal(isDraftDateString(value), true);
  for (const value of [undefined, null, {}, [], 20261026, '', 'not-a-date', '2025-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '2026-01-01T12:00:00Z']) {
    assert.equal(isDraftDateString(value), false, String(value));
  }
});

test('restored time permits an unfinished empty field but not invalid hours, minutes or non-text values', () => {
  for (const value of ['', '00:00', '09:05', '23:59']) assert.equal(isDraftTimeString(value), true);
  for (const value of [undefined, null, {}, [], 1800, '9:05', '24:00', '23:60', '18:00:00', 'invalid']) {
    assert.equal(isDraftTimeString(value), false, String(value));
  }
});
