import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  test(`компактная библиотека согласована на рабочих экранах: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();

    await page.goto('/#/trainer/clients/invite');
    const input = page.getByLabel('Имя ученика');
    const submit = page.getByRole('button', { name: 'Продолжить', exact: true });
    await expect(input).toHaveCSS('height', '56px');
    await expect(submit).toHaveCSS('min-height', '56px');
    await page.screenshot({ path: `test-results/design-refresh/invite-${theme}.png` });

    await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
    const exercise = page.locator('.plan-exercise-card').first();
    await expect(exercise).toBeVisible();
    await expect(exercise).toHaveCSS('border-top-width', '0px');
    await expect(exercise).toHaveCSS('box-shadow', 'none');
    await expect(exercise.locator('.set-card').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(exercise.locator('.set-card').first()).toHaveCSS('border-top-width', '0px');
    await expect(page.locator('.plan-context-card .schedule-field').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.plan-context-card input[type="time"]')).toHaveCSS('height', '48px');
    await expect(page.locator('.plan-context-card .date-picker-field > button')).toHaveCSS('min-height', '48px');
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(exercise.getByLabel('КГ').first()).toHaveCSS('height', width < 801 ? '44px' : '48px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await exercise.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/design-refresh/exercise-plan-${theme}.png` });

    await page.goto('/#/trainer/assignments/assignment-artem-push-today');
    await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
    const active = page.locator('[data-active-exercise]').first();
    const done = active.getByRole('button', { name: 'Завершить подход 1 — Жим лёжа', exact: true });
    const heights = await Promise.all([active.getByLabel('КГ').first(), active.getByLabel('ПОВТОРЫ').first(), done].map(async (control) => {
      await expect(control).toBeVisible();
      return (await control.boundingBox())!.height;
    }));
    expect(heights).toEqual([44, 44, 44]);
    await done.click();
    await expect(active.getByRole('button', { name: 'Отменить подход 1 — Жим лёжа', exact: true })).toBeVisible();
    await expect(active.locator('.set-card').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `test-results/design-refresh/exercise-active-${theme}.png` });

    await page.goto('/#/trainer/calendar');
    await expect(page.locator('.calendar-grid button:not(.selected)').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `test-results/design-refresh/calendar-${theme}.png` });
  });
}
