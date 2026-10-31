import { InitialsAvatar } from './avatar';
import { UI_ASSETS } from './assets';
import { NavigationButton } from './patterns';
import { Inline, Box, Header, Image, Aside, Strong, Small, Nav } from './elements';
import { Button } from './controls';
import { useLayoutEffect, type ReactNode } from 'react';
import Icon, { type IconName } from './icon';
import { observeMobileViewport } from '../mobile-viewport';
import { observeWorkoutFieldFocus } from '../workout-field-focus';

export type AppArea = 'trainer' | 'student';
export type AppTheme = 'dark' | 'light';

type NavigationItem = {
  label: string;
  icon: IconName;
  route: string;
};

const NAVIGATION: Record<AppArea, NavigationItem[]> = {
  trainer: [
    { label: 'Главная', icon: 'home', route: '/trainer' },
    { label: 'Календарь', icon: 'calendar', route: '/trainer/calendar' },
    { label: 'Ученики', icon: 'users', route: '/trainer/clients' },
    { label: 'Заметки', icon: 'notes', route: '/trainer/notes' },
    { label: 'Профиль', icon: 'user', route: '/trainer/profile' },
  ],
  student: [
    { label: 'Сегодня', icon: 'calendar', route: '/student' },
    { label: 'Календарь', icon: 'calendar', route: '/student/calendar' },
    { label: 'Заметки', icon: 'notes', route: '/student/notes' },
    { label: 'Профиль', icon: 'user', route: '/student/profile' },
  ],
};

export function canonicalNavigationRoute(area: AppArea, path: string) {
  if (area === 'trainer') {
    if (/^\/trainer\/(calendar|schedule|assignments|sessions)(?:\/|$)/.test(path)) return '/trainer/calendar';
    if (/^\/trainer\/clients(?:\/|$)/.test(path)) return '/trainer/clients';
    if (/^\/trainer\/profile(?:\/|$)/.test(path)) return '/trainer/profile';
    if (/^\/trainer\/notes(?:\/|$)/.test(path)) return '/trainer/notes';
    return path === '/trainer' ? '/trainer' : null;
  }

  if (path === '/student/notes') return '/student/notes';
  if (/^\/student\/calendar(?:\/|$)/.test(path)) return '/student/calendar';
  if (/^\/student\/history(?:\/|$)/.test(path)) return '/student/calendar';
  if (/^\/student\/profile(?:\/|$)/.test(path)) return '/student/profile';
  if (path === '/student' || /^\/student\/(assignments|workout)(?:\/|$)/.test(path)) return '/student';
  return null;
}

export default function AppShell({
  area,
  path,
  displayName,
  hideBottomNav,
  onNavigateTab,
  systemStatus,
  children,
}: {
  area: AppArea;
  path: string;
  displayName: string;
  hideBottomNav: boolean;
  onNavigate?: (path: string, replace?: boolean) => void;
  onNavigateTab: (path: string) => void;
  systemStatus?: ReactNode;
  children: ReactNode;
}) {
  const nav = NAVIGATION[area];
  const activeRoute = canonicalNavigationRoute(area, path);
  const stopPageMomentum = () => { const page = document.querySelector<HTMLElement>('.page-wrap'); if (page) page.scrollTo({ top: page.scrollTop, behavior: 'instant' }); };
  const navigateTab = (route: string) => { stopPageMomentum(); onNavigateTab(route); };
  const focusMode = /^\/student\/(?:calendar\/)?(workout|finish|success)\//.test(path) || path.startsWith('/trainer/workout/');

  useLayoutEffect(() => observeWorkoutFieldFocus(window, document), []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('app-viewport-locked', !focusMode);
    document.body.classList.toggle('app-viewport-locked', !focusMode);
    // Portalled dialogs also need these bounds while the workout itself uses
    // document scrolling in focus mode.
    const stopViewport = observeMobileViewport(window, document.documentElement);
    return () => {
      stopViewport();
      document.documentElement.classList.remove('app-viewport-locked');
      document.body.classList.remove('app-viewport-locked');
    };
  }, [focusMode]);

  const navigation = (
    <>
      {nav.map((item) => (
        <NavigationButton key={item.route} active={activeRoute === item.route} onClick={() => navigateTab(item.route)}>
          <Inline><Icon name={item.icon} /></Inline>{item.label}
        </NavigationButton>
      ))}
    </>
  );

  return (
    <Box className={`app-shell ${area} ${focusMode ? 'focus-mode' : ''}`}>
      {!focusMode && <Header className="topbar">
        <Button className="brand-mark brand-button" type="button" onClick={() => onNavigateTab(`/${area}`)} aria-label="REPPY — на стартовый экран">
          <Image className="brand-logo" src={UI_ASSETS.wordmark} alt="" />
        </Button>
      </Header>}

      {systemStatus}

      {!focusMode && <Aside className="desktop-nav" aria-label="Основная навигация">
        <Box className="profile-block">
          <InitialsAvatar className="profile-avatar" name={displayName} />
          <Box><Strong>{displayName}</Strong><Small>{area === 'trainer' ? 'Персональный тренер' : 'Ученик'}</Small></Box>
        </Box>
        <Nav>{navigation}</Nav>
      </Aside>}

      <Box className="page-wrap page-transition">{children}</Box>

      {!focusMode && !hideBottomNav && <Nav className="bottom-nav" data-navigation-count={nav.length} onPointerDownCapture={stopPageMomentum} aria-label="Основная навигация">
        {nav.map((item) => (
          <NavigationButton key={item.route} active={activeRoute === item.route} aria-label={item.label} title={item.label} onClick={() => navigateTab(item.route)}>
            <Inline><Icon name={item.icon} /></Inline><Small>{item.label}</Small>
          </NavigationButton>
        ))}
      </Nav>}
    </Box>
  );
}
