import { expect, test } from '@playwright/test';

for (const mode of ['plan', 'active']) {
  test(`поле ${mode} остаётся над клавиатурой после фокуса и изменения viewport`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    await page.goto(mode === 'plan' ? '/#/trainer/assignments/assignment-artem-push-today/edit' : '/#/trainer/workout/assignment-artem-push-today');
    const field = page.locator('[data-route-active="true"] .active-exercise-card').last().getByLabel('КГ').last();
    await expect(field).toBeVisible();
    await field.focus();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 420 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect.poll(async () => {
      const box = await field.boundingBox();
      return box!.y + box!.height;
    }).toBeLessThanOrEqual(397);
    await expect(field).toBeFocused();
    await field.fill('2.5');
    await expect(field).toHaveValue('2.5');
    const scrollBefore = await page.evaluate(() => document.querySelector('.page-wrap')!.scrollTop + window.scrollY);
    await page.evaluate(() => window.visualViewport!.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(400);
    const scrollAfter = await page.evaluate(() => document.querySelector('.page-wrap')!.scrollTop + window.scrollY);
    expect(Math.abs(scrollBefore - scrollAfter)).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 844 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
      (document.activeElement as HTMLElement).blur();
    });
    await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--workout-keyboard-space').trim())).toBe('');
  });
}
