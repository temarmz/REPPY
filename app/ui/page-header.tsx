import { Header, Box, Paragraph, PageTitle } from './elements';
import { Button } from './controls';
import { useRef, type ReactNode, type TouchEvent } from 'react';
import Icon from './icon';
import { suppressEmulatedClickAt } from './touch-activation';

export default function PageHeader({ eyebrow, preserveEyebrowCase = false, title, action, onBack }: { eyebrow?: string; preserveEyebrowCase?: boolean; title: string; action?: ReactNode; onBack?: () => void }) {
  const backTouch = useRef<{ identifier: number; x: number; y: number } | null>(null);
  const ignoreClickUntil = useRef(0);
  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    backTouch.current = touch ? { identifier: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    const start = backTouch.current;
    backTouch.current = null;
    const touch = start && Array.from(event.changedTouches).find((item) => item.identifier === start.identifier);
    if (!touch || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;
    ignoreClickUntil.current = performance.now() + 500;
    suppressEmulatedClickAt(touch.clientX, touch.clientY);
    onBack?.();
  };
  const handleClick = () => {
    if (performance.now() < ignoreClickUntil.current) return;
    onBack?.();
  };
  return <Header className="page-header">
    <Box>
      {onBack && <Button className="back-button" type="button" onClick={handleClick}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { backTouch.current = null; }}><Icon name="chevron-left" /> Назад</Button>}
      {eyebrow && <Paragraph className={`eyebrow ${preserveEyebrowCase ? 'preserve-case' : ''}`}>{eyebrow}</Paragraph>}
      <PageTitle>{title}</PageTitle>
    </Box>
    {action}
  </Header>;
}
