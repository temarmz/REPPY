import { isReppyConflictError, type KeyValueStorage } from './reppy-repository.ts';
import { NOTE_MAX_LENGTH, type NoteWrite, type TrainerNote, type TrainerNotesRepository } from './trainer-notes.ts';

export type NotePhase = 'loading' | 'idle' | 'pending' | 'saving' | 'error' | 'conflict';
export type NoteEntry = {
  date: string; content: string; confirmedContent: string; revision: number; loaded: boolean;
  phase: NotePhase; error?: string; remote?: TrainerNote;
};
type Draft = { content: string; revision: number; job?: NoteWrite };
type Snapshot = { entries: Record<string, NoteEntry>; draftError: boolean };
const empty = (date: string): NoteEntry => ({ date, content: '', confirmedContent: '', revision: 0, loaded: false, phase: 'loading' });

/** Lives with the account, so changing dates or hiding a route never cancels a save. */
export function createTrainerNotesController(repository: TrainerNotesRepository, storage: KeyValueStorage, identity: string, delay = 650) {
  const draftKey = `reppy-notes-drafts-v1:${identity}`;
  let drafts: Record<string, Draft> = {};
  let draftError = false;
  try {
    const parsed = JSON.parse(storage.getItem(draftKey) ?? '{}');
    if (parsed && typeof parsed === 'object') {
      drafts = Object.fromEntries(Object.entries(parsed).filter(([date, value]) => {
        const draft = value as Draft;
        return /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof draft?.content === 'string'
          && draft.content.length <= NOTE_MAX_LENGTH && Number.isInteger(draft.revision) && draft.revision >= 0
          && (!draft.job || (draft.job.date === date && typeof draft.job.content === 'string'
            && Number.isInteger(draft.job.revision) && typeof draft.job.mutationId === 'string'));
      })) as Record<string, Draft>;
    }
  } catch { draftError = true; }
  let snapshot: Snapshot = { entries: {}, draftError };
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const requests = new Map<string, Promise<void>>();
  const saving = new Set<string>();
  const jobs = new Map<string, NoteWrite>();
  const dirty = new Set(Object.keys(drafts));
  const publish = () => { snapshot = { ...snapshot, entries: { ...snapshot.entries } }; listeners.forEach((listener) => listener()); };
  const set = (date: string, patch: Partial<NoteEntry>) => { snapshot.entries[date] = { ...(snapshot.entries[date] ?? empty(date)), ...patch }; };
  const persistDrafts = () => {
    for (const date of Object.keys(drafts)) if (!dirty.has(date)) delete drafts[date];
    for (const date of dirty) {
      const entry = snapshot.entries[date];
      if (entry) drafts[date] = { content: entry.content, revision: entry.revision, job: jobs.get(date) };
    }
    try {
      if (Object.keys(drafts).length) storage.setItem(draftKey, JSON.stringify(drafts));
      else storage.removeItem(draftKey);
      snapshot.draftError = false;
    } catch { snapshot.draftError = true; }
  };
  const schedule = (date: string) => {
    clearTimeout(timers.get(date));
    timers.set(date, setTimeout(() => { timers.delete(date); void save(date); }, delay));
  };
  const save = async (date: string): Promise<void> => {
    clearTimeout(timers.get(date)); timers.delete(date);
    const entry = snapshot.entries[date];
    if (!entry?.loaded || !dirty.has(date) || saving.has(date) || entry.phase === 'conflict') return;
    const job = jobs.get(date) ?? { date, content: entry.content, revision: entry.revision, mutationId: crypto.randomUUID() };
    jobs.set(date, job); saving.add(date);
    set(date, { phase: 'saving', error: undefined }); persistDrafts(); publish();
    try {
      const saved = await repository.save(job);
      jobs.delete(date);
      const current = snapshot.entries[date];
      const pending = current.content !== saved.content;
      if (!pending) dirty.delete(date);
      set(date, { revision: saved.revision, confirmedContent: saved.content, phase: pending ? 'pending' : 'idle', remote: undefined });
      if (pending) schedule(date);
    } catch (error) {
      set(date, { phase: isReppyConflictError(error) ? 'conflict' : 'error', error: 'Не удалось сохранить заметку.' });
      if (isReppyConflictError(error)) {
        try { const [remote] = await repository.load(date, date); set(date, { remote, error: undefined }); }
        catch { /* Keep both the local draft and the conflict action available. */ }
      }
    } finally {
      saving.delete(date); persistDrafts(); publish();
    }
  };
  const load = (start: string, end: string): Promise<void> => {
    const key = `${start}:${end}`;
    const existing = requests.get(key);
    if (existing) return existing;
    const request = repository.load(start, end).then((notes) => {
      const remote = new Map(notes.map((note) => [note.date, note]));
      const dates = new Set([...remote.keys(), ...Object.keys(snapshot.entries).filter((date) => date >= start && date <= end),
        ...Object.keys(drafts).filter((date) => date >= start && date <= end)]);
      for (const date of dates) {
        if (saving.has(date)) continue;
        const note = remote.get(date);
        const entry = snapshot.entries[date];
        const draft = drafts[date];
        const revision = note?.revision ?? 0;
        const confirmedContent = note?.content ?? '';
        if (dirty.has(date) && draft) {
          const content = entry?.content ?? draft.content;
          const baseRevision = entry?.revision ?? draft.revision;
          const job = jobs.get(date) ?? draft.job;
          // Recognize an acknowledged write recovered after reload, even if the
          // trainer typed more text before the previous response was received.
          const acknowledged = Boolean(job && note?.mutationId === job.mutationId && note.content === job.content);
          const conflict = revision !== baseRevision && !acknowledged && content !== confirmedContent;
          if (content === confirmedContent) { dirty.delete(date); jobs.delete(date); }
          else if (acknowledged) jobs.delete(date);
          else if (job) jobs.set(date, job);
          set(date, { content, confirmedContent, revision: conflict ? baseRevision : revision, loaded: true,
            phase: content === confirmedContent ? 'idle' : conflict ? 'conflict' : 'pending', remote: note, error: undefined });
          if (dirty.has(date) && !conflict) schedule(date);
        } else {
          set(date, { content: confirmedContent, confirmedContent, revision, loaded: true, phase: 'idle', error: undefined, remote: undefined });
        }
      }
      persistDrafts(); publish();
    }).catch(() => {
      for (const [date, entry] of Object.entries(snapshot.entries)) {
        if (date >= start && date <= end && !entry.loaded) set(date, { phase: 'error', error: 'Не удалось загрузить заметку.' });
      }
      publish();
    }).finally(() => requests.delete(key));
    requests.set(key, request);
    return request;
  };
  const ensure = (dates: string[]) => {
    for (const date of dates) if (!snapshot.entries[date]) {
      const draft = drafts[date];
      set(date, draft ? { content: draft.content, revision: draft.revision } : {});
    }
    publish();
    return load(dates[0], dates[dates.length - 1]);
  };
  const refresh = () => {
    const dates = Object.keys(snapshot.entries).sort();
    // Keep reads bounded even after a long session of browsing the diary.
    for (let index = 0; index < dates.length; index += 42) void load(dates[index], dates[Math.min(index + 41, dates.length - 1)]);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ensure,
    change(date: string, content: string) {
      const entry = snapshot.entries[date];
      if (!entry?.loaded || content.length > NOTE_MAX_LENGTH) return;
      dirty.add(date);
      set(date, { content, phase: entry.phase === 'conflict' ? 'conflict' : saving.has(date) ? 'saving' : 'pending', error: undefined });
      persistDrafts(); publish();
      if (entry.phase !== 'conflict') schedule(date);
    },
    flush(date?: string) { if (date) void save(date); else for (const day of dirty) void save(day); },
    retry(date: string) { if (snapshot.entries[date]?.loaded) void save(date); else void load(date, date); },
    async resolve(date: string, useLocal: boolean) {
      // Fetch immediately before resolving; CAS still protects a later change.
      try {
        const [note] = await repository.load(date, date);
        const content = useLocal ? snapshot.entries[date].content : note?.content ?? '';
        jobs.delete(date);
        set(date, { content, confirmedContent: note?.content ?? '', revision: note?.revision ?? 0,
          phase: useLocal ? 'pending' : 'idle', error: undefined, remote: undefined });
        if (useLocal) dirty.add(date); else dirty.delete(date);
        persistDrafts(); publish();
        if (useLocal) await save(date);
      } catch { set(date, { error: 'Не удалось загрузить актуальную заметку.' }); publish(); }
    },
    start() {
      const resume = () => { refresh(); for (const date of dirty) if (snapshot.entries[date]?.phase !== 'conflict') void save(date); };
      const hide = () => { if (document.visibilityState === 'hidden') for (const date of dirty) void save(date); else resume(); };
      const protect = (event: BeforeUnloadEvent) => {
        if (!dirty.size) return;
        for (const date of dirty) void save(date);
        event.preventDefault(); event.returnValue = '';
      };
      const unsubscribe = repository.subscribe?.(refresh);
      window.addEventListener('online', resume); window.addEventListener('focus', resume);
      window.addEventListener('beforeunload', protect); document.addEventListener('visibilitychange', hide);
      // Recover drafts for days that are no longer visible, too.
      for (const date of Object.keys(drafts)) void ensure([date]);
      return () => {
        unsubscribe?.(); window.removeEventListener('online', resume); window.removeEventListener('focus', resume);
        window.removeEventListener('beforeunload', protect); document.removeEventListener('visibilitychange', hide);
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        for (const date of dirty) void save(date);
      };
    },
    resetDemo() {
      if (!repository.clear) return;
      repository.clear(); dirty.clear(); jobs.clear();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear(); drafts = {}; snapshot.entries = {}; persistDrafts(); publish();
    },
  };
}
export type TrainerNotesController = ReturnType<typeof createTrainerNotesController>;
