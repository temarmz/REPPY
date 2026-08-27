import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ReppyApp from '../../app/reppy-app';
import '../../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReppyApp />
  </StrictMode>,
);
