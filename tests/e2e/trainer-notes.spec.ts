import { expect, test, type Page } from '@playwright/test';

async function openNotes(page: Page, width = 390, theme = 'dark') {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('reppy-ui:theme', value); }, theme);
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.locator(width > 800 ? '.desktop-nav' : '.bottom-nav').getByRole('button', { name: 'Заметки' }).click();
  await expect(page.locator('.note-day-card')).toHaveCount(4);
  await expect(page.locator('.note-editor').first()).not.toHaveAttribute('readonly');
}

for (const width of [360, 390, 1280]) for (const theme of ['dark', 'light']) {
  test(`дневник: четыре плитки, читаемый текст и отдельная прокрутка ${width} ${theme}`, async ({ page }) => {
    await openNotes(page, width, theme);
    const cards = page.locator('.note-day-card');
    const first = cards.first().getByRole('textbox');
    await first.fill('Длинная запись про ученика\n'.repeat(80));
    await expect(first).toHaveCSS('font-size', '16px');
    await expect.poll(() => first.evaluate((field) => field.scrollHeight > field.clientHeight)).toBe(true);
    const position = await cards.nth(1).boundingBox();
    await first.evaluate((field) => { field.scrollTop = 600; });
    expect((await cards.nth(1).boundingBox())?.y).toBe(position?.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator('.note-editor-tools button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `test-results/notes-${width}-${theme}.png` });
  });
}

test('заметка сохраняется, списки продолжаются, смена даты сохраняет четыре дня', async ({ page }) => {
  await openNotes(page);
  const first = page.locator('.note-day-card').first();
  const field = first.getByRole('textbox');
  await field.fill('Анна');
  await first.getByRole('button', { name: 'Маркированный список', exact: true }).click();
  await expect(field).toHaveValue('• Анна');
  await field.press('End'); await field.press('Enter'); await field.pressSequentially('Проверить технику');
  await expect(field).toHaveValue('• Анна\n• Проверить технику');
  await first.getByRole('button', { name: 'Нумерованный список', exact: true }).click();
  await expect(field).toHaveValue('• Анна\n1. Проверить технику');
  await expect(first.getByRole('status')).toHaveText('Сохранено');
  await page.reload();
  await expect(page.locator('.note-editor').first()).toHaveValue('• Анна\n1. Проверить технику');
  const original = await page.locator('.note-day-card').first().getAttribute('data-note-date');
  await page.getByRole('button', { name: 'Следующие четыре дня' }).click();
  await expect(page.locator('.note-day-card').first()).not.toHaveAttribute('data-note-date', original!);
  await page.getByRole('button', { name: 'Предыдущие четыре дня' }).click();
  await expect(page.locator('.note-editor').first()).toHaveValue('• Анна\n1. Проверить технику');
  await page.getByRole('button', { name: /^Выбрать дату/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Выбрать день', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Следующий месяц' }).click();
  await dialog.locator('.calendar-grid button:not(.outside)').nth(14).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.note-day-card')).toHaveCount(4);
  await expect(page.locator('.note-day-card').first()).toHaveAttribute('data-note-date', /-15$/);
});

test('у ученика нет вкладки заметок; клавиатура доступна тренеру', async ({ page }) => {
  await openNotes(page);
  const field = page.locator('.note-editor').first();
  await field.focus(); await field.pressSequentially('Текст с клавиатуры');
  await field.press('Tab');
  await expect(field).not.toBeFocused();
  await page.goto('/#/student');
  await expect(page.locator('.bottom-nav').getByRole('button', { name: 'Заметки' })).toHaveCount(0);
});

test('ошибка сохранения сохраняет черновик после перезагрузки', async ({ page }) => {
  await openNotes(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'reppy-trainer-notes-demo-v1') throw new DOMException('Storage denied', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const card = page.locator('.note-day-card').first();
  await card.getByRole('textbox').fill('Текст переживёт сбой');
  await expect(card.getByRole('button', { name: /^Повторить сохранение/ })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.locator('.note-editor').first()).toHaveValue('Текст переживёт сбой');
  await expect(page.locator('.note-day-card').first().getByRole('status')).toHaveText('Сохранено');
});

test('конфликт показывает оба текста и сохраняет явно выбранную версию', async ({ page }) => {
  await openNotes(page);
  const card = page.locator('.note-day-card').first();
  const date = await card.getAttribute('data-note-date');
  await page.evaluate((day) => {
    localStorage.setItem('reppy-trainer-notes-demo-v1', JSON.stringify({ [day!]: {
      date: day, content: 'Текст с другого устройства', revision: 1, mutationId: crypto.randomUUID(), updatedAt: new Date().toISOString(),
    } }));
  }, date);
  await card.getByRole('textbox').fill('Мой новый текст');
  await card.getByRole('button', { name: /^Выбрать версию/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Выбрать версию заметки' });
  await expect(dialog.getByRole('textbox').nth(0)).toHaveValue('Мой новый текст');
  await expect(dialog.getByRole('textbox').nth(1)).toHaveValue('Текст с другого устройства');
  await dialog.getByRole('button', { name: 'Оставить мой текст' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole('status')).toHaveText('Сохранено');
  await page.reload();
  await expect(page.locator('.note-editor').first()).toHaveValue('Мой новый текст');
});
