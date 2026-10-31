import { expect, test } from '@playwright/test';
import { profileAction } from './profile-action';

for (const theme of ['dark', 'light']) for (const width of [360, 390, 440]) {
 test(`общая оболочка и мгновенные табы после скролла: ${theme}, ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 956 });
  await page.goto('/'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  if (theme === 'light') await profileAction(page, 'Включить светлую тему');
  await profileAction(page, 'Переключиться в роль ученика');
  const nav = page.locator('.bottom-nav');
  let bottom: number | undefined;
  for (const label of ['Профиль', 'Заметки', 'Календарь', 'Сегодня', 'Профиль']) {
   await nav.getByRole('button', { name: label, exact: true }).tap();
   await expect(nav.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
   await expect(page.locator('.app-shell')).toHaveCSS('position', 'fixed');
   await page.locator('.page-wrap').evaluate((element) => { element.scrollTop = element.scrollHeight; });
   expect(await page.evaluate(() => window.scrollY)).toBe(0);
   const box = (await nav.boundingBox())!;
   if (bottom !== undefined) expect(Math.abs(box.y + box.height - bottom)).toBeLessThan(1);
   bottom = box.y + box.height;
   expect(956 - bottom).toBeLessThanOrEqual(4);
  }
  const identity = page.getByRole('region', { name: 'Личные данные', exact: true });
  await expect(identity.locator('.account-details')).toBeVisible();
  await expect(identity.locator('.athlete-details')).toBeVisible();
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.locator('.progress-card-list')).toBeVisible();
  const style = await page.locator('.progress-card-list').evaluate((list) => ({ gap: getComputedStyle(list).gap, surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() }));
  expect(style.gap).toBe('24px');
  await expect(page.locator('.progress-card-list > button').first()).toHaveCSS('border-radius', '20px');
  await nav.getByRole('button', { name: 'Заметки', exact: true }).tap();
  const field = page.locator('.note-editor').first(); await field.focus();
  await expect(field).toHaveCSS('font-size', '16px');
  expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('[data-route-active="true"] main').evaluate((main) => getComputedStyle(main).animationName)).toBe('page-fade-in');
  await page.screenshot({ path: `test-results/unified-${width}-${theme}.png` });
 });
}

test('reduced motion отключает переходы, safe area сохраняется', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto('/'); await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
 await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-bottom', '34px'));
 const nav = page.locator('.bottom-nav');
 expect(await nav.evaluate((node) => parseFloat(getComputedStyle(node).marginBottom))).toBe(34);
 expect(await page.locator('[data-route-active="true"] main').evaluate((main) => getComputedStyle(main).animationName)).toBe('none');
});
