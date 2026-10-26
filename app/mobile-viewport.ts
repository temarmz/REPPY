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
    // A suspended iOS WebView can briefly report a tiny/stale viewport while
    // resuming. Keep the last usable bounds instead of moving the whole shell
    // off screen or collapsing it to a few pixels.
    if (!Number.isFinite(height) || height < 160) return;
    const rawTop = viewport?.offsetTop ?? 0;
    const top = Number.isFinite(rawTop)
      ? Math.max(0, Math.min(rawTop, target.innerHeight - height))
      : 0;
    root.style.setProperty('--app-visible-height', `${height}px`);
    root.style.setProperty('--app-visible-top', `${top}px`);
  };
  const schedule = () => { if (!frame) frame = target.requestAnimationFrame(update); };
  const onVisible = () => { if (target.document.visibilityState === 'visible') schedule(); };
  update();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  target.addEventListener('resize', schedule);
  target.addEventListener('pageshow', schedule);
  target.document.addEventListener('visibilitychange', onVisible);
  return () => {
    target.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    target.removeEventListener('resize', schedule);
    target.removeEventListener('pageshow', schedule);
    target.document.removeEventListener('visibilitychange', onVisible);
    root.style.removeProperty('--app-visible-height');
    root.style.removeProperty('--app-visible-top');
  };
}
