import { Box } from './ui/elements';
import { Activity, Suspense, useEffect, useState, type ReactNode } from 'react';
import { LoadingScreen } from './onboarding-screens';
import { RELEASE_ROUTE_STATE_EVENT, RoutePathContext } from './navigation';

// Keep the React state and DOM of visited screens for the lifetime of this
// account's cabinet. Activity suspends effects on inactive screens (timers,
// navigation guards, subscriptions) while preserving their inputs and state.
export default function RetainedRouteViews({ path, renderRoute }: {
  path: string;
  renderRoute: (path: string) => ReactNode;
}) {
  const [cache, setCache] = useState({ visited: [path], released: [] as string[] });
  // History traversal is asynchronous. Keep a released active view until the
  // route changes, then remove it so Back cannot revive a discarded draft.
  const retained = cache.visited.filter((route) => route === path || !cache.released.includes(route));
  const routes = retained.includes(path) ? retained : [...retained, path];
  if (!cache.visited.includes(path) || cache.released.some((route) => route !== path)) {
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

  return routes.map((route) => (
    <Activity key={route} mode={route === path ? 'visible' : 'hidden'}>
      <Box data-route-view={route} data-route-active={route === path ? 'true' : 'false'}>
        <RoutePathContext value={route}>
          <Suspense fallback={<LoadingScreen message="Загружаем экран…" />}>
            {renderRoute(route)}
          </Suspense>
        </RoutePathContext>
      </Box>
    </Activity>
  ));
}
