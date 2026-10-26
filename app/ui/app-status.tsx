import { UI_ASSETS } from './assets';
import { Aside, Inline, Strong, Small, Page, Image, PageTitle, Paragraph } from './elements';
import { Component, createContext, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import type { PersistencePhase } from '../use-reppy-data';
import Icon, { type IconName } from './icon';
import { ActionButton, Button } from './controls';

export const PersistencePhaseContext = createContext<PersistencePhase>('idle');

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
  kind: 'loading' | 'saving' | 'offline' | 'error' | 'conflict';
  icon: IconName;
  title: string;
  detail?: string;
};

function resolveStatus(phase: PersistencePhase, online: boolean, persistenceError?: Error | null, remote = false, conflict = false): StatusCopy | null {
  if (phase === 'error' && conflict) return {
    kind: 'conflict',
    icon: 'history',
    title: 'Данные изменились на другом устройстве',
    detail: 'Загрузи актуальную версию. Несохранённые изменения на этом устройстве не будут применены.',
  };
  if (phase === 'error') return {
    kind: 'error',
    icon: 'close',
    title: 'Не удалось сохранить изменения',
    detail: persistenceError?.message || 'Проверь соединение и попробуй снова',
  };
  if (!online) return {
    kind: 'offline',
    icon: 'minus',
    title: 'Нет сети',
    detail: remote ? 'Для синхронизации нужно восстановить соединение' : 'Изменения сохраняются на этом устройстве',
  };
  if (phase === 'loading') return { kind: 'loading', icon: 'history', title: 'Загружаем данные' };
  if (phase === 'saving') return { kind: 'saving', icon: 'history', title: 'Сохраняем изменения' };
  return null;
}

export function AppStatusBanner({
  phase,
  online,
  onRetry,
  error: persistenceError,
  remote = false,
  preview = false,
  conflict = false,
  onReload,
}: {
  phase: PersistencePhase;
  online: boolean;
  onRetry: () => void;
  error?: Error | null;
  remote?: boolean;
  preview?: boolean;
  conflict?: boolean;
  onReload?: () => void;
}) {
  const status = resolveStatus(phase, online, persistenceError, remote, conflict);
  if (!status) return null;
  const error = status.kind === 'error' || status.kind === 'conflict';

  return (
    <Aside className={`app-status-banner ${status.kind} ${preview ? 'preview' : ''}`.trim()} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
      <Icon name={status.icon} />
      <Inline><Strong>{status.title}</Strong>{status.detail && <Small>{status.detail}</Small>}</Inline>
      {status.kind === 'error' && <Button type="button" onClick={onRetry}>Повторить</Button>}
      {status.kind === 'conflict' && onReload && <Button type="button" onClick={onReload}>Загрузить актуальные</Button>}
    </Aside>
  );
}

export function DataLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Page className="system-state-screen" role="alert">
      <Image className="loading-logo" src={UI_ASSETS.logo} alt="REPPY" />
      <Inline className="system-state-icon"><Icon name="close" /></Inline>
      <PageTitle>Не удалось загрузить данные</PageTitle>
      <Paragraph>Проверь соединение и попробуй ещё раз. Мы не будем заменять данные пустой копией.</Paragraph>
      <ActionButton icon="history" onClick={onRetry}>Повторить</ActionButton>
    </Page>
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the original error in the console for remote Web Inspector debugging.
    console.error('REPPY render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <Page className="system-state-screen" role="alert">
      <Image className="loading-logo" src={UI_ASSETS.logo} alt="REPPY" />
      <PageTitle>Не удалось открыть экран</PageTitle>
      <Paragraph>Приложение столкнулось с ошибкой. Перезагрузи страницу, чтобы восстановить работу. Ранее сохранённые черновики останутся на этом устройстве.</Paragraph>
      <ActionButton icon="history" onClick={() => window.location.reload()}>Перезагрузить</ActionButton>
    </Page>;
  }
}
