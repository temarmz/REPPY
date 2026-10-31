import { useRef } from 'react';
import { NOTE_MAX_LENGTH } from '../trainer-notes';
import type { NotePhase } from '../trainer-notes-controller';
import { Card, Footer, Header, Small, Strong, Time } from './elements';
import { Button, Textarea } from './controls';
import Icon from './icon';

export default function NoteDayCard({ date, today, value, phase, loaded = true, onChange, onBlur, onRetry, onConflict }: {
  date: string; today?: boolean; value: string; phase: NotePhase; loaded?: boolean;
  onChange: (content: string) => void; onBlur?: () => void; onRetry?: () => void; onConflict?: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const day = new Date(`${date}T12:00:00`);
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(day);
  const status = phase === 'loading' ? 'Загрузка…' : phase === 'saving' ? 'Сохраняем…' : phase === 'pending' ? 'Не сохранено'
    : phase === 'conflict' ? 'Две версии' : phase === 'error' ? loaded ? 'Не сохранено' : 'Ошибка загрузки' : value ? 'Сохранено' : 'Нет записей';
  return <Card className={`note-day-card ${today ? 'note-day-today' : ''}`} aria-label={`Заметка за ${label}`} data-note-date={date}>
    <Header className="note-day-heading">
      <Time dateTime={date}><Strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(day)}</Strong><Small>{today ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(day)}</Small></Time>
    </Header>
    <Textarea ref={textarea} className="note-editor" aria-label={`Текст заметки за ${label}`} placeholder={loaded ? 'Запиши здесь…' : 'Загружаем…'}
      value={value} readOnly={!loaded} maxLength={NOTE_MAX_LENGTH} onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur} spellCheck />
    <Footer className={`note-day-status ${phase === 'error' || phase === 'conflict' ? 'note-day-attention' : ''}`}>
      <Small role="status">{status}</Small>
      {phase === 'error' && <Button aria-label={`Повторить ${loaded ? 'сохранение' : 'загрузку'} за ${label}`} title="Повторить" onClick={onRetry}><Icon name="history" /></Button>}
      {phase === 'conflict' && <Button aria-label={`Выбрать версию за ${label}`} title="Выбрать версию" onClick={onConflict}><Icon name="change" /></Button>}
      {value.length >= NOTE_MAX_LENGTH && <Small>Лимит: 50 000 знаков</Small>}
    </Footer>
  </Card>;
}
