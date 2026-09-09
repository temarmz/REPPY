import Icon, { type IconName } from './ui-icon';

export default function EmptyState({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button type="button" onClick={onAction}><Icon name="arrow-right" /> {action}</button>}
    </div>
  );
}
