import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/recovery-layout.tsx', import.meta.url)), formats: ['iife'], name: 'RecoveryLayoutQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing layout fixture bundle');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing application styles');
  styleUrl = `/assets/${css}`;
});

for (const screen of ['load', 'root', 'overlay']) {
  for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`recovery content can be read and reached: ${screen}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.route('**/__qa_recovery_layout__?*', route => route.fulfill({ contentType: 'text/html', body:
          `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
        await page.goto(`/__qa_recovery_layout__?screen=${screen}&theme=${theme}`);
        const logo = page.getByRole('img', { name: 'REPPY', exact: true });
        await expect(logo).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('recovery-start.png'), animations: 'disabled' });
        const box = await logo.boundingBox();
        expect(box!.y, 'Content must not be centered above the reachable scroll origin').toBeGreaterThanOrEqual(0);
        const action = page.getByRole('button', { name: screen === 'load' ? 'Повторить' : screen === 'overlay' ? 'Вернуться на главную' : 'Перезагрузить', exact: true });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        const bounds = await action.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: testInfo.outputPath('recovery-action.png'), animations: 'disabled' });
        if (screen !== 'root') {
          await action.click();
          await expect(page.locator('body')).toHaveAttribute('data-recovered', 'true');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}
