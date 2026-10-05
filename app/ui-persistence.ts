import type { TrainingFormat, WorkoutExercise } from './reppy-data';
import type { AppTheme } from './app-shell';

const TRAINER_ALL_DAYS_PREFERENCE = 'reppy-ui:trainer-all-days';
const THEME_PREFERENCE = 'reppy-ui:theme';
const LAST_ROUTE_PREFERENCE = 'reppy-ui:last-route';
const WORKOUT_DRAFT_PREFERENCE = 'reppy-ui:workout-draft';
const UI_DRAFT_PREFERENCE = 'reppy-ui:draft';
const UI_STATE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type WorkoutComposerDraft = {
  name: string;
  scheduledFor?: string;
  scheduledTime?: string;
  format: TrainingFormat;
  exercises: WorkoutExercise[];
};

type StoredWorkoutComposerDraft = {
  baseline: string;
  savedAt: number;
  value: WorkoutComposerDraft;
};

type StoredUiDraft<T> = {
  savedAt: number;
  value: T;
};

function storageKey(prefix: string, identity: string) {
  return `${prefix}:${identity}`;
}

export function loadAllDaysPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRAINER_ALL_DAYS_PREFERENCE) === 'true';
  } catch {
    return false;
  }
}

export function saveAllDaysPreference(value: boolean) {
  try {
    window.localStorage.setItem(TRAINER_ALL_DAYS_PREFERENCE, String(value));
  } catch {
    // The view still works when storage is unavailable (for example, in private mode).
  }
}

export function loadThemePreference(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(THEME_PREFERENCE) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveThemePreference(theme: AppTheme) {
  try {
    window.localStorage.setItem(THEME_PREFERENCE, theme);
  } catch {
    // Theme still changes for the current session when storage is unavailable.
  }
}

export function loadLastRoute(role: 'trainer' | 'student', identity: string) {
  try {
    const route = window.localStorage.getItem(storageKey(LAST_ROUTE_PREFERENCE, identity));
    return route?.startsWith(`/${role}`) ? route : `/${role}`;
  } catch {
    return `/${role}`;
  }
}

export function saveLastRoute(path: string, identity: string) {
  if (!path.startsWith('/trainer') && !path.startsWith('/student')) return;
  try {
    window.localStorage.setItem(storageKey(LAST_ROUTE_PREFERENCE, identity), path);
  } catch {
    // The current URL still keeps the route while this WebView stays alive.
  }
}

export function loadWorkoutComposerDraft(key: string, baseline: string): WorkoutComposerDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(WORKOUT_DRAFT_PREFERENCE, key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredWorkoutComposerDraft;
    if (stored.baseline !== baseline || Date.now() - stored.savedAt > UI_STATE_MAX_AGE) {
      window.localStorage.removeItem(storageKey(WORKOUT_DRAFT_PREFERENCE, key));
      return null;
    }
    return stored.value;
  } catch {
    return null;
  }
}

export function saveWorkoutComposerDraft(key: string, baseline: string, value: WorkoutComposerDraft) {
  try {
    const stored: StoredWorkoutComposerDraft = { baseline, savedAt: Date.now(), value };
    window.localStorage.setItem(storageKey(WORKOUT_DRAFT_PREFERENCE, key), JSON.stringify(stored));
  } catch {
    // Unsaved-navigation protection still works during the current WebView lifetime.
  }
}

export function clearWorkoutComposerDraft(key: string) {
  try {
    window.localStorage.removeItem(storageKey(WORKOUT_DRAFT_PREFERENCE, key));
    window.localStorage.removeItem(storageKey(`${WORKOUT_DRAFT_PREFERENCE}:picker`, key));
  } catch {
    // Ignore unavailable storage.
  }
}

export function loadUiDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(storageKey(UI_DRAFT_PREFERENCE, key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredUiDraft<T>;
    if (!stored || typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > UI_STATE_MAX_AGE) {
      window.localStorage.removeItem(storageKey(UI_DRAFT_PREFERENCE, key));
      return null;
    }
    return stored.value;
  } catch {
    return null;
  }
}

export function saveUiDraft<T>(key: string, value: T) {
  try {
    const stored: StoredUiDraft<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(storageKey(UI_DRAFT_PREFERENCE, key), JSON.stringify(stored));
  } catch {
    // Drafts remain available until the current WebView is unloaded.
  }
}

export function clearUiDraft(key: string) {
  try {
    window.localStorage.removeItem(storageKey(UI_DRAFT_PREFERENCE, key));
  } catch {
    // Ignore unavailable storage.
  }
}

export function loadWorkoutPicker(key: string): string | 'start' | null {
  try {
    return window.localStorage.getItem(storageKey(`${WORKOUT_DRAFT_PREFERENCE}:picker`, key));
  } catch {
    return null;
  }
}

export function saveWorkoutPicker(key: string, value: string | 'start' | null) {
  try {
    const keyName = storageKey(`${WORKOUT_DRAFT_PREFERENCE}:picker`, key);
    if (value) window.localStorage.setItem(keyName, value);
    else window.localStorage.removeItem(keyName);
  } catch {
    // Ignore unavailable storage.
  }
}
