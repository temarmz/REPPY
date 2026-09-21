import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, type DemoState, type Student } from './reppy-data';
import { createLocalStorageRepository, type ReppyRepository } from './reppy-repository';

export type PersistencePhase = 'loading' | 'idle' | 'saving' | 'error';

type ReppyDataController = {
  data: DemoState;
  hydrated: boolean;
  persistencePhase: PersistencePhase;
  persistenceError: Error | null;
  retryPersistence: () => void;
  reset: () => void;
  createStudentInvitation: ((name: string, email: string) => Promise<{ student: Student; token: string; expiresAt: string }>) | null;
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
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void repository.load()
      .then((nextData) => {
        if (cancelled) return;
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

  const createStudentInvitation = useCallback(async (name: string, email: string) => {
    if (!repository.createStudentInvitation) throw new Error('Приглашения доступны только в аккаунте тренера.');
    const invitation = await repository.createStudentInvitation(name, email);
    setData((current) => current.students.some((student) => student.id === invitation.student.id)
      ? current
      : { ...current, students: [...current.students, invitation.student] });
    return invitation;
  }, [repository]);

  return {
    data,
    hydrated: hydrated && loadedRepository === repository,
    persistencePhase,
    persistenceError,
    retryPersistence,
    reset,
    createStudentInvitation: repository.createStudentInvitation ? createStudentInvitation : null,
    setData,
  };
}
