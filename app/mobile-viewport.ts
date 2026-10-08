// iOS can report CSS vh larger than the part of the WebView that is visible.
// Use the visual viewport (also updated for keyboard/browser chrome changes).
export function observeMobileViewport(target: Window, root: HTMLElement) {
  const viewport = target.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Do not reflow the app underneath a user's pinch zoom.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = Math.min(target.innerHeight, viewport?.height ?? target.innerHeight);
    if (!Number.isFinite(height) || height <= 0) return;
    root.style.setProperty('--app-visible-height', `${height}px`);
    root.style.setProperty('--app-visible-top', `${viewport?.offsetTop ?? 0}px`);
  };
  const schedule = () => { if (!frame) frame = target.requestAnimationFrame(update); };
  update();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  target.addEventListener('resize', schedule);
  target.addEventListener('pageshow', schedule);
  return () => {
    target.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    target.removeEventListener('resize', schedule);
    target.removeEventListener('pageshow', schedule);
    root.style.removeProperty('--app-visible-height');
    root.style.removeProperty('--app-visible-top');
  };
}
