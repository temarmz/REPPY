import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type { PaymentInput } from '../../app/subscription-ledger';
declare global { interface Window { paymentConflictQa: { remote: () => void; saves: PaymentInput[] } } }
test('an old payment form cannot overwrite a new lesson count and reload pins its revision', async ({ page }) => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, lib: { entry: fileURLToPath(new URL('../fixtures/payment-conflict.tsx', import.meta.url)), formats: ['iife'], name: 'PaymentConflictQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing test bundle');
  await page.route('**/__qa_payment__', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${entry.code.replaceAll('</script', '<\\/script')}</script>` }));
  await page.goto('/__qa_payment__');
  const lessons = page.getByRole('spinbutton', { name: 'Количество занятий' });
  await expect(lessons).toHaveValue('2');
  await page.evaluate(() => window.paymentConflictQa.remote());
  await page.getByRole('textbox', { name: /Комментарий/ }).fill('Только комментарий');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  expect(await page.evaluate(() => window.paymentConflictQa.saves)).toEqual([]);
  await page.getByRole('button', { name: 'Загрузить актуальное пополнение' }).click();
  await expect(lessons).toHaveValue('3');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  expect(await page.evaluate(() => window.paymentConflictQa.saves)).toMatchObject([{ lessons: 3, expectedRevision: 2 }]);
});
