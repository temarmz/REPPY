import { fieldScrollDelta } from './workout-field-focus';

// Let Safari finish its native keyboard scroll, then correct only an obscured
// profile field in the single document scroll container.
export function observeProfileFieldFocus(target: Window, document: Document) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const adjust = () => {
    timer = null;
    if (!target.matchMedia('(max-width: 800px)').matches) return;
    const field = document.activeElement;
    if (!(field instanceof HTMLElement) || !field.closest('.profile-scroll-mode .athlete-form') || !field.getClientRects().length) return;
    const viewport = target.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? target.innerHeight);
    const rect = field.getBoundingClientRect();
    const delta = fieldScrollDelta(rect, top + 12, bottom - 20);
    if (Math.abs(delta) >= 1) target.scrollBy({ top: delta, behavior: 'instant' });
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(adjust, 180);
  };
  document.addEventListener('focusin', schedule);
  target.visualViewport?.addEventListener('resize', schedule);
  target.visualViewport?.addEventListener('scroll', schedule);
  target.addEventListener('resize', schedule);
  return () => {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener('focusin', schedule);
    target.visualViewport?.removeEventListener('resize', schedule);
    target.visualViewport?.removeEventListener('scroll', schedule);
    target.removeEventListener('resize', schedule);
  };
}
