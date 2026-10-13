import { InitialsAvatar } from './avatar';
import { UI_ASSETS } from './assets';
import { NavigationButton } from './patterns';
import { Inline, Box, Header, Image, Aside, Strong, Small, Nav, Bold } from './elements';
import { Button } from './controls';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  ],
  student: [
    { label: 'Сегодня', icon: 'calendar', route: '/student' },
    { label: 'Календарь', icon: 'calendar', route: '/student/calendar' },
    { label: 'Профиль', icon: 'users', route: '/student/profile' },
  ],
};

export function canonicalNavigationRoute(area: AppArea, path: string) {
  if (area === 'trainer') {
    if (/^\/trainer\/(calendar|schedule|assignments|sessions)(?:\/|$)/.test(path)) return '/trainer/calendar';
    if (/^\/trainer\/clients(?:\/|$)/.test(path)) return '/trainer/clients';
    return path === '/trainer' ? '/trainer' : null;
  }

  if (/^\/student\/calendar(?:\/|$)/.test(path)) return '/student/calendar';
  if (/^\/student\/history(?:\/|$)/.test(path)) return '/student/calendar';
  if (/^\/student\/profile(?:\/|$)/.test(path)) return '/student/profile';
  if (path === '/student' || /^\/student\/(assignments|workout)(?:\/|$)/.test(path)) return '/student';
  return null;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function AppShell({
  area,
  path,
  displayName,
  hideBottomNav,
  onNavigate,
  onNavigateTab,
  onSwitchRole,
  theme,
  onToggleTheme,
  onSettings,
  systemStatus,
  children,
}: {
  area: AppArea;
  path: string;
  displayName: string;
  hideBottomNav: boolean;
  onNavigate: (path: string, replace?: boolean) => void;
  onNavigateTab: (path: string) => void;
  onSwitchRole?: () => void;
  theme: AppTheme;
  onToggleTheme: () => void;
  onSettings: () => void;
  systemStatus?: ReactNode;
  children: ReactNode;
}) {
  const nav = NAVIGATION[area];
  const activeRoute = canonicalNavigationRoute(area, path);
  const tabPaths = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    if (activeRoute) tabPaths.current.set(activeRoute, path);
  }, [activeRoute, path]);
  const navigateTab = (route: string) => onNavigateTab(tabPaths.current.get(route) ?? route);
  const focusMode = /^\/student\/(?:calendar\/)?(workout|finish|success)\//.test(path) || path.startsWith('/trainer/workout/');
  const roleToOpen = area === 'trainer' ? 'ученика' : 'тренера';

  useLayoutEffect(() => observeWorkoutFieldFocus(window, document), []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('app-viewport-locked', !focusMode);
    document.body.classList.toggle('app-viewport-locked', !focusMode);
    const stopViewport = !focusMode ? observeMobileViewport(window, document.documentElement) : undefined;
    return () => {
      stopViewport?.();
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
        <Button className="brand-mark brand-button" type="button" onClick={() => onNavigate('/')} aria-label="REPPY — на стартовый экран">
          <Image className="brand-logo" src={UI_ASSETS.wordmark} alt="" />
        </Button>
        <Box className="topbar-actions">
          {onSwitchRole && <Button className="role-switch" type="button" onClick={onSwitchRole} aria-label={`Переключиться в роль ${roleToOpen}`} title={`Переключиться в роль ${roleToOpen}`}>
            <Inline>DEMO</Inline>
            <Icon name="change" />
          </Button>}
          <Button className="theme-switch" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></Button>
          <Button className="avatar-button" type="button" onClick={onSettings} aria-label="Открыть настройки">
            {initials(displayName)}
          </Button>
        </Box>
      </Header>}

      {systemStatus}

      {!focusMode && <Aside className="desktop-nav" aria-label="Основная навигация">
        <Box className="profile-block">
          <InitialsAvatar className="profile-avatar" name={displayName} />
          <Box><Strong>{displayName}</Strong><Small>{area === 'trainer' ? 'Персональный тренер' : 'Ученик'}</Small></Box>
        </Box>
        <Nav>{navigation}</Nav>
        {onSwitchRole && <Button className="side-demo" type="button" onClick={onSwitchRole}><Bold>DEMO</Bold> Переключить роль</Button>}
      </Aside>}

      <Box className="page-wrap page-transition">{children}</Box>

      {!focusMode && !hideBottomNav && <Nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <NavigationButton key={item.route} active={activeRoute === item.route} onClick={() => navigateTab(item.route)}>
            <Inline><Icon name={item.icon} /></Inline><Small>{item.label}</Small>
          </NavigationButton>
        ))}
      </Nav>}
    </Box>
  );
}
