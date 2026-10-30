import { Box } from './ui/elements';
import { Activity, Fragment, Suspense, useEffect, useState, type ReactNode } from 'react';
import { LoadingScreen } from './onboarding-screens';
import { go, RELEASE_ROUTE_STATE_EVENT, RoutePathContext } from './navigation';
import { AppErrorBoundary, AppErrorScreen } from './ui/app-status';

const MAX_RETAINED_ROUTES = 12;
type RetainedRoute = { path: string; failed: boolean; recovery: number };

// Keep recent screens in memory for tab restoration without growing the hidden
// DOM indefinitely during long sessions. Activity suspends inactive effects.
export default function RetainedRouteViews({ path, renderRoute }: {
  path: string;
  renderRoute: (path: string) => ReactNode;
}) {
  const [cache, setCache] = useState({ visited: [{ path, failed: false, recovery: 0 }] as RetainedRoute[], released: [] as string[] });
  // History traversal is asynchronous. Keep a released active view until the
  // route changes, then remove it so Back cannot revive a discarded draft.
  const retained = cache.visited.filter((route) => route.path === path || !cache.released.includes(route.path));
  const candidates = retained.some((route) => route.path === path) ? retained : [...retained, { path, failed: false, recovery: 0 }];
  const keep = new Set([path, ...candidates.filter((route) => route.path !== path).slice(-(MAX_RETAINED_ROUTES - 1)).map((route) => route.path)]);
  const routes = candidates.filter((route) => keep.has(route.path));
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
    <Box key={route.path} data-route-view={route.path} data-route-active={route.path === path ? 'true' : 'false'} hidden={route.path !== path}>
      <Activity mode={route.path === path ? 'visible' : 'hidden'}>
        <RoutePathContext value={route.path}>
          <AppErrorBoundary key={route.recovery} hideFallback onFailure={() => setCache((current) => ({ ...current,
            visited: current.visited.map((view) => view.path === route.path ? { ...view, failed: true } : view),
          }))}>
            <Suspense fallback={<LoadingScreen message="Загружаем экран…" />}>
              {renderRoute(route.path)}
            </Suspense>
          </AppErrorBoundary>
        </RoutePathContext>
      </Activity>
    </Box>
  ))}{routes.some((route) => route.path === path && route.failed) && <AppErrorScreen onRecover={() => {
    const home = path.startsWith('/student') ? '/student' : '/trainer';
    if (path !== home) window.dispatchEvent(new CustomEvent(RELEASE_ROUTE_STATE_EVENT, { detail: path }));
    // The destination can itself be failed, including recovery on the same URL.
    // Retry only that boundary; keep healthy screens and pending writes intact.
    setCache((current) => ({ ...current,
      visited: current.visited.map((route) => route.path === home && route.failed
        ? { ...route, failed: false, recovery: route.recovery + 1 } : route),
    }));
    go(home);
  }} />}</Fragment>;
}
