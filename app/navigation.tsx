import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ConfirmationModal from './ui/confirmation-modal';
import { hasOpenModalLayers } from './ui/modal-frame';
import { HISTORY_ENTRY_EVENT, historyIndex, pushHistoryEntry, replaceHistoryEntry } from './browser-history';

const NAVIGATION_EVENT = 'reppy:navigate';
export const RELEASE_ROUTE_STATE_EVENT = 'reppy:release-route-state';
export const RoutePathContext = createContext<string | null>(null);

export function useRoutePath() {
  return useContext(RoutePathContext) ?? hashPath();
}

type NavigationBlocker = (proceed: () => void) => void;

export type ReppyScrollPosition = {
  pageTop: number;
  pageLeft: number;
  windowTop: number;
  windowLeft: number;
};

export const TOP_SCROLL_POSITION: ReppyScrollPosition = { pageTop: 0, pageLeft: 0, windowTop: 0, windowLeft: 0 };

let activeNavigationBlocker: NavigationBlocker | null = null;
let navigationScope = 'demo';
let historyTraversalPending = false;
let historyTraversalFallback = 0;

function finishHistoryTraversal() {
  historyTraversalPending = false;
  window.clearTimeout(historyTraversalFallback);
  historyTraversalFallback = 0;
}

export function hashPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.hash.replace(/^#/, '') || '/';
}

function currentScrollPosition(): ReppyScrollPosition {
  const page = document.querySelector<HTMLElement>('.page-wrap');
  return {
    pageTop: page?.scrollTop ?? 0,
    pageLeft: page?.scrollLeft ?? 0,
    windowTop: window.scrollY,
    windowLeft: window.scrollX,
  };
}

function scrollStorageKey(path: string) {
  return `reppy-ui:scroll:${navigationScope}:${path}`;
}

function loadRouteScrollPosition(path: string): ReppyScrollPosition {
  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey(path));
    if (raw) {
      const position = { ...TOP_SCROLL_POSITION, ...JSON.parse(raw) };
      if (Object.values(position).every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return position;
    }
  } catch {
    // Scroll restoration is best-effort when storage is unavailable.
  }
  return TOP_SCROLL_POSITION;
}

function saveRouteScrollPosition(path: string, position = currentScrollPosition()) {
  try {
    window.sessionStorage.setItem(scrollStorageKey(path), JSON.stringify(position));
  } catch {
    // The current history entry still keeps the position in memory.
  }
}

function saveCurrentScrollPosition() {
  saveRouteScrollPosition(hashPath());
  const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  replaceHistoryEntry({ ...currentState, reppyScroll: currentScrollPosition() });
}

function restoreScrollPosition(position: ReppyScrollPosition) {
  document.querySelector<HTMLElement>('.page-wrap')?.scrollTo({ top: position.pageTop, left: position.pageLeft, behavior: 'auto' });
  window.scrollTo({ top: position.windowTop, left: position.windowLeft, behavior: 'auto' });
}

function notifyNavigation() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function performNavigation(path: string, replace = false) {
  if (hashPath() === path) {
    return;
  }
  finishHistoryTraversal();
  saveCurrentScrollPosition();
  const previousState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const { reppyModal: _modalEntry, ...navigationState } = previousState;
  const nextScroll = loadRouteScrollPosition(path);
  if (replace || _modalEntry) {
    replaceHistoryEntry({ ...navigationState, reppyEntry: true, reppyScroll: nextScroll }, `#${path}`);
  } else {
    pushHistoryEntry({ ...previousState, reppyEntry: true, reppyScroll: nextScroll }, `#${path}`);
  }
  notifyNavigation();
}

export function replaceInitialRoute(path: string) {
  replaceHistoryEntry({ reppyEntry: false, reppyScroll: loadRouteScrollPosition(path) }, `#${path}`);
  notifyNavigation();
}

export function go(path: string, replace = false) {
  const proceed = () => performNavigation(path, replace);
  if (activeNavigationBlocker) {
    activeNavigationBlocker(proceed);
    return;
  }
  proceed();
}

export function goToMenuTab(path: string) {
  try { window.sessionStorage.removeItem(`reppy-ui:calendar-day:${path.startsWith('/student') ? 'student' : 'trainer'}`); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent('reppy:tab-reset', { detail: path }));
  // The current screen and its draft stay mounted in Activity. Leaving it for
  // another menu tab is not a discard, so an unsaved-form prompt is unnecessary.
  performNavigation(path, true);
}

export function goBack(fallback: string) {
  const proceed = () => {
    if (historyTraversalPending) return;
    saveCurrentScrollPosition();
    if (window.history.state?.reppyEntry) {
      historyTraversalPending = true;
      historyTraversalFallback = window.setTimeout(finishHistoryTraversal, 1200);
      window.history.go(window.history.state?.reppyModal ? -2 : -1);
      return;
    }
    performNavigation(fallback);
  };
  if (activeNavigationBlocker) {
    activeNavigationBlocker(proceed);
    return;
  }
  proceed();
}

export function useHashNavigation() {
  const [path, setPath] = useState('/');
  const currentPathRef = useRef('/');

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    let currentIndex = historyIndex() ?? 0;
    let restoring: { delta: number; blocker: NavigationBlocker | null } | null = null;
    replaceHistoryEntry(window.history.state ?? {}, window.location.href, currentIndex);
    const commitPath = () => {
      finishHistoryTraversal();
      const nextPath = hashPath();
      // New hash entries have null state. Legacy app entries without a position
      // retain the previous one-step Back fallback on older browsers.
      currentIndex = historyIndex() ?? currentIndex + (window.history.state ? -1 : 1);
      replaceHistoryEntry(window.history.state ?? {}, window.location.href, currentIndex);
      currentPathRef.current = nextPath;
      setPath(nextPath);
    };
    const handleNavigation = (event?: Event) => {
      if (event?.type === 'hashchange' && restoring) return;
      if (event?.type === 'popstate' && restoring) {
        const { delta, blocker } = restoring;
        restoring = null;
        commitPath();
        blocker?.(() => window.history.go(delta));
        return;
      }
      if (event?.type === 'popstate' && activeNavigationBlocker && hashPath() !== currentPathRef.current) {
        const targetIndex = historyIndex() ?? currentIndex + ((event as PopStateEvent).state ? -1 : 1);
        replaceHistoryEntry(window.history.state ?? {}, window.location.href, targetIndex);
        const delta = targetIndex - currentIndex;
        if (!delta) { commitPath(); return; }
        // A modal Back dismisses the modal; restore the form without opening
        // another discard prompt. Otherwise replay the original traversal.
        restoring = { delta, blocker: hasOpenModalLayers() ? null : activeNavigationBlocker };
        window.history.go(-delta);
        return;
      }
      commitPath();
    };
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    window.addEventListener(HISTORY_ENTRY_EVENT, handleNavigation);
    return () => {
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
      window.removeEventListener(HISTORY_ENTRY_EVENT, handleNavigation);
    };
  }, []);

  return path;
}

export function useRouteScrollRestoration(path: string, ready: boolean, identity = 'demo') {
  useLayoutEffect(() => {
    navigationScope = identity;
    if (!ready) return;
    const page = document.querySelector<HTMLElement>('.page-wrap');
    if (!page) return;
    const position = window.history.state?.reppyScroll ?? loadRouteScrollPosition(path);
    let restoring = true;
    let restoreFrame = 0;
    let saveFrame = 0;
    const restoreWhenReady = () => {
      // Lazy screens must finish mounting before measuring their scroll height.
      const active = page.querySelector(`[data-route-view="${CSS.escape(path)}"]`);
      if (!active?.getClientRects().length || !active.querySelector('main:not([aria-busy="true"])')) return;
      observer.disconnect();
      restoreScrollPosition(position);
      restoreFrame = window.requestAnimationFrame(() => { restoring = false; });
    };
    const observer = new MutationObserver(restoreWhenReady);
    observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-route-active', 'style'] });
    restoreWhenReady();
    const scheduleSave = () => {
      if (restoring || saveFrame || hashPath() !== path) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        if (!restoring && hashPath() === path) saveCurrentScrollPosition();
      });
    };
    page.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('scroll', scheduleSave, { passive: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(restoreFrame);
      if (saveFrame) window.cancelAnimationFrame(saveFrame);
      page.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('scroll', scheduleSave);
    };
  }, [identity, path, ready]);
}

export function useUnsavedNavigationGuard(isDirty: boolean, onDiscard?: () => void) {
  const routePath = useRoutePath();
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const blockerRef = useRef<NavigationBlocker | null>(null);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  // A restored draft is already dirty on its first paint. Browser Back/Forward
  // can arrive before passive effects, so install the guard during commit.
  useLayoutEffect(() => {
    if (!isDirty) return;
    const blocker: NavigationBlocker = (proceed) => setPendingNavigation(() => proceed);
    blockerRef.current = blocker;
    activeNavigationBlocker = blocker;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (activeNavigationBlocker === blocker) activeNavigationBlocker = null;
      blockerRef.current = null;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const allowNextNavigation = () => {
    if (activeNavigationBlocker === blockerRef.current) activeNavigationBlocker = null;
    setPendingNavigation(null);
    // Save/discard explicitly ends this form's draft. A later visit should
    // initialize from fresh data; switching menu tabs never calls this method.
    window.dispatchEvent(new CustomEvent(RELEASE_ROUTE_STATE_EVENT, { detail: routePath }));
  };
  const discardAndContinue = () => {
    const proceed = pendingNavigation;
    onDiscardRef.current?.();
    allowNextNavigation();
    proceed?.();
  };

  return {
    allowNextNavigation,
    discardPrompt: pendingNavigation ? (
      <ConfirmationModal
        title="Выйти без сохранения?"
        text="Изменения на этом экране ещё не сохранены."
        confirmLabel="Выйти без сохранения"
        danger
        trackHistory={false}
        onClose={() => setPendingNavigation(null)}
        onConfirm={discardAndContinue}
      />
    ) : null,
  };
}
