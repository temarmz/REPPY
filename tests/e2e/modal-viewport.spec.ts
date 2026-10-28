import { profileAction } from './profile-action';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function visibleViewport(page: Page, height: number, top: number) {
  await page.evaluate(({ height, top }) => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => height });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => top });
    window.visualViewport!.dispatchEvent(new Event('resize'));
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  }, { height, top });
}

async function fitsVisibleViewport(dialog: Locator, height: number, top: number) {
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return Boolean(box && box.y >= top && box.y + box.height <= top + height + 1);
  }).toBe(true);
}

for (const theme of ['dark', 'light']) {
  for (const width of [320, 390, 440, 1280]) {
    test(`modal controls stay reachable in reduced viewport: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await profileAction(page, 'Включить светлую тему');
      await page.goto('/#/trainer/profile');
      await page.getByRole('button', { name: 'Сбросить демо-данные' }).click();
      const settings = page.getByRole('dialog', { name: 'Сбросить локальные данные?' });
      await expect(settings).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('reset-full.png') });
      await visibleViewport(page, 360, 60);
      await fitsVisibleViewport(settings, 360, 60);
      await settings.getByRole('button', { name: 'Остаться' }).click();

      await visibleViewport(page, 844, 0);
      await page.goto('/#/trainer/design-kit');
      await page.locator('.design-kit-section .date-picker-field > button').click();
      const picker = page.getByRole('dialog', { name: 'Дата тренировки' });
      await expect(picker).toBeVisible();
      // The calendar is taller than this area; its final action must scroll into view.
      await visibleViewport(page, 300, 40);
      await fitsVisibleViewport(picker, 300, 40);
      const choose = picker.getByRole('button', { name: 'Выбрать дату' });
      await choose.scrollIntoViewIfNeeded();
      const box = await choose.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(40);
      expect(box!.y + box!.height).toBeLessThanOrEqual(340);
      await page.screenshot({ path: testInfo.outputPath('date-picker-reduced.png') });
      await choose.click();
      await expect(picker).toHaveCount(0);
    });
  }

  test(`workout focus mode keeps instruction sheet within the visible viewport: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await profileAction(page, 'Включить светлую тему');
    await page.goto('/#/trainer/workout/assignment-artem-push-today');
    await page.getByRole('button', { name: /^Как выполнять —/ }).first().click();
    const instruction = page.getByRole('dialog');
    await visibleViewport(page, 360, 60);
    await fitsVisibleViewport(instruction, 360, 60);
    await instruction.getByRole('button', { name: 'Закрыть описание' }).click();
    await expect(instruction).toHaveCount(0);
    await expect(page).toHaveURL(/#\/trainer\/workout\/assignment-artem-push-today$/);
  });
}
