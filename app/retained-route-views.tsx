import { Box } from './ui/elements';
import { Activity, Fragment, Suspense, useEffect, useState, type ReactNode } from 'react';
import { LoadingScreen } from './onboarding-screens';
import { go, RELEASE_ROUTE_STATE_EVENT, RoutePathContext } from './navigation';
import { AppErrorBoundary, AppErrorScreen } from './ui/app-status';

const MAX_RETAINED_ROUTES = 12;

// Keep recent screens in memory for tab restoration without growing the hidden
// DOM indefinitely during long sessions. Activity suspends inactive effects.
export default function RetainedRouteViews({ path, renderRoute }: {
  path: string;
  renderRoute: (path: string) => ReactNode;
}) {
  const [cache, setCache] = useState({ visited: [path], released: [] as string[] });
  const [failedRoute, setFailedRoute] = useState<string | null>(null);
  // History traversal is asynchronous. Keep a released active view until the
  // route changes, then remove it so Back cannot revive a discarded draft.
  const retained = cache.visited.filter((route) => route === path || !cache.released.includes(route));
  const candidates = retained.includes(path) ? retained : [...retained, path];
  const keep = new Set([path, ...candidates.filter((route) => route !== path).slice(-(MAX_RETAINED_ROUTES - 1))]);
  const routes = candidates.filter((route) => keep.has(route));
  if (cache.visited.length !== routes.length || cache.visited.some((route, index) => route !== routes[index]) || cache.released.some((route) => route !== path)) {
    setCache({ visited: routes, released: cache.released.filter((route) => route === path) });
  }
  useEffect(() => {
    const release = (event: Event) => {
      const route = (event as CustomEvent<string>).detail;
      setCache((current) => ({ ...current, released: [...new Set([...current.released, route])] }));
    };
    window.addEventListener(RELEASE_ROUTE_STATE_EVENT, release);
    return () => window.removeEventListener(RELEASE_ROUTE_STATE_EVENT, release);
  }, []);

  // A failed screen must not dispose the account controller or pending writes.
  return <Fragment>{routes.map((route) => (
    <Activity key={route} mode={route === path ? 'visible' : 'hidden'}>
      <Box data-route-view={route} data-route-active={route === path ? 'true' : 'false'}>
        <RoutePathContext value={route}>
          <AppErrorBoundary hideFallback onFailure={() => setFailedRoute(route)}>
            <Suspense fallback={<LoadingScreen message="Загружаем экран…" />}>
              {renderRoute(route)}
            </Suspense>
          </AppErrorBoundary>
        </RoutePathContext>
      </Box>
    </Activity>
  ))}{failedRoute === path && <AppErrorScreen onRecover={() => {
    window.dispatchEvent(new CustomEvent(RELEASE_ROUTE_STATE_EVENT, { detail: path }));
    setFailedRoute(null);
    go(path.startsWith('/student') ? '/student' : '/trainer');
  }} />}</Fragment>;
}
