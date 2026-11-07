import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

declare global { interface Window { completeRemoteWorkout: () => void } }

let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, lib: { entry: fileURLToPath(new URL('../fixtures/remote-completion.tsx', import.meta.url)), formats: ['iife'], name: 'RemoteCompletionQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing test bundle');
  bundle = entry.code;
});
for (const theme of ['dark', 'light']) {
  test(`trainer sees the result when the student finishes remotely: ${theme}`, async ({ page }) => {
    await page.route('**/__qa_remote_completion__', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
    await page.goto('/__qa_remote_completion__');
    await expect(page.getByRole('button', { name: 'Завершить тренировку', exact: true })).toBeVisible();
    await page.evaluate(() => window.completeRemoteWorkout());
    await expect(page.getByLabel('Итоги тренировки')).toBeVisible();
    await expect(page.getByText('Завершённая тренировка', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Повторить на другую дату' })).toBeVisible();
    await expect(page.getByText('Ничего не найдено')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Завершить тренировку', exact: true })).toHaveCount(0);
  });
}
