import type { SupabaseClient } from '@supabase/supabase-js';
import { ReppyConflictError, type KeyValueStorage } from './reppy-repository.ts';

export const NOTE_MAX_LENGTH = 50_000;
export type TrainerNote = { date: string; content: string; revision: number; updatedAt: string; mutationId: string };
export type NoteWrite = { date: string; content: string; revision: number; mutationId: string };
export interface TrainerNotesRepository {
  load(start: string, end: string): Promise<TrainerNote[]>;
  save(write: NoteWrite): Promise<TrainerNote>;
  subscribe?(listener: () => void): () => void;
  clear?(): void;
}

export function notesDay(value: string, offset = 0) {
  const day = new Date(`${value}T12:00:00`);
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function noteListEdit(text: string, start: number, end: number, kind: 'bullet' | 'number') {
  const first = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const lastBreak = text.indexOf('\n', Math.max(start, end - 1));
  const last = lastBreak < 0 ? text.length : lastBreak;
  const lines = text.slice(first, last).split('\n');
  const pattern = kind === 'bullet' ? /^[-•] / : /^\d+\. /;
  const remove = lines.every((line) => pattern.test(line));
  const next = lines.map((line, index) => {
    const plain = line.replace(/^(?:[-•]|\d+\.) /, '');
    return remove ? plain : `${kind === 'bullet' ? '•' : `${index + 1}.`} ${plain}`;
  }).join('\n');
  const content = text.slice(0, first) + next + text.slice(last);
  return { content, start: start === end ? first + next.length : first, end: first + next.length };
}

export function continueNoteList(text: string, start: number, end: number) {
  if (start !== end) return null;
  const first = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(first, start);
  const match = line.match(/^(• |[-] |(\d+)\. )(.*)$/);
  if (!match) return null;
  if (!match[3].trim()) return { content: text.slice(0, first) + text.slice(start), start: first, end: first };
  const prefix = match[2] ? `${Number(match[2]) + 1}. ` : match[1];
  const insertion = `\n${prefix}`;
  return { content: text.slice(0, start) + insertion + text.slice(end), start: start + insertion.length, end: start + insertion.length };
}

export function createLocalTrainerNotes(storage: KeyValueStorage, key = 'reppy-trainer-notes-demo-v1'): TrainerNotesRepository {
  const read = (): Record<string, TrainerNote> => JSON.parse(storage.getItem(key) ?? '{}');
  return {
    async load(start, end) { return Object.values(read()).filter((note) => note.date >= start && note.date <= end); },
    async save(write) {
      const notes = read();
      const previous = notes[write.date];
      if (previous?.mutationId === write.mutationId && previous.content === write.content) return previous;
      if ((previous?.revision ?? 0) !== write.revision) throw new ReppyConflictError('Заметка изменена в другой вкладке.');
      const note = { ...write, revision: write.revision + 1, updatedAt: new Date().toISOString() };
      notes[write.date] = note;
      storage.setItem(key, JSON.stringify(notes));
      return note;
    },
    subscribe(listener) {
      const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
      window.addEventListener('storage', changed);
      return () => window.removeEventListener('storage', changed);
    },
    clear() { storage.removeItem(key); },
  };
}

type NoteRow = { note_date: string; content: string; revision: number; updated_at: string; mutation_id: string };
function fromRow(row: NoteRow): TrainerNote {
  return { date: row.note_date, content: row.content, revision: row.revision, updatedAt: row.updated_at, mutationId: row.mutation_id };
}
export function createSupabaseTrainerNotes(client: SupabaseClient, trainerId: string): TrainerNotesRepository {
  return {
    async load(start, end) {
      const { data, error } = await client.from('trainer_notes').select('note_date,content,revision,updated_at,mutation_id')
        .eq('trainer_id', trainerId).gte('note_date', start).lte('note_date', end).order('note_date');
      if (error) throw error;
      return (data as NoteRow[]).map(fromRow);
    },
    async save(write) {
      const { data, error } = await client.rpc('save_trainer_note', {
        p_note_date: write.date, p_content: write.content, p_expected_revision: write.revision, p_mutation_id: write.mutationId,
      });
      if (error?.code === '40001') throw new ReppyConflictError('Заметка изменена на другом устройстве.');
      if (error) throw error;
      const row = (data as NoteRow[])[0];
      if (!row) throw new Error('Сервер не подтвердил сохранение заметки.');
      return fromRow(row);
    },
    subscribe(listener) {
      const channel = client.channel(`trainer-notes:${trainerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_notes', filter: `trainer_id=eq.${trainerId}` }, listener)
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },
  };
}
