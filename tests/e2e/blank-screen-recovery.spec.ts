import { expect, test } from '@playwright/test';

test('a failed app bundle still leaves a visible reload action', async ({ page }) => {
  await page.route('**/assets/index-*.js', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByText('Не удалось открыть приложение. Проверь соединение и попробуй снова.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Перезагрузить' })).toBeVisible();
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Перезагрузить' }).click();
  await expect(page.getByRole('button', { name: 'Попробовать REPPY' })).toBeVisible();
});

test('a failed lazy screen does not remove the entire interface', async ({ page }) => {
  await page.route('**/assets/trainer-routes-*.js', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();

  await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
  await expect(page.getByRole('button', { name: 'Перезагрузить' })).toBeVisible();
  await expect(page.locator('#boot-recovery')).toBeHidden();
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Перезагрузить' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('the independent boot screen disappears once the app renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Попробовать REPPY' })).toBeVisible();
  await expect(page.locator('#boot-recovery')).toBeHidden();
});
