import { createLocalStorageRepository } from './reppy-repository.ts';

export function createBrowserRepository(storageProvider: () => Storage = () => window.localStorage) {
  return createLocalStorageRepository({
    // Resolve localStorage only during repository work, where failures become
    // the app's recoverable load/save state instead of a render-time crash.
    getItem: (key) => storageProvider().getItem(key),
    setItem: (key, value) => storageProvider().setItem(key, value),
    removeItem: (key) => storageProvider().removeItem(key),
  });
}
