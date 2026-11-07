import { recordPersistence, downloadActivityLog } from './persistence-diagnostics';

export function recordUiError() {
  recordPersistence('ui.render', 'error', performance.now());
}
export function downloadUiErrorDiagnostics() { downloadActivityLog(); }
