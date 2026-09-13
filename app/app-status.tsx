import { useEffect, useState } from 'react';
import type { PersistencePhase } from './use-reppy-data';
import Icon, { type IconName } from './ui-icon';
import { ActionButton } from './ui-controls';

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

type StatusCopy = {
  kind: 'loading' | 'saving' | 'offline' | 'error';
  icon: IconName;
  title: string;
  detail?: string;
};

function resolveStatus(phase: PersistencePhase, online: boolean): StatusCopy | null {
  if (phase === 'error') return {
    kind: 'error',
    icon: 'close',
    title: 'Не удалось сохранить изменения',
    detail: 'Проверь соединение и попробуй снова',
  };
  if (!online) return {
    kind: 'offline',
    icon: 'minus',
    title: 'Нет сети',
    detail: 'Изменения сохраняются на этом устройстве',
  };
  if (phase === 'loading') return { kind: 'loading', icon: 'history', title: 'Загружаем данные' };
  if (phase === 'saving') return { kind: 'saving', icon: 'history', title: 'Сохраняем изменения' };
  return null;
}

export function AppStatusBanner({
  phase,
  online,
  onRetry,
  preview = false,
}: {
  phase: PersistencePhase;
  online: boolean;
  onRetry: () => void;
  preview?: boolean;
}) {
  const status = resolveStatus(phase, online);
  if (!status) return null;
  const error = status.kind === 'error';

  return (
    <aside className={`app-status-banner ${status.kind} ${preview ? 'preview' : ''}`.trim()} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
      <Icon name={status.icon} />
      <span><strong>{status.title}</strong>{status.detail && <small>{status.detail}</small>}</span>
      {error && <button type="button" onClick={onRetry}>Повторить</button>}
    </aside>
  );
}

export function DataLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="system-state-screen" role="alert">
      <img className="loading-logo" src="logo-full.png" alt="REPPY" />
      <span className="system-state-icon"><Icon name="close" /></span>
      <h1>Не удалось загрузить данные</h1>
      <p>Проверь соединение и попробуй ещё раз. Мы не будем заменять данные пустой копией.</p>
      <ActionButton icon="history" onClick={onRetry}>Повторить</ActionButton>
    </main>
  );
}
