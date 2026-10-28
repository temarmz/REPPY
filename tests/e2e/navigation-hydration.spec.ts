import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

declare global { interface Window { navigationGuardQa: { events: { type: string; path: string; index: unknown; guards: number }[] } } }

test('a restored dirty editor protects the first Forward traversal', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const guards = new Set<EventListenerOrEventListenerObject>();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if (this === window && type === 'beforeunload' && callback) guards.add(callback);
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      if (this === window && type === 'beforeunload' && callback) guards.delete(callback);
      return remove.call(this, type, callback, options);
    };
    window.navigationGuardQa = { events: [] };
    const record = (event: Event) => window.navigationGuardQa.events.push({ type: event.type, path: location.hash, index: history.state?.reppyIndex, guards: guards.size });
    window.addEventListener('popstate', record, { capture: true });
    window.addEventListener('hashchange', record, { capture: true });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  const editor = '/trainer/clients/maria/assign/new';
  await page.evaluate(editor => { location.hash = editor; }, editor);
  const title = page.getByRole('textbox', { name: 'Название тренировки' });
  await expect(title).toBeVisible();
  await page.evaluate(() => { location.hash = '/trainer/clients/maria'; });
  await expect(page.getByRole('heading', { name: 'МАРИЯ А.' })).toBeVisible();
  await page.goBack();
  await title.fill('Restored form must keep its navigation guard');
  await page.reload();
  await expect(title).toHaveValue('Restored form must keep its navigation guard');
  await page.goForward();
  try {
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${editor}$`));
    await page.getByRole('button', { name: 'Остаться', exact: true }).click();
    await expect(title).toHaveValue('Restored form must keep its navigation guard');
  } finally {
    const path = testInfo.outputPath('history-and-guard-events.json');
    await writeFile(path, JSON.stringify(await page.evaluate(() => window.navigationGuardQa.events)));
    await testInfo.attach('history-and-guard-events', { path, contentType: 'application/json' });
  }
});
