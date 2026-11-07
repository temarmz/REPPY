import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../e2e', testMatch: ['**/operations-history.spec.ts', '**/navigation-guard.spec.ts', '**/navigation-hydration.spec.ts'],
  workers: 2, retries: 0, reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../work/ops-browser-report.json', import.meta.url)) }]],
  outputDir: '../../work/ops-browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:4185', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4185', url: 'http://127.0.0.1:4185', reuseExistingServer: false },
  projects: [
    { name: 'ops-webkit', use: { browserName: 'webkit', viewport: { width: 360, height: 568 } } },
    { name: 'ops-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 568 } } },
  ],
});
