import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, type DemoState } from './reppy-data';
import { createLocalStorageRepository, type ReppyRepository } from './reppy-repository';

type ReppyDataController = {
  data: DemoState;
  hydrated: boolean;
  persistenceError: Error | null;
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
  repositoryFactory: () => ReppyRepository = createBrowserRepository,
): ReppyDataController {
  const [repository] = useState(repositoryFactory);
  const [data, setData] = useState<DemoState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    void repository.load()
      .then((nextData) => {
        if (cancelled) return;
        setData(nextData);
        setHydrated(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setPersistenceError(toError(reason));
        setData(createInitialState());
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    if (!hydrated) return;

    void repository.save(data)
      .then(() => setPersistenceError(null))
      .catch((reason: unknown) => setPersistenceError(toError(reason)));
  }, [data, hydrated, repository]);

  const reset = useCallback(() => {
    setData(createInitialState());
    setPersistenceError(null);
    void repository.clear().catch((reason: unknown) => setPersistenceError(toError(reason)));
  }, [repository]);

  return { data, hydrated, persistenceError, reset, setData };
}
