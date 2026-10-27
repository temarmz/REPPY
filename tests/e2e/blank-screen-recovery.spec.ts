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

test('opening another screen never requests a removed route bundle', async ({ page }) => {
  let routeBundleRequests = 0;
  await page.route('**/assets/trainer-routes-*.js', (route) => {
    routeBundleRequests += 1;
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.goto('/#/trainer/workout/assignment-artem-push-today');
  await expect(page.locator('.active-exercise-card').first()).toBeVisible();
  expect(routeBundleRequests).toBe(0);
  await expect(page.locator('#boot-recovery')).toBeHidden();
});

test('the independent boot screen disappears once the app renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Попробовать REPPY' })).toBeVisible();
  await expect(page.locator('#boot-recovery')).toBeHidden();
});
