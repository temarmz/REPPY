import { getActivityLog, recordActivity } from './activity-log.ts';
import { APP_RELEASE } from './release.ts';

type Outcome = 'success' | 'error' | 'retry' | 'pending';
type Diagnostic = {
  at: string; release: string; operationId: string; operation: string;
  outcome: Outcome; durationMs: number; code?: string; requestId?: string;
};
const operations = new Set(['load', 'auth.request', 'function.request', 'database.request', 'notification.delivery', 'ui.render', 'history.push', 'history.replace',
  'exercise-definition.create', 'exercise-definition.update', 'student.create', 'student.update', 'student.invitation.delete',
  'assignment.create', 'assignment.update', 'assignment.delete', 'session.start', 'session.progress', 'session.complete', 'session.charge',
  'session.feedback', 'session.archive', 'subscription.payment.create', 'subscription.payment.update', 'subscription.payment.delete', 'subscription.clear']);
const KEY = 'reppy-persistence-diagnostics-v2';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const codes = /^(HTTP_[1-5][0-9]{2}|REPPY_(TIMEOUT|NETWORK|CANCELLED|CONFLICT|PENDING)|PT409|[0-9]{5}|UNKNOWN)$/;
function sanitize(raw: unknown): Diagnostic | undefined {
  if (!raw || typeof raw !== 'object') return;
  const e = raw as Diagnostic;
  if (!operations.has(e.operation) || !uuid(e.operationId) || !['success', 'error', 'retry', 'pending'].includes(e.outcome)
    || !Number.isFinite(e.durationMs) || e.durationMs < 0 || typeof e.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.at)
    || typeof e.release !== 'string' || !/^(?:development|(?:ios-)?[a-f0-9]{40}-(?:local|[0-9]+|drill-(?:baseline|candidate))-[0-9]+)$/.test(e.release)) return;
  return { at: e.at, release: e.release, operationId: e.operationId, operation: e.operation, outcome: e.outcome,
    durationMs: Math.round(e.durationMs), code: codes.test(e.code ?? '') ? e.code : undefined, requestId: uuid(e.requestId) ? e.requestId : undefined };
}
function readEntries(): Diagnostic[] {
  try {
    // Older UI diagnostics stored raw exceptions/URLs. Remove them on upgrade.
    globalThis.localStorage?.removeItem('reppy-ui-errors-v1');
    globalThis.localStorage?.removeItem('reppy-persistence-diagnostics-v1');
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.slice(-200).map(sanitize).filter((e): e is Diagnostic => Boolean(e)) : [];
  } catch { return []; }
}
const entries = readEntries();
export function getPersistenceDiagnostics() { return entries.map((entry) => ({ ...entry })); }
export function diagnosticReport() {
  return { version: 2, release: APP_RELEASE, platform: 'web', scope: 'current-tab-and-recent-operations', events: getActivityLog(), operations: getPersistenceDiagnostics() };
}
export function downloadActivityLog() {
  recordActivity('diagnostics.export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(diagnosticReport(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'reppy-activity-log.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Only allowlisted codes; never serialize exception messages, URLs, payloads or account IDs.
export function recordPersistence(operation: string, outcome: Outcome, startedAt: number, reason?: unknown, operationId: string = crypto.randomUUID(), requestId?: string) {
  const rawCode = reason && typeof reason === 'object' && 'code' in reason ? reason.code : undefined;
  const entry = sanitize({ at: new Date().toISOString(), release: APP_RELEASE, operation, outcome, operationId,
    durationMs: Math.max(0, performance.now() - startedAt), code: typeof rawCode === 'string' && codes.test(rawCode) ? rawCode : undefined, requestId });
  if (!entry) return;
  if (outcome !== 'pending') recordActivity(`operation.${operation}`, outcome);
  entries.push(entry);
  if (entries.length > 200) {
    const ordinary = entries.findIndex((item) => item.outcome === 'success' && item.durationMs <= 5000);
    entries.splice(ordinary < 0 ? 0 : ordinary, 1);
  }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(entries)); } catch { /* Reporting never blocks saving. */ }
  if (outcome === 'error' || outcome === 'pending' || entry.durationMs > 5000) console.warn('REPPY operation', entry);
}
