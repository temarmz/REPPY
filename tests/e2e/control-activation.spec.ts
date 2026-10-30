import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {} from '../fixtures/control-activation';

let bundle: string;
let styleUrl: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/control-activation.tsx', import.meta.url)), formats: ['iife'], name: 'ControlActivationQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap(output => 'output' in output ? output.output : []).find(item => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing control activation fixture');
  bundle = entry.code;
  const css = readdirSync(new URL('../../pages-dist/assets/', import.meta.url)).find(name => /^index-.*\.css$/.test(name));
  if (!css) throw new Error('Missing application styles');
  styleUrl = `/assets/${css}`;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/__qa_controls__?*', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUrl}"></head><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
});

for (const theme of ['dark', 'light']) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`account registration submits by touch: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/__qa_controls__?mode=account&theme=${theme}`);
      await page.getByRole('button', { name: 'Продолжить через Telegram' }).tap();
      const name = page.getByRole('textbox', { name: 'Имя тренера' });
      await expect(name).toHaveValue('Тестовый тренер');
      const submit = page.getByRole('button', { name: 'Создать кабинет тренера', exact: true });
      await page.screenshot({ path: testInfo.outputPath('registration-before-tap.png'), animations: 'disabled' });
      await page.evaluate(() => { window.controlActivationQa.holdRegistration = true; });
      await submit.tap();
      const pending = page.getByRole('button', { name: 'Создаём кабинет…', exact: true });
      await expect(pending).toBeDisabled();
      await pending.evaluate((button: HTMLButtonElement) => button.click());
      expect(await page.evaluate(() => window.controlActivationQa.created)).toEqual(['Тестовый тренер']);
      await page.screenshot({ path: testInfo.outputPath('registration-pending.png'), animations: 'disabled' });
      await page.evaluate(() => window.controlActivationQa.releaseRegistration());
      await expect(page.getByRole('heading', { name: 'Кабинет создан' })).toBeVisible();
      expect(await page.evaluate(() => window.controlActivationQa.created)).toEqual(['Тестовый тренер']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

  }
}

test('touch keeps native form submit, submitter, bubbling and cancellation', async ({ page }) => {
  await page.goto('/__qa_controls__?mode=native');
  const name = page.getByRole('textbox', { name: 'Имя', exact: true });
  const submit = page.getByRole('button', { name: 'Сохранить', exact: true });
  await submit.tap();
  expect(await page.evaluate(() => window.controlActivationQa.submitted)).toBe(0);
  await name.fill('Тренер');
  await page.evaluate(() => { window.controlActivationQa.events = []; });
  await submit.tap();
  expect(await page.evaluate(() => window.controlActivationQa.submitted)).toBe(1);
  expect(await page.evaluate(() => window.controlActivationQa.submitter)).toBe('save');
  expect(await page.evaluate(() => window.controlActivationQa.events)).toEqual(['capture:click', 'target:click', 'bubble:click']);
  await page.evaluate(() => { window.controlActivationQa.cancel = true; });
  await submit.tap();
  expect(await page.evaluate(() => window.controlActivationQa.submitted)).toBe(1);
});

test('touch keeps native form reset', async ({ page }) => {
  await page.goto('/__qa_controls__?mode=native');
  const name = page.getByRole('textbox', { name: 'Имя', exact: true });
  await name.fill('Изменение');
  await page.getByRole('button', { name: 'Сбросить', exact: true }).tap();
  await expect(name).toHaveValue('');
  expect(await page.evaluate(() => window.controlActivationQa.reset)).toBe(1);
});

test('tap fallback stays single without a browser compatibility click', async ({ page }) => {
  await page.goto('/__qa_controls__?mode=replacement');
  await page.evaluate(() => document.addEventListener('click', event => {
    if (event.isTrusted) event.stopImmediatePropagation();
  }, true));
  await page.getByRole('button', { name: 'Открыть', exact: true }).tap();
  const confirm = page.getByRole('button', { name: 'Подтвердить', exact: true });
  await expect(confirm).toBeVisible();
  expect(await page.evaluate(() => window.controlActivationQa.events)).toEqual(['open']);
  await confirm.tap();
  expect(await page.evaluate(() => window.controlActivationQa.events)).toEqual(['open', 'confirm']);
});

test('touch activation respects click capture cancellation', async ({ page }) => {
  await page.goto('/__qa_controls__?mode=replacement');
  await page.evaluate(() => document.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true));
  await page.getByRole('button', { name: 'Открыть', exact: true }).tap();
  expect(await page.evaluate(() => window.controlActivationQa.events)).toEqual([]);
});

test('mouse and keyboard keep native form submission', async ({ page }) => {
  await page.goto('/__qa_controls__?mode=native');
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Тренер');
  const submit = page.getByRole('button', { name: 'Сохранить', exact: true });
  await submit.click();
  await submit.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.controlActivationQa.submitted)).toBe(2);
  expect(await page.evaluate(() => window.controlActivationQa.events)).toEqual([
    'capture:click', 'target:click', 'bubble:click', 'capture:click', 'target:click', 'bubble:click',
  ]);
});
