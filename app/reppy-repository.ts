import {
  createInitialState,
  migrateDemoState,
  type DemoState,
  type Student,
} from './reppy-data.ts';

export const STORAGE_KEY = 'reppy-demo-v0';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ReppyRepository {
  load(): Promise<DemoState>;
  save(state: DemoState): Promise<void>;
  clear(): Promise<void>;
  createStudentInvitation?(name: string, email: string): Promise<{
    student: Student;
    token: string;
    expiresAt: string;
  }>;
}

export function createLocalStorageRepository(
  storage: KeyValueStorage,
  key = STORAGE_KEY,
): ReppyRepository {
  return {
    async load() {
      const initial = createInitialState();
      const saved = storage.getItem(key);
      if (!saved) return initial;

      let parsed: DemoState;
      try {
        parsed = JSON.parse(saved) as DemoState;
      } catch {
        try {
          storage.removeItem(key);
        } catch {
          // Storage can be unavailable; the in-memory demo remains usable.
        }
        return initial;
      }
      return migrateDemoState(parsed);
    },

    async save(state) {
      storage.setItem(key, JSON.stringify(state));
    },

    async clear() {
      storage.removeItem(key);
    },
  };
}
