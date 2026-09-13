import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import Icon, { type IconName } from './ui-icon';

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_CLASS: Record<ActionButtonVariant, string> = {
  primary: 'primary-button',
  secondary: 'wide-secondary',
  danger: 'danger-button',
};

export function ActionButton({
  variant = 'primary',
  icon,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <button {...props} className={`${BUTTON_CLASS[variant]} ${className}`.trim()} type={type} data-ui-control="action">
      {icon && <Icon name={icon} />}{children}
    </button>
  );
}

export function TextField({
  id,
  label,
  labelClassName = 'field-label',
  className = 'text-input',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  labelClassName?: string;
}) {
  return <>
    <label className={labelClassName} htmlFor={id}>{label}</label>
    <input {...props} id={id} className={className} data-ui-control="text-field" />
  </>;
}

export function FormError({ children }: { children: ReactNode }) {
  return <p className="form-error" role="alert">{children}</p>;
}
