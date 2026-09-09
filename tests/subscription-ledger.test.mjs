import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chargeSubscriptionForSession,
  createSubscriptionPayment,
  recentSubscriptionPayments,
  refundSubscriptionForSession,
  subscriptionBalance,
  updateSubscriptionPayment,
} from '../app/subscription-ledger.ts';

const payment = (studentId, lessons, occurredAt) => createSubscriptionPayment(studentId, {
  lessons,
  amountRub: 11400,
  paymentMethod: 'cash',
  occurredAt,
}, `${occurredAt}T12:00:00.000Z`);

test('пополнение закрывает долг и оставляет доступный остаток', () => {
  const session = { id: 'session-debt', studentId: 'artem' };
  let entries = chargeSubscriptionForSession([], session, 'Ноги', '2026-09-01T10:00:00.000Z');
  entries = chargeSubscriptionForSession(entries, { id: 'session-debt-2', studentId: 'artem' }, 'Грудь', '2026-09-03T10:00:00.000Z');
  entries.push(payment('artem', 8, '2026-09-09'));

  assert.equal(subscriptionBalance(entries, 'artem'), 6);
});

test('одно завершение не может списать занятие дважды', () => {
  const session = { id: 'session-1', studentId: 'artem' };
  const once = chargeSubscriptionForSession([], session, 'Ноги', '2026-09-01T10:00:00.000Z');
  const twice = chargeSubscriptionForSession(once, session, 'Ноги', '2026-09-01T10:01:00.000Z');

  assert.equal(twice.length, 1);
  assert.equal(subscriptionBalance(twice, 'artem'), -1);
});

test('удаление списанной тренировки возвращает занятие один раз', () => {
  const session = { id: 'session-1', studentId: 'artem' };
  const charged = chargeSubscriptionForSession([payment('artem', 8, '2026-09-01')], session, 'Ноги', '2026-09-02T10:00:00.000Z');
  const refunded = refundSubscriptionForSession(charged, session, 'Ноги', '2026-09-03T10:00:00.000Z');
  const repeated = refundSubscriptionForSession(refunded, session, 'Ноги', '2026-09-03T10:01:00.000Z');

  assert.equal(subscriptionBalance(repeated, 'artem'), 8);
  assert.equal(repeated.length, 3);
});

test('тренер может исправить все поля пополнения', () => {
  const original = payment('artem', 8, '2026-09-01');
  const updated = updateSubscriptionPayment(original, {
    lessons: 10,
    amountRub: 15000,
    paymentMethod: 'transfer',
    occurredAt: '2026-09-02',
    comment: 'Исправлено тренером',
  }, '2026-09-02T14:00:00.000Z');

  assert.equal(updated.lessonDelta, 10);
  assert.equal(updated.amountRub, 15000);
  assert.equal(updated.paymentMethod, 'transfer');
  assert.equal(updated.occurredAt, '2026-09-02');
  assert.equal(updated.comment, 'Исправлено тренером');
  assert.equal(updated.updatedAt, '2026-09-02T14:00:00.000Z');
});

test('ученику возвращаются только последние пополнения', () => {
  const entries = [
    payment('artem', 8, '2026-08-01'),
    payment('artem', 8, '2026-09-01'),
    chargeSubscriptionForSession([], { id: 'session-1', studentId: 'artem' }, 'Ноги', '2026-09-02T10:00:00.000Z')[0],
  ];

  assert.deepEqual(recentSubscriptionPayments(entries, 'artem', 1).map((entry) => entry.occurredAt), ['2026-09-01']);
});
