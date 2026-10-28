import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`plan focused repeats are not covered by add exercise: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await profileAction(page, 'Включить светлую тему');
      await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
      const card = page.locator('[data-route-active="true"] .plan-exercise-card').first();
      const weight = card.getByLabel('КГ').first();
      const repeats = card.getByLabel('ПОВТОРЫ').first();
      await weight.fill('7,25');
      await weight.press('Tab');
      await expect(repeats).toBeFocused();
      const overlap = () => repeats.evaluate(element => {
        const field = element.getBoundingClientRect();
        const button = document.querySelector('[data-route-active="true"] .plan-exercise-add')!.getBoundingClientRect();
        return Math.max(0, Math.min(field.right, button.right) - Math.max(field.left, button.left))
          * Math.max(0, Math.min(field.bottom, button.bottom) - Math.max(field.top, button.top));
      });
      // Focus correction also runs after the browser's own delayed focus scroll.
      await page.waitForTimeout(750);
      await page.screenshot({ path: testInfo.outputPath('focused-repeats.png'), animations: 'disabled' });
      await expect.poll(overlap).toBe(0);
      await repeats.fill('12');
      await expect(repeats).toHaveValue('12');
      const box = await repeats.boundingBox();
      expect(box).not.toBeNull();
      expect(await repeats.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.right - 4, rect.top + rect.height / 2) === element;
      })).toBe(true);
      await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Добавить упражнения' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
