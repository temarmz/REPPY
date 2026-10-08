type Diagnostic = {
  at: string;
  operation: string;
  outcome: 'success' | 'error' | 'retry';
  durationMs: number;
  code?: string;
};

const KEY = 'reppy-persistence-diagnostics-v1';
function readEntries(): Diagnostic[] {
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.slice(-60).filter((entry) => entry && typeof entry.at === 'string'
      && /^[a-z.-]+$/.test(entry.operation) && ['success', 'error', 'retry'].includes(entry.outcome)
      && Number.isFinite(entry.durationMs)).map(({ at, operation, outcome, durationMs, code }) => ({
        at, operation, outcome, durationMs, code: typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : undefined,
      }));
  } catch { return []; }
}
const entries: Diagnostic[] = readEntries();

export function getPersistenceDiagnostics() { return entries.map((entry) => ({ ...entry })); }

export function downloadPersistenceDiagnostics() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(getPersistenceDiagnostics(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reppy-saving-log.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// No account/session IDs, request bodies, URLs, tokens or error messages.
export function recordPersistence(operation: string, outcome: Diagnostic['outcome'], startedAt: number, reason?: unknown) {
  const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : undefined;
  const entry: Diagnostic = { at: new Date().toISOString(), operation, outcome,
    durationMs: Math.round(performance.now() - startedAt), code: code?.slice(0, 64) };
  entries.push(entry);
  if (entries.length > 60) {
    const ordinary = entries.findIndex((item) => item.outcome === 'success' && item.durationMs <= 5000);
    entries.splice(ordinary < 0 ? 0 : ordinary, 1);
  }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(entries)); } catch { /* Diagnostics must never block saving. */ }
  if (outcome === 'error' || entry.durationMs > 5000) console.warn('REPPY persistence', entry);
}
