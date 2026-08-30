export type IconName =
  | 'home'
  | 'users'
  | 'workout'
  | 'calendar'
  | 'history'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chevron-right'
  | 'chevron-left'
  | 'close'
  | 'plus'
  | 'check'
  | 'circle'
  | 'copy'
  | 'sun'
  | 'change'
  | 'minus'
  | 'success';

const iconFiles: Record<IconName, string> = {
  home: 'icon-home-reppy.svg',
  users: 'icon-users-list.svg',
  workout: 'icon-dumbbell-reppy.svg',
  calendar: 'icon-calendar-reppy.svg',
  history: 'icon-history.svg',
  'arrow-right': 'icon-arrow-right.svg',
  'arrow-up-right': 'icon-arrow-up-right.svg',
  'chevron-right': 'icon-chevron-right-reppy.svg',
  'chevron-left': 'icon-chevron-left-reppy.svg',
  close: 'icon-close-reppy.svg',
  plus: 'icon-plus.svg',
  check: 'icon-checkmark.svg',
  circle: 'icon-circle.svg',
  copy: 'icon-copy.svg',
  sun: 'icon-sun-reppy.svg',
  change: 'icon-change.svg',
  minus: 'icon-minus.svg',
  success: 'icon-success.svg',
};

export const iconAssetPaths = Object.values(iconFiles).map((file) => `icons/${file}`);

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const url = `url("icons/${iconFiles[name]}")`;
  const semanticClass = name.startsWith('chevron-') ? 'ui-chevron' : '';
  return (
    <span
      className={`ui-icon ${semanticClass} ${className}`.trim()}
      aria-hidden="true"
      style={{ WebkitMaskImage: url, maskImage: url }}
    />
  );
}
