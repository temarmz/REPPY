import { expect, test } from '@playwright/test';

for (const width of [360, 390]) for (const theme of ['dark', 'light']) {
  test(`sets copy entered values and finish without marks at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    await page.goto('/#/trainer/workout/assignment-artem-push-today');
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const exercise = page.locator('[data-active-exercise]').first();
    await expect(exercise).toBeVisible();
    await expect(page.getByRole('button', { name: /Завершить подход|Отменить подход/ })).toHaveCount(0);
    const fields = exercise.locator('.set-card').last().locator('input');
    await fields.nth(0).fill('12.5');
    await fields.nth(1).fill('8');
    await exercise.getByRole('button', { name: /^Добавить подход —/ }).click();
    await expect(exercise.locator('.set-card').last().locator('input').nth(0)).toHaveValue('12.5');
    await expect(exercise.locator('.set-card').last().locator('input').nth(1)).toHaveValue('8');
    await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Завершение тренировки' });
    const comment = dialog.getByRole('textbox', { name: 'Комментарий о тренировке' });
    if (width === 390) await page.screenshot({ path: `/tmp/reppy-finish-${theme}.png` });
    await comment.fill('Хорошая тренировка');
    await comment.focus();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, 'height', { configurable: true, get: () => 420 });
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect.poll(async () => { const b = await comment.boundingBox(); return b!.y + b!.height; }).toBeLessThanOrEqual(420);
    await expect(comment).toBeFocused();
    await dialog.getByRole('button', { name: 'Подтвердить завершение' }).click();
    await expect(page).toHaveURL(/\/sessions\//);
    await expect(page.locator('.not-completed')).toHaveCount(0);
  });
}
