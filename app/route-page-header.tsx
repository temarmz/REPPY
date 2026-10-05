import type { ReactNode } from 'react';
import { go, goBack } from './navigation';
import SharedPageHeader from './page-header';

export default function RoutePageHeader({ eyebrow, preserveEyebrowCase = false, title, action, back, semanticBack = false }: { eyebrow?: string; preserveEyebrowCase?: boolean; title: string; action?: ReactNode; back?: string; semanticBack?: boolean }) {
  return <SharedPageHeader eyebrow={eyebrow} preserveEyebrowCase={preserveEyebrowCase} title={title} action={action} onBack={back ? () => semanticBack ? go(back, true) : goBack(back) : undefined} />;
}
