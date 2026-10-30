import { createRoot } from 'react-dom/client';
import { AppErrorScreen, DataLoadError } from '../../app/ui/app-status';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const recover = () => { document.body.dataset.recovered = 'true'; };
createRoot(document.getElementById('root')!).render(params.get('screen') === 'load'
  ? <DataLoadError onRetry={recover} />
  : <AppErrorScreen onRecover={params.get('screen') === 'overlay' ? recover : undefined} />);
