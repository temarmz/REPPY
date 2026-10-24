import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/invite-draft';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/invite-draft.tsx', import.meta.url)), formats: ['iife'], name: 'InviteDraftQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap((output) => 'output' in output ? output.output : []).find((item) => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing invitation test bundle');
  bundle = entry.code;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/__qa_invite_draft__', (route) => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
});

test('invitation drafts stay with their trainer through account changes, reload and successful creation', async ({ page }) => {
  await page.goto('/__qa_invite_draft__');
  const name = page.getByLabel('Имя ученика');
  await name.fill('Private student of trainer A');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('trainer-b'));
  await expect(name).toHaveValue('');
  await name.fill('Private student of trainer B');
  await page.reload();
  await expect(name).toHaveValue('Private student of trainer A');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('demo'));
  await expect(name).toHaveValue('');
  await name.fill('Demo student');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('trainer-b'));
  await expect(name).toHaveValue('Private student of trainer B');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByText('Private student of trainer B почти в команде')).toBeVisible();
  expect(await page.evaluate(() => window.inviteDraftQa.created)).toEqual([{ account: 'trainer-b', name: 'Private student of trainer B' }]);
  await page.evaluate(() => window.inviteDraftQa.selectAccount('trainer-a'));
  await expect(name).toHaveValue('Private student of trainer A');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('trainer-b'));
  await expect(name).toHaveValue('');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('demo'));
  await expect(name).toHaveValue('Demo student');
});

test('unowned legacy invitation drafts cannot be restored into an account or demo', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('reppy-ui:draft:invite-student', JSON.stringify({ savedAt: Date.now(), value: { name: 'Unknown owner' } })));
  await page.goto('/__qa_invite_draft__');
  const name = page.getByLabel('Имя ученика');
  await expect(name).toHaveValue('');
  await page.evaluate(() => window.inviteDraftQa.selectAccount('demo'));
  await expect(name).toHaveValue('');
});
