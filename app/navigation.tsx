import { useEffect, useRef, useState } from 'react';
import ConfirmationModal from './confirmation-modal';
import { hasOpenModalLayers } from './modal-frame';

const NAVIGATION_EVENT = 'reppy:navigate';

type NavigationBlocker = (proceed: () => void) => void;

export type ReppyScrollPosition = {
  pageTop: number;
  pageLeft: number;
  windowTop: number;
  windowLeft: number;
};

export const TOP_SCROLL_POSITION: ReppyScrollPosition = { pageTop: 0, pageLeft: 0, windowTop: 0, windowLeft: 0 };

let activeNavigationBlocker: NavigationBlocker | null = null;
let restoringBlockedHistory = false;
let pendingHistoryBlocker: NavigationBlocker | null = null;

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
  return `reppy-ui:scroll:${path}`;
}

function loadRouteScrollPosition(path: string): ReppyScrollPosition {
  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey(path));
    if (raw) return { ...TOP_SCROLL_POSITION, ...JSON.parse(raw) };
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
  window.history.replaceState({ ...currentState, reppyScroll: currentScrollPosition() }, '', window.location.href);
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
    restoreScrollPosition(loadRouteScrollPosition(path));
    saveCurrentScrollPosition();
    return;
  }
  saveCurrentScrollPosition();
  const previousState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const { reppyModal: _modalEntry, ...navigationState } = previousState;
  const nextScroll = loadRouteScrollPosition(path);
  if (replace || _modalEntry) {
    window.history.replaceState({ ...navigationState, reppyEntry: true, reppyScroll: nextScroll }, '', `#${path}`);
  } else {
    window.history.pushState({ ...previousState, reppyEntry: true, reppyScroll: nextScroll }, '', `#${path}`);
  }
  notifyNavigation();
}

export function replaceInitialRoute(path: string) {
  window.history.replaceState({ reppyEntry: false, reppyScroll: TOP_SCROLL_POSITION }, '', `#${path}`);
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

export function goBack(fallback: string) {
  const proceed = () => {
    saveCurrentScrollPosition();
    if (window.history.state?.reppyEntry) {
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
    const commitPath = () => {
      const nextPath = hashPath();
      currentPathRef.current = nextPath;
      setPath(nextPath);
    };
    const handleNavigation = (event?: Event) => {
      if (event?.type === 'hashchange' && restoringBlockedHistory) return;
      if (event?.type === 'popstate' && hasOpenModalLayers()) {
        commitPath();
        return;
      }
      if (event?.type === 'popstate' && restoringBlockedHistory) {
        restoringBlockedHistory = false;
        const blocker = pendingHistoryBlocker;
        pendingHistoryBlocker = null;
        commitPath();
        blocker?.(() => window.history.go(window.history.state?.reppyModal ? -2 : -1));
        return;
      }
      if (event?.type === 'popstate' && activeNavigationBlocker && hashPath() !== currentPathRef.current) {
        restoringBlockedHistory = true;
        pendingHistoryBlocker = activeNavigationBlocker;
        window.history.forward();
        return;
      }
      commitPath();
    };
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    return () => {
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    };
  }, []);

  return path;
}

export function useRouteScrollRestoration(path: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const position = window.history.state?.reppyScroll ?? loadRouteScrollPosition(path);
    let restoreFrame = 0;
    const renderFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => restoreScrollPosition(position));
    });
    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [path, ready]);

  useEffect(() => {
    if (!ready) return;
    const page = document.querySelector<HTMLElement>('.page-wrap');
    let saveFrame = 0;
    const scheduleSave = () => {
      if (saveFrame) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        saveCurrentScrollPosition();
      });
    };
    page?.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('scroll', scheduleSave, { passive: true });
    return () => {
      if (saveFrame) window.cancelAnimationFrame(saveFrame);
      page?.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('scroll', scheduleSave);
    };
  }, [path, ready]);
}

export function useUnsavedNavigationGuard(isDirty: boolean, onDiscard?: () => void) {
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const blockerRef = useRef<NavigationBlocker | null>(null);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
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
        onClose={() => setPendingNavigation(null)}
        onConfirm={discardAndContinue}
      />
    ) : null,
  };
}
