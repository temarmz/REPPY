import { dateKey, formatCalendarDay, type Assignment } from './reppy-data';

export function planDayParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const monthWithDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .formatToParts(date)
    .find((part) => part.type === 'month')?.value ?? '';
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date),
    month: monthWithDay,
    weekday: new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date),
  };
}

export function formatScheduleDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date).replace(/\s*г\.$/, '');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function isScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value && value >= dateKey();
}

export function dateAfter(value: string, days: number) {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}

export function assignmentSortValue(assignment: Assignment) {
  return `${assignment.scheduledFor} ${assignment.scheduledTime ?? '23:59'}`;
}

export function assignmentTimeLabel(assignment: Assignment) {
  return assignment.format === 'online' ? 'Онлайн' : assignment.scheduledTime ?? 'Без времени';
}

export function assignmentScheduleLabel(assignment: Assignment) {
  return `${formatCalendarDay(assignment.scheduledFor)} · ${assignmentTimeLabel(assignment)}`;
}

export function assignmentDateTime(assignment: Assignment) {
  return assignment.scheduledTime ? `${assignment.scheduledFor}T${assignment.scheduledTime}` : assignment.scheduledFor;
}
