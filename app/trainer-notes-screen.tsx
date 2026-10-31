import { useEffect, useState, useSyncExternalStore } from 'react';
import type { TrainerNotesController } from './trainer-notes-controller';
import { notesDay } from './trainer-notes';
import { dateKey } from './reppy-data';
import { Box, Page, Paragraph, Section } from './ui/elements';
import { ActionButton, Button, FormError, Textarea } from './ui/controls';
import { Field } from './ui/patterns';
import Icon from './ui/icon';
import MonthDatePicker from './ui/month-date-picker';
import ModalFrame from './ui/modal-frame';
import NoteDayCard from './ui/note-day-card';
import PageHeader from './route-page-header';
import { saveUiDraft } from './ui-persistence';


export default function TrainerNotesScreen({ controller, identity }: { controller: TrainerNotesController; identity: string }) {
  const { entries, draftError } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [firstDay, setFirstDay] = useState(dateKey);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [conflictDate, setConflictDate] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const days = Array.from({ length: 4 }, (_, index) => notesDay(firstDay, index));
  useEffect(() => { void controller.ensure(Array.from({ length: 4 }, (_, index) => notesDay(firstDay, index))); }, [controller, firstDay]);
  useEffect(() => { saveUiDraft(`notes-date:${identity}`, { date: firstDay }); }, [firstDay, identity]);
  const loadMonth = (month: Date) => { const start = dateKey(new Date(month.getFullYear(), month.getMonth(), -6)); void controller.ensure(Array.from({ length: 49 }, (_, index) => notesDay(start, index))); };
  useEffect(() => { if (calendarOpen) { const month = new Date(`${firstDay}T12:00:00`); const start = dateKey(new Date(month.getFullYear(), month.getMonth(), -6)); void controller.ensure(Array.from({ length: 49 }, (_, index) => notesDay(start, index))); } }, [calendarOpen, controller, firstDay]);
  const selectDate = (date: string) => { controller.flush(); setFirstDay(date); setCalendarOpen(false); };
  const shortDate = (date: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
  const range = `${shortDate(firstDay)} — ${shortDate(days[3])}, ${days[3].slice(0, 4)}`;
  const conflict = conflictDate ? entries[conflictDate] : undefined;
  const resolve = async (useLocal: boolean) => {
    if (!conflictDate || resolving) return;
    setResolving(true);
    await controller.resolve(conflictDate, useLocal);
    setResolving(false);
    if (controller.getSnapshot().entries[conflictDate]?.phase !== 'conflict') setConflictDate(null);
  };
  return <Page className="content-page notes-page">
    <PageHeader title="ЗАМЕТКИ" action={<Button className="notes-today" onClick={() => selectDate(dateKey())}>Сегодня</Button>} />
    <Section className="notes-navigation" aria-label="Дни дневника">
      <Button className="notes-arrow" aria-label="Предыдущие четыре дня" onClick={() => selectDate(notesDay(firstDay, -4))}><Icon name="chevron-left" /></Button>
      <Button className="notes-date-button" aria-label={`Выбрать дату, ${range}`} aria-haspopup="dialog" onClick={() => setCalendarOpen(true)}><Icon name="calendar" />{range}</Button>
      <Button className="notes-arrow" aria-label="Следующие четыре дня" onClick={() => selectDate(notesDay(firstDay, 4))}><Icon name="chevron-right" /></Button>
    </Section>
    {draftError && <FormError>Не удалось сохранить резервную копию текста на устройстве. Не закрывай страницу до сохранения.</FormError>}
    <Box className="notes-grid" aria-label="Заметки на четыре дня">
      {days.map((date) => <NoteDayCard key={date} date={date} today={date === dateKey()} value={entries[date]?.content ?? ''}
        phase={entries[date]?.phase ?? 'loading'} loaded={entries[date]?.loaded ?? false}
        onChange={(content) => controller.change(date, content)} onBlur={() => controller.flush(date)}
        onRetry={() => controller.retry(date)} onConflict={() => setConflictDate(date)} />)}
    </Box>
    {calendarOpen && <ModalFrame title="Выбрать день" ariaLabel="Выбрать день" className="notes-calendar-modal" onClose={() => setCalendarOpen(false)}>
      <Paragraph>Выбранный день и три следующих останутся рядом.</Paragraph>
      <MonthDatePicker value={firstDay} onChange={selectDate} markedDates={new Map(Object.values(entries).filter((entry) => entry.content.trim()).map((entry) => [entry.date, 1]))} onMonthChange={loadMonth} />
      <ActionButton variant="secondary" onClick={() => selectDate(dateKey())}>Перейти к сегодня</ActionButton>
    </ModalFrame>}
    {conflictDate && conflict && <ModalFrame title="Выбрать версию заметки" ariaLabel="Выбрать версию заметки" className="notes-conflict-modal" onClose={() => { if (!resolving) setConflictDate(null); }}>
      <Paragraph>Эта запись изменилась на другом устройстве. Выбери, какой текст оставить.</Paragraph>
      <Field label="Твой текст"><Textarea className="notes-conflict-text" value={conflict.content} readOnly /></Field>
      {conflict.remote && <Field label="Текст на сервере"><Textarea className="notes-conflict-text" value={conflict.remote.content} readOnly /></Field>}
      {conflict.error && <FormError>{conflict.error}</FormError>}
      <Box className="notes-conflict-actions"><ActionButton disabled={resolving} onClick={() => void resolve(true)}>Оставить мой текст</ActionButton>
        <ActionButton variant="secondary" disabled={resolving} onClick={() => void resolve(false)}>Использовать серверный</ActionButton></Box>
    </ModalFrame>}
  </Page>;
}
