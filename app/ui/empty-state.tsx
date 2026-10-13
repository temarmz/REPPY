import { Box, Inline, Subheading, Paragraph } from './elements';
import { Button } from './controls';
import Icon, { type IconName } from './icon';

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
    <Box className="empty-state">
      <Inline><Icon name={icon} /></Inline>
      <Subheading>{title}</Subheading>
      <Paragraph>{text}</Paragraph>
      {action && <Button type="button" onClick={onAction}><Icon name="arrow-right" /> {action}</Button>}
    </Box>
  );
}
