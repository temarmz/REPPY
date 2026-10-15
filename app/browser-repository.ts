import { createLocalStorageRepository } from './reppy-repository.ts';

export function createBrowserRepository(storageProvider: () => Storage = () => window.localStorage) {
  const fallback = new Map<string, string>();
  return createLocalStorageRepository({
    getItem(key) {
      try {
        const value = storageProvider().getItem(key);
        if (value !== null) fallback.set(key, value);
        else fallback.delete(key);
        return value;
      } catch {
        return fallback.get(key) ?? null;
      }
    },
    setItem(key, value) {
      try {
        storageProvider().setItem(key, value);
      } catch {
        // Keep this tab usable when browser storage is blocked or full.
      }
      fallback.set(key, value);
    },
    removeItem(key) {
      try {
        storageProvider().removeItem(key);
      } catch {
        // The in-memory copy still needs to be cleared.
      }
      fallback.delete(key);
    },
  });
}
