import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) {
  for (const width of [320, 390, 440, 844, 1280]) {
    test(`failed video save keeps the instruction and supports retry: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      const data = createInitialState();
      data.loggedIn = true;
      await page.addInitScript(({ data, theme }) => {
        localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
        localStorage.setItem('reppy-ui:theme', theme);
        const open = IDBFactory.prototype.open;
        let blocked = true;
        IDBFactory.prototype.open = function (...args) {
          if (blocked) throw new DOMException('Storage denied for QA', 'SecurityError');
          return open.apply(this, args);
        };
        window.addEventListener('qa-storage-available', () => { blocked = false; });
      }, { data, theme });
      await page.setViewportSize({ width, height: width === 844 ? 320 : 844 });
      await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
      await page.getByRole('button', { name: 'Как выполнять — Жим лёжа', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' });
      const description = dialog.getByRole('textbox', { name: 'Подробное описание упражнения' });
      await description.fill('Сохрани технику и выбранный файл при ошибке сети.');
      await dialog.locator('input[type="file"]').setInputFiles({
        name: 'bench-technique.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]),
      });
      const save = dialog.getByRole('button', { name: 'Сохранить инструкцию' });
      await save.click();
      await expect(dialog.getByText('Не удалось сохранить видео. Попробуй ещё раз.')).toBeVisible();
      await expect(description).toHaveValue('Сохрани технику и выбранный файл при ошибке сети.');
      await expect(dialog.locator('video')).toBeVisible();
      await expect(save).toBeEnabled();
      await save.scrollIntoViewIfNeeded();
      const box = await save.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(width === 844 ? 320 : 844);
      await page.screenshot({ path: testInfo.outputPath('instruction-save-error.png') });
      await page.evaluate(() => window.dispatchEvent(new Event('qa-storage-available')));
      await save.click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Как выполнять — Жим лёжа', exact: true }).click();
      await expect(description).toHaveValue('Сохрани технику и выбранный файл при ошибке сети.');
      await expect(dialog.locator('video')).toBeVisible();
    });
  }
}
