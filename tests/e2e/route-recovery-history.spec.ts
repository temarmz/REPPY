import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/route-error-recovery';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/route-error-recovery.tsx', import.meta.url)), formats: ['iife'], name: 'RouteHistoryQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing recovery fixture bundle');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing real application styles');
  styleUrl = `/assets/${css}`;
});

async function openFixture(page: Page, area: 'trainer' | 'student', theme: string) {
  await page.addInitScript(theme => localStorage.setItem('reppy-ui:theme', theme), theme);
  await page.route('**/__qa_route_history__', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
  await page.goto(`/__qa_route_history__#/${area}/profile`);
  await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.controller?.hydrated)).toBe(true);
  await page.getByRole('textbox', { name: 'Телефон для проверки' }).fill('+7 222 222-22-22');
  await page.getByRole('button', { name: 'Сохранить для проверки' }).click();
  await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.calls)).toEqual(['+7 111 111-11-11']);
}

async function finishWrites(page: Page) {
  await page.evaluate(() => window.routeRecoveryQa.release());
  await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.controller?.persistencePhase)).toBe('idle');
  expect(await page.evaluate(() => ({ calls: window.routeRecoveryQa.calls, confirmedPhone: window.routeRecoveryQa.confirmedPhone,
    mounts: window.routeRecoveryQa.mounts, unmounts: window.routeRecoveryQa.unmounts }))).toEqual({
    calls: ['+7 111 111-11-11', '+7 222 222-22-22'], confirmedPhone: '+7 222 222-22-22', mounts: 1, unmounts: 0,
  });
}

for (const area of ['trainer', 'student'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`recovering the home screen retries only that view: ${area}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await openFixture(page, area, theme);
        const home = `/${area}`;
        await page.evaluate(home => { location.hash = home; }, home);
        await expect(page.locator(`[data-route-view="${home}"]`)).toBeVisible();
        await page.evaluate(home => window.routeRecoveryQa.failRoute(home), home);
        await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
        await page.screenshot({ path: testInfo.outputPath('home-error.png'), animations: 'disabled' });
        const errorsBeforeRetry = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-ui-errors-v1') ?? '[]').length);
        await page.getByRole('button', { name: 'Вернуться на главную' }).click();
        await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-ui-errors-v1') ?? '[]').length)).toBe(errorsBeforeRetry + 1);
        await page.evaluate(home => window.routeRecoveryQa.resolveRoute(home), home);
        await page.getByRole('button', { name: 'Вернуться на главную' }).click();
        await expect(page.locator('[data-route-active="true"]').getByRole('textbox', { name: 'Телефон для проверки' })).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`#/${area}/profile$`));
        await expect(page.locator('[data-route-active="true"]').getByRole('textbox', { name: 'Телефон для проверки' })).toHaveValue('+7 222 222-22-22');
        await finishWrites(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('home-recovered.png'), animations: 'disabled' });
      });
    }

    test(`Back and Forward retain a fallback for every failed view: ${area}, ${theme}`, async ({ page }, testInfo) => {
      await openFixture(page, area, theme);
      const first = `/${area}`;
      const second = `/${area}/calendar`;
      await page.evaluate(first => { window.routeRecoveryQa.failRoute(first); location.hash = first; }, first);
      await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
      await page.evaluate(second => { window.routeRecoveryQa.failRoute(second); location.hash = second; }, second);
      await expect(page).toHaveURL(new RegExp(`#${second}$`));
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-ui-errors-v1') ?? '[]').at(-1)?.routeArea))
        .toBe(`${area}/calendar`);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#${first}$`));
      await page.screenshot({ path: testInfo.outputPath('back-to-failed-view.png'), animations: 'disabled' });
      await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`#${second}$`));
      await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
      await page.evaluate(first => window.routeRecoveryQa.resolveRoute(first), first);
      await page.getByRole('button', { name: 'Вернуться на главную' }).click();
      await expect(page).toHaveURL(new RegExp(`#${first}$`));
      await expect(page.locator('[data-route-active="true"]').getByRole('textbox', { name: 'Телефон для проверки' })).toBeVisible();
      await finishWrites(page);
    });

    test(`keyboard focus stays on the recovery actions: ${area}, ${theme}`, async ({ page }) => {
      await openFixture(page, area, theme);
      const failed = `/${area}/profile`;
      await page.evaluate(failed => window.routeRecoveryQa.failRoute(failed), failed);
      const recover = page.getByRole('button', { name: 'Вернуться на главную' });
      await expect(recover).toBeFocused();
      await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Скачать журнал ошибки' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(recover).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('button', { name: 'Скачать журнал ошибки' })).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#/${area}$`));
      await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
      await finishWrites(page);
    });
  }
}
