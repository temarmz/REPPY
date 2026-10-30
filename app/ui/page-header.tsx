import { Header, Box, Paragraph, PageTitle } from './elements';
import { Button } from './controls';
import type { ReactNode } from 'react';
import Icon from './icon';

export default function PageHeader({ eyebrow, preserveEyebrowCase = false, title, action, onBack }: { eyebrow?: string; preserveEyebrowCase?: boolean; title: string; action?: ReactNode; onBack?: () => void }) {
  return <Header className="page-header">
    <Box>
      {onBack && <Button className="back-button" type="button" onClick={onBack}><Icon name="chevron-left" /> Назад</Button>}
      {eyebrow && <Paragraph className={`eyebrow ${preserveEyebrowCase ? 'preserve-case' : ''}`}>{eyebrow}</Paragraph>}
      <PageTitle>{title}</PageTitle>
    </Box>
    {action}
  </Header>;
}
