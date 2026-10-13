import type { ComponentProps, ReactNode } from 'react';

import Icon, { type IconName } from './ui-icon';

type ButtonProps = ComponentProps<'button'>;
type InputProps = ComponentProps<'input'>;

/** Native attributes, event types and React 19 refs are preserved by every primitive. */
export function Button({ type = 'button', ...props }: ButtonProps) {
  return <button type={type} data-ui-control="button" {...props} />;
}

export function Input(props: InputProps) {
  return <input data-ui-control="input" {...props} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select data-ui-control="select" {...props} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea data-ui-control="textarea" {...props} />;
}

export function IconButton({ icon, label, className = 'schedule-add-button', ...props }: Omit<ButtonProps, 'children' | 'aria-label'> & { icon: IconName; label: string }) {
  return <Button {...props} className={className} aria-label={label} data-ui-control="icon-button"><Icon name={icon} /></Button>;
}

export function Switch({ checked, onCheckedChange, children, ...props }: Omit<ButtonProps, 'role' | 'aria-checked' | 'onClick'> & { checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  return <Button {...props} className={`schedule-view-toggle ${checked ? 'active' : ''} ${props.className ?? ''}`.trim()} role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} data-ui-control="switch">
    <span className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></span><strong>{children}</strong><span className="toggle-track" aria-hidden="true"><i /></span>
  </Button>;
}

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_CLASS: Record<ActionButtonVariant, string> = {
  primary: 'primary-button',
  secondary: 'wide-secondary',
  danger: 'danger-button',
};

export function ActionButton({
  variant = 'primary',
  icon,
  size,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps & {
  variant?: ActionButtonVariant;
  icon?: IconName;
  size?: 'small' | 'medium' | 'large';
  children: ReactNode;
}) {
  return (
    <Button {...props} className={`${BUTTON_CLASS[variant]} ${className}`.trim()} type={type} data-ui-control="action" data-ui-size={size}>
      {icon && <Icon name={icon} />}{children}
    </Button>
  );
}

export function TextField({
  id,
  label,
  labelClassName = 'field-label',
  className = 'text-input',
  ...props
}: Omit<InputProps, 'id'> & {
  id: string;
  label: string;
  labelClassName?: string;
}) {
  return <>
    <label className={labelClassName} htmlFor={id}>{label}</label>
    <Input {...props} id={id} className={className} data-ui-control="text-field" />
  </>;
}

export function FormError({ children }: { children: ReactNode }) {
  return <p className="form-error" role="alert">{children}</p>;
}
