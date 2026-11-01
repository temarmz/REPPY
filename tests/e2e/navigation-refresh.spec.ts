import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) for (const width of [360, 390, 1280]) {
 test(`навигация, карточки и удаление приглашения: ${theme}, ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const data = createInitialState(); data.loggedIn = true;
  data.students.push({ id: 'pending-delete', name: 'Ожидающий ученик', status: 'invited', color: 'orange' });
  await page.goto('/');
  await page.evaluate(({ data, theme }) => { localStorage.clear(); localStorage.setItem('reppy-demo-v0', JSON.stringify(data)); localStorage.setItem('reppy-ui:theme', theme); }, { data, theme });
  await page.goto('/#/trainer'); await page.reload();
  const nav = page.locator(width < 800 ? '.bottom-nav' : '.desktop-nav nav');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(nav.getByRole('button')).toHaveCount(4);
  for (const label of ['Главная', 'Календарь', 'Ученики', 'Заметки']) await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Профиль', exact: true })).toHaveCount(0);
  if (width < 800) expect(await nav.locator('small').evaluateAll((labels) => labels.every((label) => label.scrollWidth <= label.clientWidth))).toBe(true);
  await page.screenshot({ animations: 'disabled', path: `work/nav-trainer-${theme}-${width}.png` });
  await page.locator('.topbar').getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Прогресс', exact: true })).toHaveCount(0);
  await page.goto('/#/trainer/clients/artem');
  const upcoming = page.locator('.profile-schedule'); const subscription = page.getByRole('region', { name: 'Абонемент', exact: true });
  expect((await upcoming.boundingBox())!.y).toBeLessThan((await subscription.boundingBox())!.y);
  await expect(page.locator('.connected-list').first()).toHaveCSS('gap', '24px');
  const row = page.locator('.connected-list button').first(); await expect(row).toHaveCSS('border-radius', '20px');
  await page.screenshot({ animations: 'disabled', path: `work/nav-client-${theme}-${width}.png` });
  await page.goto('/#/trainer/clients/pending-delete');
  await page.getByRole('button', { name: 'Удалить ученика', exact: true }).click();
  await page.getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ОЖИДАЮЩИЙ УЧЕНИК', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Удалить ученика', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить ученика', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients$/);
  await expect(page.getByRole('button', { name: /Ожидающий ученик/ })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: /Ожидающий ученик/ })).toHaveCount(0);
  await page.goto('/#/student');
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('button', { name: 'Главная', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Прогресс по упражнениям' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: `work/nav-student-${theme}-${width}.png` });
  await page.locator('.topbar').getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Прогресс по упражнениям' })).toHaveCount(0);
 });
}

test('пустой прогресс скрыт на главной ученика; ссылка приглашения использует нейтральное поле', async ({ page }) => {
 const data = createInitialState(); data.loggedIn = true; data.sessions = [];
 await page.goto('/'); await page.evaluate((data) => { localStorage.clear(); localStorage.setItem('reppy-demo-v0', JSON.stringify(data)); }, data);
 await page.goto('/#/student'); await page.reload();
 await expect(page.getByRole('region', { name: 'Прогресс по упражнениям' })).toHaveCount(0);
 await page.goto('/#/trainer/clients/invite'); await page.getByLabel('Имя ученика').fill('Новый ученик');
 await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
 const output = page.locator('.invite-ready output'); await expect(output).toBeVisible();
 await expect(page.locator('.invite-ready')).toHaveCSS('gap', '16px');
 expect(await output.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(8, 10, 8)');
 await page.screenshot({ animations: 'disabled', path: 'work/nav-invite.png' });
});
