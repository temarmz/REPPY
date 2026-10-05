import EmptyState from './empty-state';
import { go } from './navigation';

export default function NotFound() {
  return <main className="content-page"><EmptyState icon="circle" title="Ничего не найдено" text="Этот экран или запись больше не существует." action="На главную" onAction={() => go('/')} /></main>;
}
