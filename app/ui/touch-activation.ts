// A touchend-triggered route change can put a different control underneath the
// finger before WebKit sends its delayed synthetic click. Consume only that
// click near the original tap, leaving other pointer actions untouched.
export function suppressEmulatedClickAt(x: number, y: number) {
  const suppressClick = (event: MouseEvent) => {
    if (Math.hypot(event.clientX - x, event.clientY - y) > 24) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener('click', suppressClick, true);
    window.clearTimeout(expiry);
  };
  document.addEventListener('click', suppressClick, true);
  const expiry = window.setTimeout(cleanup, 500);
}
