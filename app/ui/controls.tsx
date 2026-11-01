import { Inline, Strong, Italic, Label, Paragraph } from './elements';
import { useRef, type ComponentProps, type ReactNode, type TouchEvent } from 'react';

import Icon, { type IconName } from './icon';
import { suppressEmulatedClickAt } from './touch-activation';

type ButtonProps = ComponentProps<'button'>;
type InputProps = ComponentProps<'input'>;

export function SegmentedControl({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string }) {
  return <Paragraph className="segmented-control" role="group" aria-label={label}>{options.map((option) => <Button key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</Button>)}</Paragraph>;
}

/** Native attributes, event types and React 19 refs are preserved by every primitive. */
export function Button({ type = 'button', onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, ...props }: ButtonProps) {
  const touch = useRef<{ identifier: number; x: number; y: number } | null>(null);
  const startTouch = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchStart?.(event);
    if (event.defaultPrevented || props.disabled) return;
    const item = event.touches.length === 1 ? event.touches[0] : null;
    touch.current = item ? { identifier: item.identifier, x: item.clientX, y: item.clientY } : null;
  };
  const moveTouch = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchMove?.(event);
    const start = touch.current;
    if (!start) return;
    const item = event.touches.length === 1 ? event.touches[0] : null;
    if (!item || item.identifier !== start.identifier || Math.hypot(item.clientX - start.x, item.clientY - start.y) > 10) {
      touch.current = null;
    }
  };
  const endTouch = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchEnd?.(event);
    const start = touch.current;
    touch.current = null;
    if (!start || event.defaultPrevented || props.disabled || event.touches.length) return;
    const item = Array.from(event.changedTouches).find((candidate) => candidate.identifier === start.identifier);
    if (!item || Math.hypot(item.clientX - start.x, item.clientY - start.y) > 10) return;
    // WebKit can omit the compatibility click during momentum scrolling. Run
    // the React activation directly, then consume only its delayed ghost.
    if (!props.onClick) return;
    props.onClick(event as unknown as Parameters<NonNullable<ButtonProps['onClick']>>[0]);
    suppressEmulatedClickAt(item.clientX, item.clientY);
  };
  const cancelTouch = (event: TouchEvent<HTMLButtonElement>) => {
    touch.current = null;
    onTouchCancel?.(event);
  };
  return <button type={type} data-ui-control="button" {...props}
    onTouchStart={startTouch} onTouchMove={moveTouch} onTouchEnd={endTouch} onTouchCancel={cancelTouch} />;
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
    <Inline className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></Inline><Strong>{children}</Strong><Inline className="toggle-track" aria-hidden="true"><Italic /></Inline>
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
    <Label className={labelClassName} htmlFor={id}>{label}</Label>
    <Input {...props} id={id} className={className} data-ui-control="text-field" />
  </>;
}

export function FormError({ children }: { children: ReactNode }) {
  return <Paragraph className="form-error" role="alert">{children}</Paragraph>;
}
