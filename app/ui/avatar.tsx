import type { ComponentProps } from 'react';
import { Inline } from './elements';
import type { Student } from '../reppy-data';

export function InitialsAvatar({ name, length = 2, ...props }: ComponentProps<'span'> & { name?: string; length?: number }) {
  const initials = name?.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, length).toUpperCase();
  return <Inline {...props} data-ui-element="avatar">{initials ?? '?'}</Inline>;
}

export default function Avatar({ student, large = false }: { student?: Student; large?: boolean }) {
  return <InitialsAvatar name={student?.name} className={`person-avatar ${student?.color ?? 'lime'} ${large ? 'large' : ''}`} />;
}
