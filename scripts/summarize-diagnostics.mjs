import { readFile } from 'node:fs/promises';
// Input is the exported diagnostic JSON, never HAR/localStorage/backup.
if (!process.argv[2]) throw new Error('Provide reppy-activity-log.json');
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (report.version !== 2 || !Array.isArray(report.operations)) throw new Error('Expected diagnostic export v2');
const end = process.argv[3] ? Date.parse(process.argv[3]) : Date.now();
if (!Number.isFinite(end)) throw new Error('Invalid UTC window end');
const latest = new Map();
for (const event of report.operations) {
  const at = Date.parse(event.at);
  if (at > end || at < end - 300000 || !/^[0-9a-f-]{36}$/i.test(event.operationId ?? '') || !Number.isFinite(event.durationMs)) continue;
  const previous = latest.get(event.operationId);
  if (!previous || Date.parse(previous.at) <= at) latest.set(event.operationId, event);
}
const groups = new Map();
for (const event of latest.values()) {
  const operation = ['load', 'auth.request', 'database.request', 'function.request', 'ui.render', 'history.push', 'history.replace'].includes(event.operation) ? event.operation : 'business.command';
  const group = groups.get(operation) ?? []; group.push(event); groups.set(operation, group);
}
const metrics = [...groups].map(([operation, events]) => {
  const finished = events.filter(e => ['success', 'error'].includes(e.outcome));
  const times = finished.map(e => e.durationMs).sort((a,b) => a-b);
  const errors = finished.filter(e => e.outcome === 'error').length;
  return { operation, finished: finished.length, errors, errorRate: finished.length ? errors / finished.length : null,
    pending: events.filter(e => ['pending', 'retry'].includes(e.outcome)).length,
    p95Ms: times.length >= 20 ? times[Math.ceil(times.length * .95) - 1] : null, maxMs: times.at(-1) ?? null };
});
console.log(JSON.stringify({ windowEnd: new Date(end).toISOString(), windowSeconds: 300, scope: 'bounded-local-export-not-global-SLO', metrics }, null, 2));
