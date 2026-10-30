import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/telegram-recovery';
import { buttonContrast } from './button-contrast';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/telegram-recovery.tsx', import.meta.url)), formats: ['iife'], name: 'TelegramRecoveryQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing Telegram recovery fixture');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing application styles');
  styleUrl = `/assets/${css}`;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/__qa_telegram_recovery__?*', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
  await page.addInitScript(() => sessionStorage.setItem('reppy-telegram-oidc', JSON.stringify({ action: 'login', state: 'qa-state',
    nonce: 'qa-nonce', verifier: 'qa-verifier', returnHash: '#/auth/sign-in',
    startedAt: Date.now() - (new URLSearchParams(location.search).has('expired') ? 11 * 60_000 : 0) })));
});

for (const theme of ['dark', 'light']) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    for (const step of ['exchange', 'login', 'session']) {
      test(`Telegram redirect retry: ${step}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.goto(`/__qa_telegram_recovery__?step=${step}&theme=${theme}&code=qa-code&state=qa-state#/auth/sign-in`);
        await expect(page.getByRole('alert')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('redirect-error.png'), animations: 'disabled' });
        const retry = page.getByRole('button', { name: 'Повторить вход', exact: true });
        await expect(retry).toBeVisible();
        expect(await page.evaluate(() => sessionStorage.getItem('reppy-telegram-oidc') !== null)).toBe(true);
        await retry.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => window.telegramRecoveryQa.held)).toBe(true);
        await expect(page.getByRole('button', { name: 'Открываем Telegram…' })).toBeDisabled();
        await page.evaluate(() => window.telegramRecoveryQa.release());
        await expect(page.getByRole('heading', { name: 'Вход подтверждён' })).toBeVisible();
        expect(await page.evaluate(() => window.telegramRecoveryQa.calls)).toEqual({
          exchange: step === 'exchange' ? 2 : 1, login: step === 'exchange' ? 1 : 2,
          session: step === 'session' ? 2 : 1, fresh: 0,
        });
        expect(await page.evaluate(() => sessionStorage.getItem('reppy-telegram-oidc'))).toBeNull();
        expect(new URL(page.url()).search).toBe('');
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }

    test(`an expired callback can start a fresh login: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/__qa_telegram_recovery__?step=login&theme=${theme}&expired=1&code=qa-code&state=qa-state#/auth/sign-in`);
      await expect(page.getByRole('alert')).toContainText('устарел');
      await page.getByRole('button', { name: 'Войти заново', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Имя тренера' })).toHaveValue('Новый вход');
      const create = page.getByRole('button', { name: 'Создать кабинет тренера', exact: true });
      await expect(create).toBeEnabled();
      await create.hover();
      expect(await buttonContrast(create)).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => window.telegramRecoveryQa.calls)).toEqual({ exchange: 0, login: 0, session: 0, fresh: 1 });
      expect(await page.evaluate(() => sessionStorage.getItem('reppy-telegram-oidc'))).toBeNull();
      expect(new URL(page.url()).search).toBe('');
      await page.screenshot({ path: testInfo.outputPath('fresh-login.png'), animations: 'disabled' });
    });
  }
}
