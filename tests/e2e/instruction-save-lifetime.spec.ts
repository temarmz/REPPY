import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

declare global { interface Window { videoSaveQa: { held: boolean; writes: number; release: () => void } } }

for (const mode of ['plan', 'active'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`closing a pending instruction save cannot overwrite newer edits: ${mode}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        const data = createInitialState();
        data.loggedIn = true;
        await page.addInitScript(({ data, theme }) => {
          localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
          localStorage.setItem('reppy-ui:theme', theme);
          const open = IDBFactory.prototype.open;
          let held: IDBOpenDBRequest | undefined;
          let released = false;
          window.videoSaveQa = { held: false, writes: 0, release() { released = true; held!.dispatchEvent(new Event('success')); } };
          IDBFactory.prototype.open = function (...args) {
            const request = open.apply(this, args);
            request.addEventListener('success', event => {
              if (released) return;
              held = request;
              window.videoSaveQa.held = true;
              event.stopImmediatePropagation();
            });
            return request;
          };
          const transaction = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function (...args) {
            const result = transaction.apply(this, args);
            if (args[1] === 'readwrite') result.addEventListener('complete', () => { window.videoSaveQa.writes++; });
            return result;
          };
        }, { data, theme });
        const route = mode === 'plan' ? '/trainer/assignments/assignment-artem-push-today/edit' : '/trainer/workout/assignment-artem-push-today';
        await page.goto(`/#${route}`);
        const instruction = page.getByRole('button', { name: 'Как выполнять — Жим лёжа', exact: true });
        await instruction.click();
        const dialog = page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' });
        const text = dialog.getByRole('textbox', { name: 'Подробное описание упражнения' });
        await text.fill('Old request that will finish after closing');
        await dialog.locator('input[type="file"]').setInputFiles({ name: 'technique.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]) });
        await dialog.getByRole('button', { name: 'Сохранить инструкцию' }).click();
        await expect.poll(() => page.evaluate(() => window.videoSaveQa.held)).toBe(true);
        await expect(text).toBeDisabled();
        await expect(dialog.locator('input[type="file"]')).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();
        await page.screenshot({ path: testInfo.outputPath('saving.png'), animations: 'disabled' });
        await dialog.getByRole('button', { name: 'Закрыть описание' }).click();
        await expect(dialog).toHaveCount(0);
        const weight = page.locator('.active-exercise-card').first().getByLabel('КГ').first();
        await weight.fill('37.5');
        await weight.press('Tab');
        await instruction.click();
        await text.fill('New instruction must survive the old response');
        await page.evaluate(() => window.videoSaveQa.release());
        await expect.poll(() => page.evaluate(() => window.videoSaveQa.writes)).toBe(1);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.screenshot({ path: testInfo.outputPath('late-response.png'), animations: 'disabled' });
        await expect(dialog).toBeVisible();
        await expect(text).toHaveValue('New instruction must survive the old response');
        await dialog.getByRole('button', { name: 'Сохранить инструкцию' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(weight).toHaveValue('37.5');
        await instruction.click();
        await expect(text).toHaveValue('New instruction must survive the old response');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}
