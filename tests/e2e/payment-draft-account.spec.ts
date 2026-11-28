import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/payment-draft-account';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, lib: { entry: fileURLToPath(new URL('../fixtures/payment-draft-account.tsx', import.meta.url)), formats: ['iife'], name: 'PaymentDraftQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing payment draft test bundle');
  bundle = entry.code;
});

test('trainers sharing one student cannot restore or erase each other\'s payment drafts', async ({ page }) => {
  await page.route('**/__qa_payment_draft__', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script>` }));
  await page.goto('/__qa_payment_draft__');
  const lessons = page.getByRole('spinbutton', { name: 'Количество занятий' });
  const comment = page.getByRole('textbox', { name: /Комментарий/ });
  await lessons.fill('12');
  await comment.fill('Частный комментарий тренера A');
  await expect.poll(() => page.evaluate(() => JSON.stringify(localStorage))).toContain('Частный комментарий тренера A');
  await page.evaluate(() => window.paymentDraftQa.select('trainer-b'));
  await expect(lessons).toHaveValue('8');
  await expect(comment).toHaveValue('');
  await lessons.fill('3');
  await comment.fill('Комментарий B');
  await page.evaluate(() => window.paymentDraftQa.select('trainer-a'));
  await expect(lessons).toHaveValue('12');
  await expect(comment).toHaveValue('Частный комментарий тренера A');
  await page.reload();
  await expect(lessons).toHaveValue('12');
  await page.evaluate(() => window.paymentDraftQa.select('trainer-b'));
  await expect(lessons).toHaveValue('3');
  await page.getByRole('button', { name: 'Добавить пополнение', exact: true }).click();
  expect(await page.evaluate(() => window.paymentDraftQa.commands)).toMatchObject([
    { account: 'trainer-b', command: { type: 'subscription.payment.create', entry: { lessonDelta: 3, comment: 'Комментарий B' } } },
  ]);
  await page.evaluate(() => window.paymentDraftQa.select('trainer-a'));
  await expect(lessons).toHaveValue('12');
  await expect(comment).toHaveValue('Частный комментарий тренера A');
});

test('an ownerless legacy payment draft is not imported into the current account', async ({ page }) => {
  const key = 'reppy-ui:draft:subscription:shared-student:new';
  const legacy = JSON.stringify({ savedAt: Date.now(), value: { lessons: '25', amountRub: '1000', comment: 'Unknown owner' } });
  await page.addInitScript(({ key, legacy }) => localStorage.setItem(key, legacy), { key, legacy });
  await page.route('**/__qa_payment_draft__', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script>` }));
  await page.goto('/__qa_payment_draft__');
  await expect(page.getByRole('spinbutton', { name: 'Количество занятий' })).toHaveValue('8');
  await expect(page.getByRole('textbox', { name: /Комментарий/ })).toHaveValue('');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(legacy);
});
