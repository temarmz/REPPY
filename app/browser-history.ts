export const HISTORY_ENTRY_EVENT = 'reppy:history-entry';

export function historyIndex() {
  const index: unknown = window.history.state?.reppyIndex;
  if (typeof index === 'number' && Number.isSafeInteger(index)) return index;
  const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
  return navigation?.currentEntry?.index;
}

export function replaceHistoryEntry(state: Record<string, unknown>, url = window.location.href, index = historyIndex() ?? 0) {
  window.history.replaceState({ ...state, reppyIndex: index }, '', url);
}

export function pushHistoryEntry(state: Record<string, unknown>, url = window.location.href) {
  window.history.pushState({ ...state, reppyIndex: (historyIndex() ?? 0) + 1 }, '', url);
  window.dispatchEvent(new Event(HISTORY_ENTRY_EVENT));
}
