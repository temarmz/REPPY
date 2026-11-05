import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTrainerNotes, notesDay, noteListEdit, continueNoteList } from '../app/trainer-notes.ts';
import { createTrainerNotesController } from '../app/trainer-notes-controller.ts';
import { ReppyConflictError } from '../app/reppy-repository.ts';

const day = '2026-10-31';
function memory() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
async function until(check) {
  for (let index = 0; index < 200; index++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('Timed out waiting for notes');
}

test('four calendar days cross month, leap day and year without shifting dates', () => {
  assert.equal(notesDay(day, 3), '2026-11-03');
  assert.equal(notesDay('2028-02-28', 1), '2028-02-29');
  assert.equal(notesDay('2026-12-31', 1), '2027-01-01');
  assert.equal(notesDay('2027-01-01', -4), '2026-12-28');
});
test('list tools affect selected lines, switch type and toggle back to plain text', () => {
  const text = 'Вступление\nАнна\nИван\nКонец';
  const edit = noteListEdit(text, 11, 20, 'bullet');
  assert.equal(edit.content, 'Вступление\n• Анна\n• Иван\nКонец');
  const numbered = noteListEdit(edit.content, edit.start, edit.end, 'number');
  assert.equal(numbered.content, 'Вступление\n1. Анна\n2. Иван\nКонец');
  assert.equal(noteListEdit(numbered.content, numbered.start, numbered.end, 'number').content, text);
  assert.equal(noteListEdit('\nТекст', 0, 0, 'bullet').content, '• \nТекст');
});
test('Enter continues a list, increments numbers and exits an empty item', () => {
  assert.equal(continueNoteList('• Анна', 6, 6).content, '• Анна\n• ');
  assert.equal(continueNoteList('9. Анна', 7, 7).content, '9. Анна\n10. ');
  assert.equal(continueNoteList('• Анна\n• ', 9, 9).content, '• Анна\n');
  assert.equal(continueNoteList('Текст', 5, 5), null);
  assert.equal(continueNoteList('• Анна', 0, 6), null);
});
test('autosave is independent per day and clearing a note persists a revision', async () => {
  const storage = memory(); const repository = createLocalTrainerNotes(storage);
  const controller = createTrainerNotesController(repository, storage, 'trainer', 1);
  await controller.ensure([day, notesDay(day, 1)]);
  controller.change(day, 'Анна\n• Присед'); controller.change(notesDay(day, 1), 'Иван');
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  await until(() => controller.getSnapshot().entries[notesDay(day, 1)].phase === 'idle');
  assert.equal((await repository.load(day, day))[0].content, 'Анна\n• Присед');
  controller.change(day, '');
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  assert.equal((await repository.load(day, day))[0].content, '');
  assert.equal((await repository.load(day, day))[0].revision, 2);
});
test('typing during a save queues the latest text behind the confirmed revision', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  let release; let calls = 0;
  const repository = { load: base.load, async save(write) {
    if (++calls === 1) await new Promise((resolve) => { release = resolve; });
    return base.save(write);
  } };
  const controller = createTrainerNotesController(repository, storage, 'trainer', 1);
  await controller.ensure([day]); controller.change(day, 'Сначала'); controller.flush(day);
  await until(() => release);
  controller.change(day, 'Затем другой текст'); release();
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  assert.equal((await base.load(day, day))[0].content, 'Затем другой текст');
  assert.equal(calls, 2);
});
test('retry after a lost acknowledgement reuses the mutation and preserves newer typing', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  let lost = true; const mutations = [];
  const repository = { load: base.load, async save(write) {
    mutations.push(write.mutationId);
    const result = await base.save(write);
    if (lost) { lost = false; throw new Error('Network response lost'); }
    return result;
  } };
  const controller = createTrainerNotesController(repository, storage, 'trainer', 1);
  await controller.ensure([day]); controller.change(day, 'Текст'); controller.flush(day);
  await until(() => controller.getSnapshot().entries[day].phase === 'error');
  controller.change(day, 'Текст с продолжением'); controller.retry(day);
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  assert.equal(mutations[0], mutations[1]);
  assert.equal((await base.load(day, day))[0].revision, 2);
  assert.equal((await base.load(day, day))[0].content, 'Текст с продолжением');
});
test('restored drafts recognize a committed mutation and retain text typed afterwards', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  const job = { date: day, content: 'Отправлено', revision: 0, mutationId: crypto.randomUUID() };
  await base.save(job);
  storage.setItem('reppy-notes-drafts-v1:trainer', JSON.stringify({ [day]: { content: 'Отправлено и дописано', revision: 0, job } }));
  const controller = createTrainerNotesController(base, storage, 'trainer', 1);
  await controller.ensure([day]);
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  assert.equal((await base.load(day, day))[0].content, 'Отправлено и дописано');
  assert.equal(storage.getItem('reppy-notes-drafts-v1:trainer'), null);
});
test('conflicts keep both texts until the trainer explicitly selects a version', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  const controller = createTrainerNotesController(base, storage, 'trainer', 1);
  await controller.ensure([day]);
  await base.save({ date: day, content: 'С другого устройства', revision: 0, mutationId: crypto.randomUUID() });
  controller.change(day, 'Мой текст'); controller.flush(day);
  await until(() => controller.getSnapshot().entries[day].remote);
  assert.equal(controller.getSnapshot().entries[day].phase, 'conflict');
  assert.equal(controller.getSnapshot().entries[day].content, 'Мой текст');
  assert.equal(controller.getSnapshot().entries[day].remote.content, 'С другого устройства');
  await controller.resolve(day, true);
  assert.equal((await base.load(day, day))[0].content, 'Мой текст');
  assert.equal((await base.load(day, day))[0].revision, 2);
  await assert.rejects(() => base.save({ date: day, content: 'Устарело', revision: 1, mutationId: crypto.randomUUID() }), ReppyConflictError);
});

test('a delayed refresh cannot replace an acknowledged save or its next revision', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  let release;
  let delayRead = false;
  const repository = { save: base.save, async load(start, end) {
    const notes = await base.load(start, end);
    if (delayRead) { delayRead = false; await new Promise(resolve => { release = resolve; }); }
    return notes;
  } };
  const controller = createTrainerNotesController(repository, storage, 'trainer', 1);
  await controller.ensure([day]);
  delayRead = true;
  const refresh = controller.ensure([day]);
  await until(() => release);
  controller.change(day, 'Подтверждённый текст'); controller.flush(day);
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  release(); await refresh;
  assert.equal(controller.getSnapshot().entries[day].content, 'Подтверждённый текст');
  assert.equal(controller.getSnapshot().entries[day].revision, 1);
  controller.change(day, 'Следующая редакция'); controller.flush(day);
  await until(() => controller.getSnapshot().entries[day].phase === 'idle');
  assert.equal((await base.load(day, day))[0].content, 'Следующая редакция');
  assert.equal((await base.load(day, day))[0].revision, 2);
});

test('overlapping range reads cannot roll a note back to an older remote revision', async () => {
  const storage = memory(); const base = createLocalTrainerNotes(storage);
  await base.save({ date: day, content: 'Первая версия', revision: 0, mutationId: crypto.randomUUID() });
  let release;
  let delayRead = true;
  const repository = { save: base.save, async load(start, end) {
    const notes = await base.load(start, end);
    if (delayRead) { delayRead = false; await new Promise(resolve => { release = resolve; }); }
    return notes;
  } };
  const controller = createTrainerNotesController(repository, storage, 'trainer', 1);
  const older = controller.ensure([day]); await until(() => release);
  await base.save({ date: day, content: 'Новая версия', revision: 1, mutationId: crypto.randomUUID() });
  await controller.ensure([day, notesDay(day, 1)]);
  release(); await older;
  assert.equal(controller.getSnapshot().entries[day].content, 'Новая версия');
  assert.equal(controller.getSnapshot().entries[day].revision, 2);
});

test('unreadable draft data survives loading and editing without a false recovery success', async () => {
  const key = 'reppy-notes-drafts-v1:trainer';
  for (const raw of ['{"unfinished":', 'null', '[]', JSON.stringify({ [day]: { content: 'Важный текст', revision: 'broken' } })]) {
    const storage = memory(); storage.setItem(key, raw);
    const base = createLocalTrainerNotes(storage);
    const controller = createTrainerNotesController(base, storage, 'trainer', 1);
    assert.equal(controller.getSnapshot().draftError, true, raw);
    await controller.ensure([day]);
    assert.equal(storage.getItem(key), raw);
    assert.equal(controller.getSnapshot().draftError, true);
    controller.change(day, 'Новая заметка');
    await controller.ensure([day]);
    assert.equal(controller.getSnapshot().entries[day].content, 'Новая заметка');
    controller.flush(day);
    await until(() => controller.getSnapshot().entries[day].phase === 'idle');
    assert.equal((await base.load(day, day))[0].content, 'Новая заметка');
    assert.equal(storage.getItem(key), raw);
    assert.equal(controller.getSnapshot().draftError, true);
  }
});
