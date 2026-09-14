import { useState } from 'react';
import { dateKey, formatCalendarDay } from './reppy-data';
import Icon from './ui-icon';
import ModalFrame from './modal-frame';
import MonthDatePicker from './month-date-picker';
import { ActionButton } from './ui-controls';

function formatDateValue(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function DatePickerSheet({ title, value, min, onChange, onClose }: { title: string; value: string; min?: string; onChange: (value: string) => void; onClose: () => void }) {
  const [selectedDate, setSelectedDate] = useState(value);
  return (
    <ModalFrame title={title} className="date-picker-sheet" ariaLabel={title} closeLabel="Закрыть выбор даты" onClose={onClose}>
      <MonthDatePicker value={selectedDate} min={min} onChange={setSelectedDate} className="calendar-picker-card" />
      <ActionButton icon="check" onClick={() => { onChange(selectedDate); onClose(); }}>Выбрать дату</ActionButton>
    </ModalFrame>
  );
}

export function DatePickerField({ label, value, min, className = '', formatValue = formatDateValue, onChange }: { label: string; value: string; min?: string; className?: string; formatValue?: (value: string) => string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const displayValue = formatValue(value);
  return <>
    <div className={`date-picker-field ${className}`.trim()}>
      <span>{label}</span>
      <button type="button" aria-label={`${label}: ${displayValue}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="calendar" /><strong>{displayValue}</strong><Icon name="chevron-right" /></button>
    </div>
    {open && <DatePickerSheet title={label} value={value} min={min} onChange={onChange} onClose={() => setOpen(false)} />}
  </>;
}

export default function WorkoutScheduleFields({
  dateLabel = 'Дата тренировки',
  timeLabel = 'Время начала',
  scheduledFor,
  scheduledTime,
  showTime = true,
  min = dateKey(),
  onDateChange,
  onTimeChange,
}: {
  dateLabel?: string;
  timeLabel?: string;
  scheduledFor: string;
  scheduledTime?: string;
  showTime?: boolean;
  min?: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div className={`schedule-fields ${showTime ? '' : 'date-only'}`.trim()} data-ui-control="schedule-fields" role="group" aria-label={showTime ? 'Дата и время тренировки' : 'Рекомендованная дата тренировки'}>
      <DatePickerField className="schedule-field" label={dateLabel} value={scheduledFor} min={min} formatValue={formatCalendarDay} onChange={onDateChange} />
      {showTime && <label className="schedule-field time-picker-field"><span>{timeLabel}</span><input type="time" value={scheduledTime ?? ''} onChange={(event) => onTimeChange(event.target.value)} /></label>}
    </div>
  );
}
