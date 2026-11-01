import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/route-error-recovery';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/route-error-recovery.tsx', import.meta.url)), formats: ['iife'], name: 'RouteRecoveryQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing recovery fixture bundle');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing real application styles');
  styleUrl = `/assets/${css}`;
});

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`failed lazy route preserves queued writes and restores navigation: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(theme => localStorage.setItem('reppy-ui:theme', theme), theme);
      await page.route('**/__qa_route_recovery__', route => route.fulfill({ contentType: 'text/html', body:
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
      await page.goto('/__qa_route_recovery__#/student/profile');
      await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.controller?.hydrated)).toBe(true);
      const phone = page.locator('[data-route-active="true"]').getByRole('textbox', { name: 'Телефон для проверки' });
      await phone.fill('+7 222 222-22-22');
      await page.getByRole('button', { name: 'Сохранить для проверки' }).click();
      await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.calls)).toEqual(['+7 111 111-11-11']);
      const nav = page.locator(width <= 800 ? '.bottom-nav' : '.desktop-nav');
      await nav.getByRole('button', { name: 'Календарь', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
      const errorLog = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-ui-errors-v1') ?? '[]'));
      expect(errorLog.at(-1)).toMatchObject({ routeArea: 'student/calendar', name: 'Error' });
      await page.screenshot({ path: testInfo.outputPath('failed-route.png'), animations: 'disabled' });
      await testInfo.attach('controller-before-recovery', { body: JSON.stringify(await page.evaluate(() => ({
        mounts: window.routeRecoveryQa.mounts, unmounts: window.routeRecoveryQa.unmounts, calls: window.routeRecoveryQa.calls,
      }))), contentType: 'application/json' });
      expect(await page.evaluate(() => window.routeRecoveryQa.unmounts)).toBe(0);
      await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
      await expect(page.getByRole('button', { name: 'Вернуться на главную' })).toBeFocused();

      await expect(page.getByRole('alert')).toContainText('Не удалось открыть экран');
      await expect(page.getByRole('button', { name: 'Перезагрузить', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Вернуться на главную' }).click();
      await expect(page).toHaveURL(/#\/student$/);
      await page.locator('.topbar').getByRole('button', { name: 'Профиль', exact: true }).click();
      await expect(phone).toHaveValue('+7 222 222-22-22');
      await page.evaluate(() => window.routeRecoveryQa.release());
      await expect.poll(() => page.evaluate(() => window.routeRecoveryQa.controller?.persistencePhase)).toBe('idle');
      expect(await page.evaluate(() => ({ calls: window.routeRecoveryQa.calls, confirmedPhone: window.routeRecoveryQa.confirmedPhone,
        mounts: window.routeRecoveryQa.mounts, unmounts: window.routeRecoveryQa.unmounts }))).toEqual({
        calls: ['+7 111 111-11-11', '+7 222 222-22-22'], confirmedPhone: '+7 222 222-22-22', mounts: 1, unmounts: 0,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
