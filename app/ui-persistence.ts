import { muscleGroups, type MuscleGroup, type TrainingFormat, type WorkoutExercise } from './reppy-data.ts';
import type { AppTheme } from './ui/app-shell';

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

type ExercisePickerDraft = {
  search: string;
  selectedMuscle: 'all' | MuscleGroup;
  customLoadMode: 'external' | 'bodyweight';
  customMeasureType: 'reps' | 'duration';
  customMuscleGroups?: MuscleGroup[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown) {
  return value === undefined || typeof value === 'string';
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isMuscle(value: unknown): value is MuscleGroup {
  return muscleGroups.some(group => group === value);
}

function isWorkoutExercise(value: unknown): value is WorkoutExercise {
  if (!isRecord(value)) return false;
  const video = value.instructionVideo;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.exerciseId === 'string' && value.exerciseId.length > 0 && typeof value.name === 'string'
    && (value.loadMode === 'external' || value.loadMode === 'bodyweight')
    && (value.measureType === 'reps' || value.measureType === 'duration')
    && Array.isArray(value.plannedSets) && value.plannedSets.every(set => isRecord(set)
      && nonNegativeNumber(set.targetReps) && nonNegativeNumber(set.targetWeight))
    && (value.primaryMuscle === undefined || isMuscle(value.primaryMuscle))
    && (value.muscleGroups === undefined || (Array.isArray(value.muscleGroups) && value.muscleGroups.every(isMuscle)))
    && optionalText(value.equipment) && optionalText(value.coachNote) && optionalText(value.instructionText)
    && (video === undefined || (isRecord(video) && typeof video.id === 'string' && typeof video.name === 'string'
      && typeof video.mimeType === 'string' && typeof video.createdAt === 'string' && nonNegativeNumber(video.size)));
}

function isDraftDate(value: unknown) {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isDraftDateString(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && isDraftDate(value);
}

export function isDraftTimeString(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function isWorkoutDraft(value: unknown): value is WorkoutComposerDraft {
  if (!isRecord(value) || !Array.isArray(value.exercises) || !value.exercises.every(isWorkoutExercise)) return false;
  return typeof value.name === 'string' && (value.format === 'in-person' || value.format === 'online')
    && isDraftDate(value.scheduledFor)
    && (value.scheduledTime === undefined || isDraftTimeString(value.scheduledTime))
    && new Set(value.exercises.map(exercise => exercise.id)).size === value.exercises.length;
}

function isPickerDraft(value: unknown): value is ExercisePickerDraft {
  return isRecord(value) && typeof value.search === 'string'
    && (value.selectedMuscle === 'all' || isMuscle(value.selectedMuscle))
    && (value.customLoadMode === 'external' || value.customLoadMode === 'bodyweight')
    && (value.customMeasureType === 'reps' || value.customMeasureType === 'duration')
    && (value.customMuscleGroups === undefined || (Array.isArray(value.customMuscleGroups) && value.customMuscleGroups.every(isMuscle)));
}

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
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.baseline !== baseline || typeof stored.savedAt !== 'number'
      || !Number.isFinite(stored.savedAt) || Date.now() - stored.savedAt > UI_STATE_MAX_AGE || !isWorkoutDraft(stored.value)) {
      clearWorkoutComposerDraft(key);
      return null;
    }
    return stored.value;
  } catch {
    clearWorkoutComposerDraft(key);
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

export function loadUiDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(UI_DRAFT_PREFERENCE, key));
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || typeof stored.savedAt !== 'number' || !Number.isFinite(stored.savedAt)
      || Date.now() - stored.savedAt > UI_STATE_MAX_AGE || !isRecord(stored.value)) {
      clearUiDraft(key);
      return null;
    }
    return stored.value;
  } catch {
    clearUiDraft(key);
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

export function loadExercisePickerDraft(key: string): ExercisePickerDraft | null {
  const value = loadUiDraft(key);
  if (isPickerDraft(value)) return value;
  clearUiDraft(key);
  return null;
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
