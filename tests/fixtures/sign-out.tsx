import { createRoot } from 'react-dom/client';
import ReppyApp from '../../app/reppy-app';
import { signOutFixture } from './sign-out-auth';

declare global { interface Window { signOutQa: typeof signOutFixture } }
window.signOutQa = signOutFixture;
createRoot(document.getElementById('root')!).render(<ReppyApp />);
