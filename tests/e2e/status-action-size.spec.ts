import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [740, 320], [1280, 800]]) {
    test(`status banner actions follow the compact control size: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await profileAction(page, 'Включить светлую тему');
      await page.goto('/#/trainer/design-kit');
      for (const state of ['error', 'conflict']) {
        const banner = page.locator(`.app-status-banner.preview.${state}`);
        const action = banner.getByRole('button');
        await action.scrollIntoViewIfNeeded();
        await banner.screenshot({ path: testInfo.outputPath(`${state}-action.png`), animations: 'disabled' });
        const bounds = await action.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(48);
        await expect(action).toHaveCSS('min-height', '48px');
        expect(await banner.evaluate(element => {
          const button = element.querySelector('button')!.getBoundingClientRect();
          const outer = element.getBoundingClientRect();
          const copy = element.querySelector(':scope > span:not(.ui-icon)');
          if (!copy) return false;
          const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
          let textRects = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              textRects++;
              const overlap = Math.max(0, Math.min(rect.right, button.right) - Math.max(rect.left, button.left))
                * Math.max(0, Math.min(rect.bottom, button.bottom) - Math.max(rect.top, button.top));
              if (overlap > 0 || rect.left < outer.left || rect.right > outer.right) return false;
            }
          }
          return textRects > 0;
        })).toBe(true);
        await action.focus();
        await expect(action).toBeFocused();
      }
      await page.evaluate(() => document.documentElement.style.setProperty('--ui-control-height-scale', '1.25'));
      await expect(page.locator('.app-status-banner.preview.error').getByRole('button')).toHaveCSS('min-height', '60px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
