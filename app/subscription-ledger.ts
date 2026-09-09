import {
  TRAINER_ID,
  makeId,
  type PaymentMethod,
  type SubscriptionEntry,
} from './reppy-data.ts';

export type PaymentInput = {
  lessons: number;
  amountRub: number;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  comment?: string;
};

export function subscriptionEntriesFor(
  entries: SubscriptionEntry[],
  studentId: string,
  trainerId = TRAINER_ID,
) {
  return entries
    .filter((entry) => entry.studentId === studentId && entry.trainerId === trainerId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
}

export function subscriptionBalance(
  entries: SubscriptionEntry[],
  studentId: string,
  trainerId = TRAINER_ID,
) {
  return entries.reduce((total, entry) => (
    entry.studentId === studentId && entry.trainerId === trainerId
      ? total + entry.lessonDelta
      : total
  ), 0);
}

export function recentSubscriptionPayments(
  entries: SubscriptionEntry[],
  studentId: string,
  limit = 3,
  trainerId = TRAINER_ID,
) {
  return subscriptionEntriesFor(entries, studentId, trainerId)
    .filter((entry) => entry.kind === 'payment')
    .slice(0, limit);
}

export function createSubscriptionPayment(
  studentId: string,
  input: PaymentInput,
  now = new Date().toISOString(),
  trainerId = TRAINER_ID,
): SubscriptionEntry {
  return {
    id: makeId('subscription-payment'),
    trainerId,
    studentId,
    kind: 'payment',
    lessonDelta: Math.max(1, Math.floor(input.lessons)),
    amountRub: Math.max(0, Math.round(input.amountRub)),
    paymentMethod: input.paymentMethod,
    occurredAt: input.occurredAt,
    createdAt: now,
    comment: input.comment?.trim() || undefined,
  };
}

export function updateSubscriptionPayment(
  entry: SubscriptionEntry,
  input: PaymentInput,
  now = new Date().toISOString(),
): SubscriptionEntry {
  if (entry.kind !== 'payment') return entry;
  return {
    ...entry,
    lessonDelta: Math.max(1, Math.floor(input.lessons)),
    amountRub: Math.max(0, Math.round(input.amountRub)),
    paymentMethod: input.paymentMethod,
    occurredAt: input.occurredAt,
    comment: input.comment?.trim() || undefined,
    updatedAt: now,
  };
}

export function chargeSubscriptionForSession(
  entries: SubscriptionEntry[],
  session: { id: string; studentId: string },
  workoutName: string,
  occurredAt: string,
  trainerId = TRAINER_ID,
) {
  const alreadyRecorded = entries.some((entry) => (
    entry.kind === 'session-charge'
    && entry.sessionId === session.id
    && entry.trainerId === trainerId
  ));
  if (alreadyRecorded) return entries;
  return [...entries, {
    id: `subscription-charge-${session.id}`,
    trainerId,
    studentId: session.studentId,
    kind: 'session-charge' as const,
    lessonDelta: -1,
    occurredAt,
    createdAt: occurredAt,
    sessionId: session.id,
    workoutName,
  }];
}

export function refundSubscriptionForSession(
  entries: SubscriptionEntry[],
  session: { id: string; studentId: string },
  workoutName: string,
  occurredAt = new Date().toISOString(),
  trainerId = TRAINER_ID,
) {
  const charge = entries.find((entry) => (
    entry.kind === 'session-charge'
    && entry.sessionId === session.id
    && entry.trainerId === trainerId
  ));
  const alreadyRefunded = entries.some((entry) => (
    entry.kind === 'session-refund'
    && entry.sessionId === session.id
    && entry.trainerId === trainerId
  ));
  if (!charge || alreadyRefunded) return entries;
  return [...entries, {
    id: `subscription-refund-${session.id}`,
    trainerId,
    studentId: session.studentId,
    kind: 'session-refund' as const,
    lessonDelta: 1,
    occurredAt,
    createdAt: occurredAt,
    sessionId: session.id,
    workoutName,
  }];
}

export function isSessionCharged(entries: SubscriptionEntry[], sessionId: string, trainerId = TRAINER_ID) {
  return entries.some((entry) => entry.kind === 'session-charge' && entry.sessionId === sessionId && entry.trainerId === trainerId)
    && !entries.some((entry) => entry.kind === 'session-refund' && entry.sessionId === sessionId && entry.trainerId === trainerId);
}
