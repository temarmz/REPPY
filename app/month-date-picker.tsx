import { useState } from 'react';
import { dateKey } from './reppy-data';
import Icon from './ui-icon';

export default function MonthDatePicker({
  value,
  onChange,
  min,
  markedDates,
  selectFirstDayOnMonthChange = false,
  dateAriaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  markedDates?: ReadonlyMap<string, number>;
  selectFirstDayOnMonthChange?: boolean;
  dateAriaLabel?: (day: Date, markerCount: number) => string;
  className?: string;
}) {
  const today = new Date();
  const selectedDate = new Date(`${value}T12:00:00`);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(
    Number.isNaN(selectedDate.getTime()) ? today.getFullYear() : selectedDate.getFullYear(),
    Number.isNaN(selectedDate.getTime()) ? today.getMonth() : selectedDate.getMonth(),
    1,
  ));
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const previousMonthLastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0);
  const canMoveToPreviousMonth = !min || dateKey(previousMonthLastDay) >= min;
  const rawMonthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(visibleMonth).replace(/\s*г\.$/, '');
  const monthTitle = rawMonthTitle.charAt(0).toUpperCase() + rawMonthTitle.slice(1);

  const moveMonth = (step: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + step, 1);
    setVisibleMonth(next);
    if (selectFirstDayOnMonthChange) {
      const preferredDay = Number.isNaN(selectedDate.getTime()) ? 1 : selectedDate.getDate();
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      const nextSelection = new Date(next.getFullYear(), next.getMonth(), Math.min(preferredDay, lastDay));
      onChange(dateKey(nextSelection));
    }
  };

  return (
    <section className={`calendar-card ${className}`.trim()}>
      <header className="calendar-toolbar">
        <button type="button" disabled={!canMoveToPreviousMonth} onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><Icon name="chevron-left" /></button>
        <h2>{monthTitle}</h2>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц"><Icon name="chevron-right" /></button>
      </header>
      <div className="calendar-weekdays" aria-hidden="true">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {days.map((day) => {
          const key = dateKey(day);
          const markerCount = markedDates?.get(key) ?? 0;
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          const disabled = Boolean(min && key < min);
          return (
            <button
              className={`${isCurrentMonth ? '' : 'outside'} ${key === value ? 'selected' : ''} ${key === dateKey(today) ? 'today' : ''}`}
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              aria-current={key === dateKey(today) ? 'date' : undefined}
              aria-label={dateAriaLabel?.(day, markerCount) ?? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(day)}
              aria-pressed={key === value}
            >
              <span>{day.getDate()}</span>{markerCount > 0 && <i className={markerCount > 1 ? 'multiple' : ''} aria-hidden="true">{markerCount > 1 ? markerCount : ''}</i>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
