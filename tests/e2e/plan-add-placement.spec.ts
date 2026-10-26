import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`plan add button leaves exercise controls unobscured: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
      await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
      const card = page.locator('[data-route-active="true"] .plan-exercise-card').first();
      const repeat = card.getByLabel('ПОВТОРЫ').first();
      await repeat.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('exercise-controls.png'), animations: 'disabled' });
      const add = page.getByRole('button', { name: 'Добавить упражнение', exact: true });
      await expect(page.locator('.workout-plan-editor .form-section-heading').getByRole('button', { name: 'Добавить упражнение', exact: true })).toHaveCount(1);
      await expect(add).toHaveAttribute('title', 'Добавить упражнение');
      const icon = add.locator('.ui-icon');
      const foreground = await add.evaluate(element => getComputedStyle(element).color);
      await expect(icon).toHaveCSS('color', foreground);
      await expect(icon).toHaveCSS('background-color', foreground);
      await expect(icon).toHaveCSS('mask-image', /icon-plus\.svg/);
      for (const control of [repeat, card.getByRole('button', { name: 'Добавить подход', exact: false })]) {
        await control.scrollIntoViewIfNeeded();
        expect(await control.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const button = document.querySelector('[data-route-active="true"] .plan-exercise-add')!.getBoundingClientRect();
          return Math.max(0, Math.min(rect.right, button.right) - Math.max(rect.left, button.left))
            * Math.max(0, Math.min(rect.bottom, button.bottom) - Math.max(rect.top, button.top));
        })).toBe(0);
        expect(await control.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })).toBe(true);
      }
      await repeat.fill('14');
      await repeat.press('Tab');
      await add.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('exercise-heading.png'), animations: 'disabled' });
      await add.click();
      const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
      await expect(picker).toBeVisible();
      await picker.getByRole('button', { name: 'Добавить Планка', exact: true }).click();
      await picker.getByRole('button', { name: 'Готово', exact: true }).click();
      await expect(page.locator('.plan-exercise-card')).toHaveCount(4);
      await expect(repeat).toHaveValue('14');
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
