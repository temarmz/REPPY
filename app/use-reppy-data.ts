import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, type DemoState } from './reppy-data';
import { createLocalStorageRepository, type ReppyRepository } from './reppy-repository';

export type PersistencePhase = 'loading' | 'idle' | 'saving' | 'error';

type ReppyDataController = {
  data: DemoState;
  hydrated: boolean;
  persistencePhase: PersistencePhase;
  persistenceError: Error | null;
  retryPersistence: () => void;
  reset: () => void;
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
  const [loadedRepository, setLoadedRepository] = useState<ReppyRepository | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void repository.load()
      .then((nextData) => {
        if (cancelled) return;
        setLoadedRepository(repository);
        setData(nextData);
        setHydrated(true);
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
    if (!hydrated || loadedRepository !== repository) return;
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

  const retryPersistence = useCallback(() => {
    if (hydrated) {
      setSaveAttempt((current) => current + 1);
      return;
    }
    setPersistenceError(null);
    setPersistencePhase('loading');
    setLoadAttempt((current) => current + 1);
  }, [hydrated]);

  const reset = useCallback(() => {
    setData(createInitialState());
    setPersistenceError(null);
  }, []);

  return {
    data,
    hydrated: hydrated && loadedRepository === repository,
    persistencePhase,
    persistenceError,
    retryPersistence,
    reset,
    setData,
  };
}
