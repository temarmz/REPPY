import { createElement, type ComponentProps, type ReactNode } from 'react';
import { Box, Heading, Inline, Label } from './elements';
import Icon from './icon';
import { Button } from './controls';

export function SectionHeading({ title, titleId, className = '', children, ...props }: Omit<ComponentProps<'div'>, 'title'> & { title: ReactNode; titleId?: string }) {
  return <Box {...props} className={`section-heading ${className}`.trim()} data-ui-element="section-heading"><Heading id={titleId}>{title}</Heading>{children}</Box>;
}

export function Field({ label, children, ...props }: ComponentProps<'label'> & { label: ReactNode }) {
  return <Label {...props} data-ui-element="field"><Inline>{label}</Inline>{children}</Label>;
}

export function Badge({ as = 'span', tone, ...props }: ComponentProps<'span'> & { as?: 'span' | 'b' | 'i'; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return createElement(as, { 'data-ui-element': 'badge', 'data-ui-tone': tone, ...props });
}

export function ProgressBar({ value, label = 'Прогресс тренировки', className = 'workout-progress', ...props }: Omit<ComponentProps<'div'>, 'children'> & { value: number; label?: string }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <Box {...props} className={className} data-ui-element="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><Inline data-ui-element="progress-fill" style={{ width: `${percent}%` }} /></Box>;
}

export function Toast({ children, ...props }: ComponentProps<'div'>) {
  return <Box {...props} className={`toast ${props.className ?? ''}`.trim()} data-ui-element="toast" role="status"><Icon name="check" /> {children}</Box>;
}

export function ListRow(props: ComponentProps<'button'>) {
  return <Button {...props} data-ui-element="list-row" />;
}

export function NavigationButton({ active, className = '', ...props }: ComponentProps<'button'> & { active: boolean }) {
  return <Button {...props} className={`${active ? 'active' : ''} ${className}`.trim()} aria-current={active ? 'page' : undefined} data-ui-element="navigation-button" />;
}
