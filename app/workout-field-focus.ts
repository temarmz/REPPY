export function fieldScrollDelta(field: { top: number; bottom: number }, top: number, bottom: number) {
  if (bottom <= top) return 0;
  if (field.bottom - field.top > bottom - top) return field.top - top;
  if (field.bottom > bottom) return field.bottom - bottom;
  if (field.top < top) return field.top - top;
  return 0;
}

// Safari's own focus scroll runs while the keyboard is animating. Correct only
// an obscured field after layout settles, and scroll its actual container.
export function observeWorkoutFieldFocus(target: Window, document: Document) {
  let frame = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clear = () => {
    target.cancelAnimationFrame(frame);
    frame = 0;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  const adjust = () => {
    frame = 0;
    if (!target.matchMedia('(max-width: 800px)').matches) return;
    const field = document.activeElement;
    if (!(field instanceof HTMLElement) || !field.matches('input:not([type="checkbox"]):not([type="file"]), textarea')
      || !field.closest('[data-workout-composer], .active-workout-page, .athlete-form, .notes-page') || !field.getClientRects().length) {
      document.documentElement.style.removeProperty('--workout-keyboard-space');
      return;
    }
    const viewport = target.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const visibleTop = viewport?.offsetTop ?? 0;
    let top = visibleTop;
    let bottom = visibleTop + (viewport?.height ?? target.innerHeight);
    const page = field.closest<HTMLElement>('.page-wrap');
    const scrollsPage = page && /auto|scroll/.test(target.getComputedStyle(page).overflowY);
    if (scrollsPage) {
      const rect = page.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    // The document-scrolled workout needs extra trailing space: without it the
    // last set cannot be scrolled above a keyboard that overlays the layout.
    document.documentElement.style.setProperty('--workout-keyboard-space', `${scrollsPage ? 0 : Math.max(0, target.innerHeight - (viewport?.height ?? target.innerHeight))}px`);
    const header = field.closest('main')?.querySelector('.active-sticky-header');
    if (header) top = Math.max(top, header.getBoundingClientRect().bottom);
    const label = field.closest('label');
    const rect = (label ?? field).getBoundingClientRect();
    const delta = fieldScrollDelta(rect, top + 16, bottom - 24);
    if (Math.abs(delta) < 1) return;
    if (scrollsPage) page.scrollTop += delta;
    else target.scrollBy({ top: delta, behavior: 'instant' });
  };
  const schedule = () => { if (!frame) frame = target.requestAnimationFrame(adjust); };
  const later = (delay: number) => {
    const timer = setTimeout(() => { timers.delete(timer); schedule(); }, delay);
    timers.add(timer);
  };
  const ordinaryField = () => document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('.notes-page, .athlete-form'));
  const focus = () => { clear(); if (ordinaryField()) { later(180); return; } schedule(); later(100); later(350); later(650); };
  const resize = () => { if (ordinaryField()) { clear(); later(180); return; } schedule(); later(150); };
  document.addEventListener('focusin', focus);
  const blur = () => { clear(); later(350); later(650); };
  document.addEventListener('focusout', blur);
  target.visualViewport?.addEventListener('resize', resize);
  target.addEventListener('resize', resize);
  schedule();
  return () => {
    clear();
    document.documentElement.style.removeProperty('--workout-keyboard-space');
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', blur);
    target.visualViewport?.removeEventListener('resize', resize);
    target.removeEventListener('resize', resize);
  };
}
