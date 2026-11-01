// Local demo only; never signs in to Supabase or changes production data.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '../../app/reppy-data.ts';

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173';
const output = fileURLToPath(new URL('../../work/screen-parity/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const role of ['trainer', 'student']) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', isMobile: true, hasTouch: true, colorScheme: theme });
    const seed = createInitialState(); seed.loggedIn = true; seed.role = role;
    await context.addInitScript(({ seed, theme }) => {
      if (!localStorage.getItem('reppy-demo-v0')) {
        localStorage.setItem('reppy-demo-v0', JSON.stringify(seed));
        localStorage.setItem('reppy-ui:theme', theme);
      }
    }, { seed, theme });
    const page = await context.newPage();
    for (const screen of ['home', 'calendar', 'profile']) {
      await page.goto(`${baseURL}/#/${role}${screen === 'home' ? '' : '/' + screen}`);
      await page.locator('[data-route-active="true"] main').waitFor();
      await page.evaluate(() => document.fonts.ready);
      // The route enters with an opacity animation; do not capture its first frame.
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${output}web-${role}-${screen}-${theme}.png` });
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log(`Saved 12 web screenshots to ${output}`);
