import type { Student } from './reppy-data';

export default function Avatar({ student, large = false }: { student?: Student; large?: boolean }) {
  const initials = student?.name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <span className={`person-avatar ${student?.color ?? 'lime'} ${large ? 'large' : ''}`}>{initials ?? '?'}</span>;
}
