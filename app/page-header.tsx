import type { ReactNode } from 'react';
import Icon from './ui-icon';

export default function PageHeader({ eyebrow, preserveEyebrowCase = false, title, action, onBack }: { eyebrow?: string; preserveEyebrowCase?: boolean; title: string; action?: ReactNode; onBack?: () => void }) {
  return <header className="page-header">
    <div>
      {onBack && <button className="back-button" type="button" onClick={onBack}><Icon name="chevron-left" /> Назад</button>}
      {eyebrow && <p className={`eyebrow ${preserveEyebrowCase ? 'preserve-case' : ''}`}>{eyebrow}</p>}
      <h1>{title}</h1>
    </div>
    {action}
  </header>;
}
