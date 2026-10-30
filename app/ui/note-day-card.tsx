import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NOTE_MAX_LENGTH, continueNoteList, noteListEdit } from '../trainer-notes';
import type { NotePhase } from '../trainer-notes-controller';
import { Box, Card, Footer, Header, Small, Strong, Time } from './elements';
import { Button, Textarea } from './controls';
import Icon from './icon';

export default function NoteDayCard({ date, today, value, phase, loaded = true, onChange, onBlur, onRetry, onConflict }: {
  date: string; today?: boolean; value: string; phase: NotePhase; loaded?: boolean;
  onChange: (content: string) => void; onBlur?: () => void; onRetry?: () => void; onConflict?: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<ReturnType<typeof noteListEdit> | null>(null);
  const [selection, setSelection] = useState(0);
  const day = new Date(`${date}T12:00:00`);
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(day);
  const line = value.slice(0, selection).split('\n').at(-1) ?? '';
  useLayoutEffect(() => {
    const edit = pendingSelection.current;
    if (!edit || edit.content !== value) return;
    pendingSelection.current = null;
    textarea.current?.focus({ preventScroll: true });
    textarea.current?.setSelectionRange(edit.start, edit.end);
    setSelection(edit.start);
  }, [value]);
  const apply = (edit: ReturnType<typeof noteListEdit> | null) => {
    if (!edit || edit.content.length > NOTE_MAX_LENGTH) return;
    pendingSelection.current = edit;
    onChange(edit.content);
  };
  const list = (kind: 'bullet' | 'number') => {
    const field = textarea.current;
    if (field) apply(noteListEdit(value, field.selectionStart, field.selectionEnd, kind));
  };
  const keydown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && ['7', '8', '&', '*'].includes(event.key)) {
      event.preventDefault(); list(event.code === 'Digit7' ? 'number' : 'bullet'); return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const edit = continueNoteList(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
      if (edit) { event.preventDefault(); apply(edit); }
    }
  };
  const status = phase === 'loading' ? 'Загрузка…' : phase === 'saving' ? 'Сохраняем…' : phase === 'pending' ? 'Не сохранено'
    : phase === 'conflict' ? 'Две версии' : phase === 'error' ? loaded ? 'Не сохранено' : 'Ошибка загрузки' : value ? 'Сохранено' : 'Нет записей';
  return <Card className={`note-day-card ${today ? 'note-day-today' : ''}`} aria-label={`Заметка за ${label}`} data-note-date={date}>
    <Header className="note-day-heading">
      <Time dateTime={date}><Strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(day)}</Strong><Small>{today ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(day)}</Small></Time>
    </Header>
    <Box className="note-editor-tools" role="group" aria-label={`Списки за ${label}`}>
      <Button disabled={!loaded} aria-label="Маркированный список" title="Маркированный список" aria-pressed={/^[•-] /.test(line)} onPointerDown={(event) => event.preventDefault()} onClick={() => list('bullet')}><Icon name="list-bullet" /></Button>
      <Button disabled={!loaded} aria-label="Нумерованный список" title="Нумерованный список" aria-pressed={/^\d+\. /.test(line)} onPointerDown={(event) => event.preventDefault()} onClick={() => list('number')}><Icon name="list-number" /></Button>
    </Box>
    <Textarea ref={textarea} className="note-editor" aria-label={`Текст заметки за ${label}`} placeholder={loaded ? 'Запиши здесь…' : 'Загружаем…'}
      value={value} readOnly={!loaded} maxLength={NOTE_MAX_LENGTH} onChange={(event) => onChange(event.target.value)}
      onSelect={(event) => setSelection(event.currentTarget.selectionStart)} onKeyDown={keydown} onBlur={onBlur} spellCheck />
    <Footer className={`note-day-status ${phase === 'error' || phase === 'conflict' ? 'note-day-attention' : ''}`}>
      <Small role="status">{status}</Small>
      {phase === 'error' && <Button aria-label={`Повторить ${loaded ? 'сохранение' : 'загрузку'} за ${label}`} title="Повторить" onClick={onRetry}><Icon name="history" /></Button>}
      {phase === 'conflict' && <Button aria-label={`Выбрать версию за ${label}`} title="Выбрать версию" onClick={onConflict}><Icon name="change" /></Button>}
      {value.length >= NOTE_MAX_LENGTH && <Small>Лимит: 50 000 знаков</Small>}
    </Footer>
  </Card>;
}
