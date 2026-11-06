import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeProgress } from '../app/merge-progress.ts';

test('deletion cannot silently discard concurrent edits to that exercise or set', () => {
  const base = [{ id: 'a', coachNote: '' }, { id: 'b', coachNote: '' }];
  assert.throws(() => mergeProgress(base, [base[1]], [{ ...base[0], coachNote: 'Remote' }, base[1]]), { code: 'REPPY_CONFLICT' });
  assert.deepEqual(mergeProgress(base, [base[1]], base), [base[1]]);
});

test('exercise reorder preserves concurrently edited content by identity', () => {
  const base = [{ id: 'a', coachNote: '' }, { id: 'b', coachNote: '' }];
  assert.deepEqual(mergeProgress(base, [base[1], base[0]], [{ ...base[0], coachNote: 'Remote' }, base[1]]),
    [base[1], { ...base[0], coachNote: 'Remote' }]);
});

test('independent edits are not blocked by the shared last-edit timestamp', () => {
  const base = { updatedAt: '2026-11-05T10:00:00Z', name: 'Plan', coachNote: '' };
  const local = { ...base, updatedAt: '2026-11-05T10:01:00Z', name: 'Renamed' };
  const remote = { ...base, updatedAt: '2026-11-05T10:02:00Z', coachNote: 'Remote' };
  assert.deepEqual(mergeProgress(base, local, remote), { ...local, coachNote: 'Remote', updatedAt: remote.updatedAt });
});
