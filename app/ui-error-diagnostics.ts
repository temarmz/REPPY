import { recordActivity } from './activity-log';
import { downloadActivityLog } from './persistence-diagnostics';

type UiErrorEntry = {
  at: string;
  routeArea: string;
  name: string;
  message: string;
  stack: string[];
  componentStack: string[];
};

const KEY = 'reppy-ui-errors-v1';

function readEntries(): UiErrorEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.slice(-10) as UiErrorEntry[] : [];
  } catch { return []; }
}

export function recordUiError(error: Error, componentStack: string) {
  recordActivity("ui.render", "error");
  const routeArea = location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/');
  const entry: UiErrorEntry = {
    at: new Date().toISOString(),
    routeArea,
    name: error.name.slice(0, 80),
    message: error.message.slice(0, 300),
    stack: (error.stack ?? '').split('\n').slice(0, 8),
    componentStack: componentStack.split('\n').filter(Boolean).slice(0, 12),
  };
  try { localStorage.setItem(KEY, JSON.stringify([...readEntries(), entry].slice(-10))); }
  catch { /* Error reporting must never cause a second crash. */ }
}

export function downloadUiErrorDiagnostics() { downloadActivityLog(); }
