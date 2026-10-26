import { StrictMode, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReppyApp from '../../app/reppy-app';
import { AppErrorBoundary } from '../../app/ui/app-status';
import '../../app/globals.css';
import { restoreTelegramCallbackRoute } from '../../app/telegram-login';

restoreTelegramCallbackRoute();

function AppEntry() {
  useLayoutEffect(() => {
    const boot = document.getElementById('boot-recovery');
    if (boot) {
      boot.hidden = true;
      boot.style.display = 'none';
    }
  }, []);
  return <AppErrorBoundary><ReppyApp /></AppErrorBoundary>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppEntry />
  </StrictMode>,
);
