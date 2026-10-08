import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Icon, { type IconName } from './ui-icon';
import { observeMobileViewport } from './mobile-viewport';

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
        <button key={item.route} className={activeRoute === item.route ? 'active' : ''} type="button" aria-current={activeRoute === item.route ? 'page' : undefined} onClick={() => navigateTab(item.route)}>
          <span><Icon name={item.icon} /></span>{item.label}
        </button>
      ))}
    </>
  );

  return (
    <div className={`app-shell ${area} ${focusMode ? 'focus-mode' : ''}`}>
      {!focusMode && <header className="topbar">
        <button className="brand-mark brand-button" type="button" onClick={() => onNavigate('/')} aria-label="REPPY — на стартовый экран">
          <img className="brand-logo" src="logo-wordmark.png" alt="" />
        </button>
        <div className="topbar-actions">
          {onSwitchRole && <button className="role-switch" type="button" onClick={onSwitchRole} aria-label={`Переключиться в роль ${roleToOpen}`} title={`Переключиться в роль ${roleToOpen}`}>
            <span>DEMO</span>
            <Icon name="change" />
          </button>}
          <button className="theme-switch" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="avatar-button" type="button" onClick={onSettings} aria-label="Открыть настройки">
            {initials(displayName)}
          </button>
        </div>
      </header>}

      {systemStatus}

      {!focusMode && <aside className="desktop-nav" aria-label="Основная навигация">
        <div className="profile-block">
          <span className="profile-avatar">{initials(displayName)}</span>
          <div><strong>{displayName}</strong><small>{area === 'trainer' ? 'Персональный тренер' : 'Ученик'}</small></div>
        </div>
        <nav>{navigation}</nav>
        {onSwitchRole && <button className="side-demo" type="button" onClick={onSwitchRole}><b>DEMO</b> Переключить роль</button>}
      </aside>}

      <div className="page-wrap page-transition">{children}</div>

      {!focusMode && !hideBottomNav && <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <button key={item.route} className={activeRoute === item.route ? 'active' : ''} type="button" aria-current={activeRoute === item.route ? 'page' : undefined} onClick={() => navigateTab(item.route)}>
            <span><Icon name={item.icon} /></span><small>{item.label}</small>
          </button>
        ))}
      </nav>}
    </div>
  );
}
