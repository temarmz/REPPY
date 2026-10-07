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
  const [visited, setVisited] = useState([path]);
  const routes = visited.includes(path) ? visited : [...visited, path];
  if (routes !== visited) setVisited(routes);
  useEffect(() => {
    const release = (event: Event) => {
      const route = (event as CustomEvent<string>).detail;
      setVisited((current) => current.filter((item) => item !== route));
    };
    window.addEventListener(RELEASE_ROUTE_STATE_EVENT, release);
    return () => window.removeEventListener(RELEASE_ROUTE_STATE_EVENT, release);
  }, []);

  return routes.map((route) => (
    <Activity key={route} mode={route === path ? 'visible' : 'hidden'}>
      <div data-route-view={route} data-route-active={route === path ? 'true' : 'false'}>
        <RoutePathContext value={route}>
          <Suspense fallback={<LoadingScreen message="Загружаем экран…" />}>
            {renderRoute(route)}
          </Suspense>
        </RoutePathContext>
      </div>
    </Activity>
  ));
}
