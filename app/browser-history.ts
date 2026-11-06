export const HISTORY_ENTRY_EVENT = 'reppy:history-entry';

export function historyIndex() {
  const index: unknown = window.history.state?.reppyIndex;
  if (typeof index === 'number' && Number.isSafeInteger(index)) return index;
  const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
  return navigation?.currentEntry?.index;
}

export function replaceHistoryEntry(state: Record<string, unknown>, url = window.location.href, index = historyIndex() ?? 0) {
  const next = { ...state, reppyIndex: index };
  // hashchange and popstate can describe the same entry. Avoid charging
  // WebKit's History API rate limit for an unchanged state.
  if (url === window.location.href) {
    try { if (JSON.stringify(window.history.state) === JSON.stringify(next)) return; } catch { /* Non-JSON history states still use the browser's structured clone. */ }
  }
  window.history.replaceState(next, '', url);
}

export function pushHistoryEntry(state: Record<string, unknown>, url = window.location.href) {
  window.history.pushState({ ...state, reppyIndex: (historyIndex() ?? 0) + 1 }, '', url);
  window.dispatchEvent(new Event(HISTORY_ENTRY_EVENT));
}
