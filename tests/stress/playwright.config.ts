import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
export default defineConfig({ ...base, testDir: '../e2e', testMatch: '**/stress-soak.spec.ts', workers: 2,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4183' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4183', url: 'http://127.0.0.1:4183', reuseExistingServer: !process.env.CI, timeout: 120000 },
  outputDir: '../../work/stress-2026-11-07/browser-artifacts',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../work/stress-2026-11-07/browser-soak.json', import.meta.url)) }]],
  projects: [ { name: 'stress-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'stress-webkit', use: { browserName: 'webkit', viewport: { width: 360, height: 800 } } } ] });
