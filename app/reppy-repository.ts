import {
  createInitialState,
  migrateDemoState,
  type DemoState,
} from './reppy-data.ts';

export const STORAGE_KEY = 'reppy-demo-v0';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ReppyRepository {
  load(): Promise<DemoState>;
  save(state: DemoState): Promise<void>;
  clear(): Promise<void>;
}

export function createLocalStorageRepository(
  storage: KeyValueStorage,
  key = STORAGE_KEY,
): ReppyRepository {
  return {
    async load() {
      const initial = createInitialState();

      try {
        const saved = storage.getItem(key);
        return migrateDemoState(saved ? (JSON.parse(saved) as DemoState) : initial);
      } catch {
        try {
          storage.removeItem(key);
        } catch {
          // Storage can be unavailable; the in-memory demo remains usable.
        }
        return initial;
      }
    },

    async save(state) {
      storage.setItem(key, JSON.stringify(state));
    },

    async clear() {
      storage.removeItem(key);
    },
  };
}
