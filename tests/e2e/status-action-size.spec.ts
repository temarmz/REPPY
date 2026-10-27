import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [740, 320], [1280, 800]]) {
    test(`status banner actions follow the compact control size: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
      await page.goto('/#/trainer/design-kit');
      for (const state of ['error', 'conflict']) {
        const banner = page.locator(`.app-status-banner.preview.${state}`);
        const action = banner.getByRole('button');
        await action.scrollIntoViewIfNeeded();
        await banner.screenshot({ path: testInfo.outputPath(`${state}-action.png`), animations: 'disabled' });
        const bounds = await action.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(48);
        await expect(action).toHaveCSS('min-height', '48px');
        await action.focus();
        await expect(action).toBeFocused();
      }
      await page.evaluate(() => document.documentElement.style.setProperty('--ui-control-height-scale', '1.25'));
      await expect(page.locator('.app-status-banner.preview.error').getByRole('button')).toHaveCSS('min-height', '60px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
