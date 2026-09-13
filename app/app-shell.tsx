import type { ReactNode } from 'react';
import Icon, { type IconName } from './ui-icon';

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
    { label: 'История', icon: 'history', route: '/student/history' },
    { label: 'Профиль', icon: 'users', route: '/student/profile' },
  ],
};

export function canonicalNavigationRoute(area: AppArea, path: string) {
  if (area === 'trainer') {
    if (/^\/trainer\/(calendar|schedule|assignments|sessions)(?:\/|$)/.test(path)) return '/trainer/calendar';
    if (/^\/trainer\/(clients|workouts)(?:\/|$)/.test(path)) return '/trainer/clients';
    return path === '/trainer' ? '/trainer' : null;
  }

  if (/^\/student\/calendar(?:\/|$)/.test(path)) return '/student/calendar';
  if (/^\/student\/history(?:\/|$)/.test(path)) return '/student/history';
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
  onSwitchRole,
  theme,
  onToggleTheme,
  onSettings,
  children,
}: {
  area: AppArea;
  path: string;
  displayName: string;
  hideBottomNav: boolean;
  onNavigate: (path: string, replace?: boolean) => void;
  onSwitchRole: () => void;
  theme: AppTheme;
  onToggleTheme: () => void;
  onSettings: () => void;
  children: ReactNode;
}) {
  const nav = NAVIGATION[area];
  const activeRoute = canonicalNavigationRoute(area, path);
  const focusMode = /^\/student\/(workout|finish|success)\//.test(path) || path.startsWith('/trainer/workout/');
  const roleToOpen = area === 'trainer' ? 'ученика' : 'тренера';

  const navigation = (
    <>
      {nav.map((item) => (
        <button key={item.route} className={activeRoute === item.route ? 'active' : ''} type="button" aria-current={activeRoute === item.route ? 'page' : undefined} onClick={() => onNavigate(item.route, true)}>
          <span><Icon name={item.icon} /></span>{item.label}
        </button>
      ))}
    </>
  );

  return (
    <div className={`app-shell ${area} ${focusMode ? 'focus-mode' : ''}`}>
      {!focusMode && <header className="topbar">
        <button className="brand-mark brand-button" type="button" onClick={() => onNavigate('/')} aria-label="REPPY — на стартовый экран">
          <img className="brand-logo" src="logo-text.png" alt="" />
        </button>
        <div className="topbar-actions">
          <button className="role-switch" type="button" onClick={onSwitchRole} aria-label={`Переключиться в роль ${roleToOpen}`} title={`Переключиться в роль ${roleToOpen}`}>
            <span>DEMO</span>
            <Icon name="change" />
          </button>
          <button className="theme-switch" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="avatar-button" type="button" onClick={onSettings} aria-label="Открыть настройки">
            {initials(displayName)}
          </button>
        </div>
      </header>}

      {!focusMode && <aside className="desktop-nav" aria-label="Основная навигация">
        <div className="profile-block">
          <span className="profile-avatar">{initials(displayName)}</span>
          <div><strong>{displayName}</strong><small>{area === 'trainer' ? 'Персональный тренер' : 'Ученик'}</small></div>
        </div>
        <nav>{navigation}</nav>
        <button className="side-demo" type="button" onClick={onSwitchRole}><b>DEMO</b> Переключить роль</button>
      </aside>}

      <div className="page-wrap page-transition" key={path.split('?')[0]}>{children}</div>

      {!focusMode && !hideBottomNav && <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map((item) => (
          <button key={item.route} className={activeRoute === item.route ? 'active' : ''} type="button" aria-current={activeRoute === item.route ? 'page' : undefined} onClick={() => onNavigate(item.route, true)}>
            <span><Icon name={item.icon} /></span><small>{item.label}</small>
          </button>
        ))}
      </nav>}
    </div>
  );
}
