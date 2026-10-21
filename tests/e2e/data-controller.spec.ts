import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type { ControllerFixture } from '../fixtures/data-controller';

let bundle: string;
test.beforeAll(async () => {
  // Bundle the real React hook in memory; never add a test entry to the published site.
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../fixtures/data-controller.tsx', import.meta.url)), formats: ['iife'], name: 'ReppyQa' } } });
  const outputs = Array.isArray(result) ? result : [result];
  const entry = outputs.flatMap((output) => 'output' in output ? output.output : []).find((item) => item.type === 'chunk' && item.isEntry);
  if (entry?.type !== 'chunk') throw new Error('Missing controller test bundle');
  bundle = entry.code;
});

async function ready(page: Page, account: 'a' | 'b') {
  await expect.poll(() => page.evaluate(() => ({ hydrated: window.reppyQa.controller?.hydrated,
    ids: window.reppyQa.controller?.data.students.map((student) => student.id) })))
    .toEqual({ hydrated: true, ids: [`${account}-existing`] });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__qa_controller__', (route) => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><html><body><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>` }));
  await page.goto('/__qa_controller__');
  expect(errors).toEqual([]);
  await ready(page, 'a');
});

for (const returnToAccount of [false, true]) {
  test(`late invitation cannot update a ${returnToAccount ? 'new lifecycle of the original account' : 'different account'}`, async ({ page }) => {
    await page.evaluate(() => { window.reppyQa.startInvitation(); window.reppyQa.selectAccount('b'); });
    await ready(page, 'b');
    if (returnToAccount) {
      await page.evaluate(() => window.reppyQa.selectAccount('a'));
      await ready(page, 'a');
    }
    await page.evaluate(() => window.reppyQa.completeInvitation());
    await expect.poll(() => page.evaluate(() => window.reppyQa.outcome)).not.toBe('pending');
    await ready(page, returnToAccount ? 'a' : 'b');
    expect(await page.evaluate(() => window.reppyQa.outcome)).toBe('rejected:AbortError');
    await page.evaluate(() => { window.reppyQa.startInvitation(); window.reppyQa.completeInvitation(); });
    await expect.poll(() => page.evaluate(() => window.reppyQa.outcome)).toBe('resolved');
    const account = returnToAccount ? 'a' : 'b';
    await expect.poll(() => page.evaluate(() => window.reppyQa.controller?.data.students.map((student) => student.id)))
      .toEqual([`${account}-existing`, `${account}-invited`]);
  });
}

test('a stale Realtime load cannot remove a successfully invited student or accept its old revision map', async ({ page }) => {
  await page.evaluate(() => { window.reppyQa.startInvitation(); window.reppyQa.holdNextLoad(); window.reppyQa.refresh(); });
  await expect.poll(() => page.evaluate(() => window.reppyQa.heldLoads)).toBe(1);
  await page.evaluate(() => window.reppyQa.completeInvitation());
  await expect.poll(() => page.evaluate(() => window.reppyQa.outcome)).toBe('resolved');
  await page.evaluate(() => window.reppyQa.releaseLoad());
  await expect.poll(() => page.evaluate(() => window.reppyQa.acceptedHeldLoad)).not.toBeNull();
  expect(await page.evaluate(() => window.reppyQa.acceptedHeldLoad)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.reppyQa.controller?.data.students.map((student) => student.id)))
    .toEqual(['a-existing', 'a-invited']);
});

test('an explicit reload superseded by an invitation finishes with fresh data instead of staying busy', async ({ page }) => {
  await page.evaluate(() => {
    window.reppyQa.startInvitation();
    window.reppyQa.holdNextLoad();
    window.reppyQa.controller!.reloadCurrentData();
  });
  await expect.poll(() => page.evaluate(() => window.reppyQa.heldLoads)).toBe(1);
  await page.evaluate(() => window.reppyQa.completeInvitation());
  await expect.poll(() => page.evaluate(() => window.reppyQa.outcome)).toBe('resolved');
  await page.evaluate(() => window.reppyQa.releaseLoad());
  await expect.poll(() => page.evaluate(() => window.reppyQa.controller?.persistencePhase)).toBe('idle');
  await expect.poll(() => page.evaluate(() => window.reppyQa.controller?.data.students.map((student) => student.id)))
    .toEqual(['a-existing', 'a-invited']);
});

// Keep the fixture contract in the type-check graph without exporting runtime test controls.
export type { ControllerFixture };
