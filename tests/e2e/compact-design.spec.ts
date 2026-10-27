import { expect, test } from '@playwright/test';

async function expectVisibleButtonSurfaces(page: import('@playwright/test').Page) {
  const transparent = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .filter((button) => {
      const style = getComputedStyle(button);
      const alpha = style.backgroundColor.match(/rgba?\([^)]*,\s*([\d.]+)\)$/)?.[1];
      return style.backgroundColor === 'transparent' || alpha === '0';
    })
    .map((button) => `${button.className || button.tagName}: ${button.getAttribute('aria-label') || button.textContent?.trim().slice(0, 48)}`));
  expect(transparent).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test(`компактная библиотека согласована на рабочих экранах: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
    await expectVisibleButtonSurfaces(page);

    await page.goto('/#/trainer/clients/invite');
    const input = page.getByLabel('Имя ученика');
    const submit = page.getByRole('button', { name: 'Продолжить', exact: true });
    await expect(input).toHaveCSS('height', '56px');
    await expect(submit).toHaveCSS('min-height', '56px');
    await expectVisibleButtonSurfaces(page);
    await page.screenshot({ path: `test-results/design-refresh/invite-${theme}.png` });

    await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
    const exercise = page.locator('.plan-exercise-card').first();
    await expect(exercise).toBeVisible();
    await expect(exercise).toHaveCSS('border-top-width', '0px');
    await expect(exercise).toHaveCSS('box-shadow', 'none');
    await expectVisibleButtonSurfaces(page);
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
    const previewTitle = await page.locator('.readonly-exercise-card:visible h2').first().evaluate((element) => getComputedStyle(element).fontSize);
    const previewPageTitle = await page.locator('.page-header h1:visible').evaluate((element) => getComputedStyle(element).fontSize);
    await expectVisibleButtonSurfaces(page);
    await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
    const active = page.locator('[data-active-exercise]').first();
    await expect(active.locator('h2').first()).toHaveCSS('font-size', previewTitle);
    await expect(page.locator('.active-workout-overview h1')).toHaveCSS('font-size', previewPageTitle);
    await expectVisibleButtonSurfaces(page);
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
    await expectVisibleButtonSurfaces(page);
    await expect(page.locator('.calendar-grid button:not(.selected)').first()).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.agenda-list')).toHaveCSS('gap', '24px');
    await page.screenshot({ path: `test-results/design-refresh/calendar-${theme}.png` });

    await page.goto('/#/trainer/clients');
    await expectVisibleButtonSurfaces(page);
    await expect(page.locator('.client-grid')).toHaveCSS('gap', '24px');
    await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
    await expectVisibleButtonSurfaces(page);
    await page.goto('/#/student/calendar');
    await expectVisibleButtonSurfaces(page);
  });
}
