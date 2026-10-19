import { expect, test, type Page } from '@playwright/test';

const editorPath = '/trainer/clients/maria/assign/new';
const profilePath = '/trainer/clients/maria';

async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expect(page.locator('[data-route-view="/trainer"] main:not([aria-busy="true"])')).toBeVisible();
}

async function changeHash(page: Page, path: string) {
  await page.evaluate((path) => { location.hash = path; }, path);
  await expect(page.locator('[data-route-active="true"]:visible')).toHaveAttribute('data-route-view', path);
  await expect(page.locator('[data-route-active="true"]:visible main:not([aria-busy="true"])')).toBeVisible();
}

test('Forward preserves the draft and future entry through cancel, Escape and reload, then discards on confirmation', async ({ page }) => {
  await demo(page);
  await changeHash(page, editorPath);
  await changeHash(page, profilePath);
  await page.goBack();
  const title = page.getByLabel('Название тренировки');
  await title.fill('Черновик перед Forward');
  await page.reload();
  await expect(title).toHaveValue('Черновик перед Forward');
  for (const cancel of ['button', 'escape']) {
    await page.goForward();
    const prompt = page.getByRole('alertdialog');
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
    await expect(prompt.getByRole('button', { name: 'Остаться' })).toBeFocused();
    if (cancel === 'button') await prompt.getByRole('button', { name: 'Остаться' }).click();
    else await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(title).toHaveValue('Черновик перед Forward');
  }
  await page.goForward();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти без сохранения' }).click();
  await expect(page).toHaveURL(new RegExp(`#${profilePath}$`));
  await expect(page.locator('[data-route-active="true"]:visible')).toHaveAttribute('data-route-view', profilePath);
  await page.goBack();
  await expect(title).toHaveValue('');
});

test('Back closes a discard prompt without leaving the draft, and regular modals still consume one Back', async ({ page }) => {
  await demo(page);
  await changeHash(page, profilePath);
  await changeHash(page, editorPath);
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  const title = page.getByLabel('Название тренировки');
  await title.fill('Черновик перед Back');
  await page.goBack();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  await expect(title).toHaveValue('Черновик перед Back');
  const date = page.getByRole('button', { name: /Дата тренировки:/ });
  await date.click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  await expect(date).toBeFocused();
  await page.goBack();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти без сохранения' }).click();
  await expect(page).toHaveURL(new RegExp(`#${profilePath}$`));
});

test('a dirty editor confirms and resumes the full multi-entry Forward traversal', async ({ page }) => {
  await demo(page);
  await changeHash(page, editorPath);
  await changeHash(page, profilePath);
  await changeHash(page, '/trainer/calendar');
  await page.evaluate(() => history.go(-2));
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  await page.getByLabel('Название тренировки').fill('Черновик перед переходом через два экрана');
  await page.evaluate(() => history.go(2));
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти без сохранения' }).click();
  await expect(page).toHaveURL(/#\/trainer\/calendar$/);
  await expect(page.locator('[data-route-active="true"]:visible')).toHaveAttribute('data-route-view', '/trainer/calendar');
});

test('owned history entries protect Forward without the browser Navigation API', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
  });
  await demo(page);
  await changeHash(page, editorPath);
  await changeHash(page, profilePath);
  await page.goBack();
  await page.getByLabel('Название тренировки').fill('Черновик без Navigation API');
  await page.goForward();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Остаться' }).click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Черновик без Navigation API');
  await page.goForward();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти без сохранения' }).click();
  await expect(page).toHaveURL(new RegExp(`#${profilePath}$`));
});

test('Back to a legacy app entry without a position still protects an unsaved form', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
  });
  await demo(page);
  await changeHash(page, profilePath);
  await page.evaluate(() => history.replaceState({ reppyEntry: true }, '', location.href));
  await changeHash(page, editorPath);
  await page.getByLabel('Название тренировки').fill('Черновик перед старой записью');
  await page.goBack();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${editorPath}$`));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Остаться' }).click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Черновик перед старой записью');
  await page.goBack();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти без сохранения' }).click();
  await expect(page).toHaveURL(new RegExp(`#${profilePath}$`));
});
