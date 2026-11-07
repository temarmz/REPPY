import { test, expect } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const role of ['trainer', 'student']) for (const theme of ['light', 'dark']) {
  test(`continuous scrolling preserves position without History API writes: ${role}, ${theme}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const state = createInitialState(); state.loggedIn = true; state.role = role as 'trainer' | 'student';
    await page.goto('/');
    await page.evaluate(({ state, theme }) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('reppy-demo-v0', JSON.stringify(state)); localStorage.setItem('reppy-ui:theme', theme); }, { state, theme });
    await page.goto(`/#/${role}`); await page.reload(); await expect(page.locator('[data-route-active="true"] main:not([aria-busy="true"])')).toBeVisible();
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const result = await page.evaluate(async () => {
      let writes = 0; const replace = history.replaceState; const push = history.pushState;
      history.replaceState = function (...args) { writes++; return replace.apply(this, args); };
      history.pushState = function (...args) { writes++; return push.apply(this, args); };
      const area = document.querySelector<HTMLElement>('.page-wrap')!;
      const max = area.scrollHeight - area.clientHeight;
      for (let i = 0; i < 160; i++) { area.scrollTop = i % 2 ? Math.min(max, 120) : 0; await new Promise(r => requestAnimationFrame(r)); }
      await new Promise(r => requestAnimationFrame(r));
      history.replaceState = replace; history.pushState = push;
      return { max, top: area.scrollTop, writes };
    });
    expect(result.max).toBeGreaterThan(0); expect(result.writes).toBe(0); expect(result.top).toBeGreaterThan(0);
    await page.reload(); await expect(page.locator('[data-route-active="true"] main:not([aria-busy="true"])')).toBeVisible();
    await expect.poll(() => page.locator('.page-wrap').evaluate(el => el.scrollTop)).toBeCloseTo(result.top, 0);
    expect(errors).toEqual([]);
  });
}
