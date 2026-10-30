import { defineConfig, devices } from '@playwright/test';

const mobile = {
  colorScheme: 'dark' as const,
  hasTouch: true,
  isMobile: true,
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
};

const qualityGate = '**/quality-gate.spec.ts';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...mobile,
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'iphone-webkit',
      testMatch: [qualityGate, '**/control-activation.spec.ts'],
      use: {
        ...devices['iPhone 13'],
        ...mobile,
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'iphone-small',
      testMatch: qualityGate,
      use: {
        ...mobile,
        browserName: 'chromium',
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'mobile-light',
      testMatch: qualityGate,
      use: {
        ...mobile,
        browserName: 'chromium',
        colorScheme: 'light',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-chromium',
      testMatch: qualityGate,
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:4173',
  },
});
