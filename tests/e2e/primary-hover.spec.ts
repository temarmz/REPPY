import { expect, test } from '@playwright/test';
import { profileAction } from './profile-action';
import { buttonContrast } from './button-contrast';

for (const theme of ['dark', 'light']) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`primary hover remains readable: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await profileAction(page, 'Включить светлую тему');
      await page.goto('/#/trainer/design-kit');
      const button = page.locator('.design-kit-button-grid .primary-button').first();
      await expect(button).toBeEnabled();
      await button.hover();
      await button.screenshot({ path: testInfo.outputPath('primary-hover.png'), animations: 'disabled' });
      expect(await buttonContrast(button)).toBeGreaterThanOrEqual(4.5);
    });
  }
}
