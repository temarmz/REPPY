import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, type DemoState, type Student } from './reppy-data';
import { applyReppyCommand, type ReppyCommand } from './reppy-commands';
import { createLocalStorageRepository, isReppyConflictError, type ReppyRepository } from './reppy-repository';

export type PersistencePhase = 'loading' | 'idle' | 'saving' | 'error';

type ReppyDataController = {
  data: DemoState;
  hydrated: boolean;
  persistencePhase: PersistencePhase;
  persistenceError: Error | null;
  persistenceConflict: boolean;
  retryPersistence: () => void;
  reloadCurrentData: () => void;
  reset: () => void;
  createStudentInvitation: ((name: string) => Promise<{ student: Student; token: string; expiresAt: string }>) | null;
  dispatch: (command: ReppyCommand) => void;
  setData: Dispatch<SetStateAction<DemoState>>;
};

function createBrowserRepository() {
  return createLocalStorageRepository(window.localStorage);
}

function toError(reason: unknown) {
  return reason instanceof Error ? reason : new Error('Не удалось обратиться к хранилищу данных.');
}

export function useReppyData(
  requestedRepository?: ReppyRepository | null,
): ReppyDataController {
  const [browserRepository] = useState(createBrowserRepository);
  const repository = requestedRepository ?? browserRepository;
  const [data, setData] = useState<DemoState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [persistencePhase, setPersistencePhase] = useState<PersistencePhase>('loading');
  const [persistenceError, setPersistenceError] = useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [loadedRepository, setLoadedRepository] = useState<ReppyRepository | null>(null);
  const dataRef = useRef(data);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);
  const refreshSequenceRef = useRef(0);
  const commandQueueRef = useRef<Array<{ command: ReppyCommand; state: DemoState }>>([]);
  const commandRunningRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!repository.execute) return;
    const protectPendingCommands = (event: BeforeUnloadEvent) => {
      if (commandQueueRef.current.length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectPendingCommands);
    return () => window.removeEventListener('beforeunload', protectPendingCommands);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;

    void repository.load()
      .then((nextData) => {
        if (cancelled) return;
        dataRef.current = nextData;
        setData(nextData);
        setLoadedRepository(repository);
        setHydrated(true);
        setPersistenceError(null);
        setPersistencePhase('idle');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setPersistenceError(toError(reason));
        setHydrated(false);
        setPersistencePhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, repository]);

  useEffect(() => {
    if (!hydrated || loadedRepository !== repository || !repository.subscribe) return;
    let cancelled = false;
    let refreshTimer: number | undefined;

    const unsubscribe = repository.subscribe(() => {
      const sequence = ++refreshSequenceRef.current;
      const expectedSaveVersion = saveVersionRef.current;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        const refreshRequest = saveQueueRef.current
          .catch(() => undefined)
          .then(() => repository.load());
        saveQueueRef.current = refreshRequest.then(() => undefined);
        void refreshRequest
          .then((nextData) => {
            if (cancelled || sequence !== refreshSequenceRef.current) return;
            if (expectedSaveVersion !== saveVersionRef.current) return;
            if (commandQueueRef.current.length > 0) return;
            dataRef.current = nextData;
            setData(nextData);
            setPersistenceError(null);
            setPersistencePhase('idle');
          })
          .catch(() => {
            // Realtime reconnects automatically. Keep the last confirmed state until
            // another database event arrives instead of replacing it with partial data.
          });
      }, 350);
    });

    return () => {
      cancelled = true;
      refreshSequenceRef.current += 1;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [hydrated, loadedRepository, repository]);

  useEffect(() => {
    if (!hydrated || loadedRepository !== repository) return;
    if (repository.execute) return;
    let cancelled = false;
    const version = ++saveVersionRef.current;
    const snapshot = data;

    const request = saveQueueRef.current
      .catch(() => undefined)
      .then(() => {
        if (!cancelled && version === saveVersionRef.current) {
          setPersistenceError(null);
          setPersistencePhase('saving');
        }
        return repository.save(snapshot);
      });
    saveQueueRef.current = request;

    void request
      .then(() => {
        if (cancelled || version !== saveVersionRef.current) return;
        setPersistenceError(null);
        setPersistencePhase('idle');
      })
      .catch((reason: unknown) => {
        if (cancelled || version !== saveVersionRef.current) return;
        setPersistenceError(toError(reason));
        setPersistencePhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [data, hydrated, loadedRepository, repository, saveAttempt]);

  useEffect(() => {
    if (!hydrated || persistencePhase !== 'error' || isReppyConflictError(persistenceError)) return;
    if (navigator.onLine) return;
    const retryWhenOnline = () => setSaveAttempt((current) => current + 1);
    window.addEventListener('online', retryWhenOnline, { once: true });
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [hydrated, persistenceError, persistencePhase]);

  useEffect(() => {
    if (!hydrated || loadedRepository !== repository || reloadAttempt === 0) return;
    let cancelled = false;
    const request = saveQueueRef.current
      .catch(() => undefined)
      .then(() => repository.load());
    saveQueueRef.current = request.then(() => undefined);
    void request
      .then((nextData) => {
        if (cancelled) return;
        dataRef.current = nextData;
        setData(nextData);
        setPersistenceError(null);
        setPersistencePhase('idle');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setPersistenceError(toError(reason));
        setPersistencePhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, loadedRepository, reloadAttempt, repository]);

  const retryPersistence = useCallback(() => {
    if (hydrated) {
      if (repository.execute && commandQueueRef.current.length > 0) {
        setSaveAttempt((current) => current + 1);
        return;
      }
      setSaveAttempt((current) => current + 1);
      return;
    }
    setPersistenceError(null);
    setPersistencePhase('loading');
    setLoadAttempt((current) => current + 1);
  }, [hydrated, repository]);

  const drainCommandQueue = useCallback(() => {
    if (!repository.execute || commandRunningRef.current) return;
    commandRunningRef.current = true;
    const run = async () => {
      while (commandQueueRef.current.length > 0) {
        const pending = commandQueueRef.current[0];
        setPersistenceError(null);
        setPersistencePhase('saving');
        try {
          await repository.execute!(pending.command, pending.state);
          commandQueueRef.current.shift();
        } catch (reason) {
          setPersistenceError(toError(reason));
          setPersistencePhase('error');
          commandRunningRef.current = false;
          return;
        }
      }
      setPersistenceError(null);
      setPersistencePhase('idle');
      commandRunningRef.current = false;
    };
    void run();
  }, [repository]);

  useEffect(() => {
    if (saveAttempt === 0 || !repository.execute || commandQueueRef.current.length === 0) return;
    drainCommandQueue();
  }, [drainCommandQueue, repository, saveAttempt]);

  const dispatch = useCallback((command: ReppyCommand) => {
    const nextData = applyReppyCommand(dataRef.current, command);
    dataRef.current = nextData;
    setData(nextData);
    if (!repository.execute) return;
    saveVersionRef.current += 1;
    commandQueueRef.current.push({ command, state: nextData });
    drainCommandQueue();
  }, [drainCommandQueue, repository]);

  const reset = useCallback(() => {
    const initial = createInitialState();
    commandQueueRef.current = [];
    dataRef.current = initial;
    setData(initial);
    setPersistenceError(null);
  }, []);

  const reloadCurrentData = useCallback(() => {
    commandQueueRef.current = [];
    setPersistenceError(null);
    setPersistencePhase('loading');
    setReloadAttempt((current) => current + 1);
  }, []);

  const createStudentInvitation = useCallback(async (name: string) => {
    if (!repository.createStudentInvitation) throw new Error('Приглашения доступны только в аккаунте тренера.');
    const invitation = await repository.createStudentInvitation(name);
    const nextData = applyReppyCommand(dataRef.current, { type: 'student.create', student: invitation.student });
    dataRef.current = nextData;
    setData(nextData);
    return invitation;
  }, [repository]);

  return {
    data,
    hydrated: hydrated && loadedRepository === repository,
    persistencePhase,
    persistenceError,
    persistenceConflict: isReppyConflictError(persistenceError),
    retryPersistence,
    reloadCurrentData,
    reset,
    createStudentInvitation: repository.createStudentInvitation ? createStudentInvitation : null,
    dispatch,
    setData,
  };
}
