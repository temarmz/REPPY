import type { DemoState } from './reppy-data.ts';
import type { ReppyCommand } from './reppy-commands.ts';
import type { ReppyRepository } from './reppy-repository.ts';
import { recordPersistence } from './persistence-diagnostics.ts';

export function isTransientPersistenceError(reason: unknown) {
  const error = reason as { code?: string; message?: string; name?: string } | null;
  return error?.code === 'REPPY_TIMEOUT' || error?.code === 'REPPY_NETWORK'
    || /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(error?.message ?? '');
}

type Pending = { command: ReppyCommand; state: DemoState };

// A single lane for reads AND writes: repository.load also updates revision maps.
export function createPersistenceQueue(repository: ReppyRepository, notify: (phase: 'saving' | 'idle' | 'error', error?: Error) => void,
  { debounceMs = 250, retryMs = 1000 } = {}) {
  let tail: Promise<unknown> = Promise.resolve();
  const pending: Pending[] = [];
  let active: Pending | undefined;
  let running = false;
  let stopped = false;
  let failure: Error | undefined;
  let discardActive = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelRetry: (() => void) | undefined;

  function waitForRetry(delayMs: number) {
    return new Promise<void>((resolve) => {
      const retryTimer = setTimeout(finish, delayMs);
      function finish() {
        clearTimeout(retryTimer);
        cancelRetry = undefined;
        resolve();
      }
      cancelRetry = finish;
    });
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (running || stopped || failure || !pending.length) return;
    running = true;
    tail = tail.catch(() => undefined).then(async () => {
      while (!stopped && pending.length && !failure) {
        active = pending[0];
        const entry = active;
        let retries = 0;
        for (;;) {
          const started = performance.now();
          try {
            await repository.execute!(entry.command, entry.state);
            recordPersistence(entry.command.type, 'success', started);
            if (pending[0] === entry) pending.shift();
            break;
          } catch (reason) {
            recordPersistence(entry.command.type, 'error', started, reason);
            if (discardActive) { if (pending[0] === entry) pending.shift(); break; }
            // Progress reconciles a lost acknowledgement before retrying. Do not
            // blindly repeat payments, creation or other non-idempotent writes.
            if (!stopped && entry.command.type === 'session.progress' && retries < 2 && isTransientPersistenceError(reason)) {
              retries += 1;
              recordPersistence(entry.command.type, 'retry', started, reason);
              await waitForRetry(retryMs * retries);
              // Reload/dispose may happen during backoff, when no request is
              // in flight. Never send that discarded snapshot again.
              if (stopped || discardActive) { if (pending[0] === entry) pending.shift(); break; }
              continue;
            }
            failure = reason instanceof Error ? reason : new Error('Не удалось сохранить изменения.');
            if (!stopped) notify('error', failure);
            break;
          }
        }
        active = undefined;
        discardActive = false;
      }
      running = false;
      if (!stopped && !failure && !pending.length) notify('idle');
    });
  }

  return {
    flush,
    get pendingCount() { return pending.length; },
    enqueue(command: ReppyCommand, state: DemoState) {
      if (stopped) return;
      const last = pending[pending.length - 1];
      if (command.type === 'session.progress' && last && last !== active && !(failure && last === pending[0])
        && last.command.type === 'session.progress' && last.command.sessionId === command.sessionId) {
        last.command = { ...last.command, ...command };
        last.state = state;
      } else pending.push({ command, state });
      if (failure) return;
      notify('saving');
      if (command.type !== 'session.progress' || running) flush();
      else {
        // Bound the debounce: continuous typing still flushes every 250ms.
        if (!timer) timer = setTimeout(flush, debounceMs);
      }
    },
    load(accept?: () => boolean) {
      flush();
      const request = tail.catch(() => undefined).then(async () => {
        if (stopped) throw new Error('Хранилище закрыто.');
        if (failure || pending.length) throw failure ?? new Error('Изменения ещё не сохранены.');
        const started = performance.now();
        try {
          const data = await repository.load({ accept: () => !stopped && !pending.length && (accept?.() ?? true) });
          recordPersistence('load', 'success', started);
          return data;
        } catch (reason) {
          recordPersistence('load', 'error', started, reason);
          throw reason;
        }
      });
      tail = request;
      return request;
    },
    retry() { if (stopped || running) return; failure = undefined; if (pending.length) { notify('saving'); flush(); } },
    resume() {
      if (pending[0]?.command.type === 'session.progress' && isTransientPersistenceError(failure)) this.retry();
    },
    discard() {
      // Keep an in-flight write until it settles; its result must not shift a
      // newly queued command. An explicit reload reads after that write.
      pending.splice(active ? 1 : 0);
      discardActive = Boolean(active);
      failure = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
      cancelRetry?.();
    },
    dispose() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending.splice(active ? 1 : 0);
      cancelRetry?.();
    },
  };
}
