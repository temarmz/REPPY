import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/sign-out';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    plugins: [{ name: 'isolated-auth', enforce: 'pre', resolveId(source, importer) {
      if (source === './reppy-auth' && importer?.endsWith('/app/reppy-app.tsx')) {
        return fileURLToPath(new URL('../fixtures/sign-out-auth.ts', import.meta.url));
      }
      if (source === './supabase-client') return '\0isolated-supabase-client';
    }, load(id) {
      if (id === '\0isolated-supabase-client') {
        return `export const supabaseConfig = { enabled: false, url: '', anonKey: '' };
          export function getSupabaseClient() { return null; }`;
      }
    } }],
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/sign-out.tsx', import.meta.url)), formats: ['iife'], name: 'SignOutQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing sign-out fixture bundle');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing application styles');
  styleUrl = `/assets/${css}`;
});

for (const account of ['trainer', 'student', 'missing']) {
  for (const theme of account === 'missing' ? ['dark'] : ['dark', 'light']) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`logout failure stays actionable: ${account}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.addInitScript(theme => localStorage.setItem('reppy-ui:theme', theme), theme);
        await page.route('**/__qa_sign_out__?*', route => route.fulfill({ contentType: 'text/html', body:
          `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
        await page.goto(`/__qa_sign_out__?account=${account}#/${account === 'student' ? 'student' : 'trainer'}/profile`);
        const exit = page.getByRole('button', { name: account === 'missing' ? 'Выйти' : 'Выйти из аккаунта', exact: true });
        await expect(exit).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await exit.click();
        await expect.poll(() => page.evaluate(() => window.signOutQa.calls)).toBe(1);
        // Fail before testing loading UI too, so the original unhandled rejection is captured.
        await page.evaluate(() => window.signOutQa.fail());
        await expect(page.getByRole('alert')).toContainText('Не удалось выйти: соединение прервано.');
        await page.screenshot({ path: testInfo.outputPath('logout-error.png'), animations: 'disabled' });
        expect(errors).toEqual([]);
        await expect(exit).toBeEnabled();
        await exit.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(exit).toBeFocused();
        await expect(exit).toHaveCSS('outline-style', 'solid');
        const bounds = await exit.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        const pending = page.getByRole('button', { name: 'Выходим…', exact: true });
        await expect(pending).toBeDisabled();
        await page.evaluate(() => {
          const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Выходим'));
          button?.click(); button?.click();
        });
        expect(await page.evaluate(() => window.signOutQa.calls)).toBe(2);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath('logout-pending.png'), animations: 'disabled' });
        await page.evaluate(() => window.signOutQa.succeed());
        await expect(page.getByRole('button', { name: account === 'missing' ? 'Продолжить через Telegram' : 'Войти в REPPY', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Выходим…', exact: true })).toHaveCount(0);
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}
