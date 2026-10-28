import type { Page } from '@playwright/test';

export async function profileAction(page: Page, name: string) {
  const previousHash = await page.evaluate(() => location.hash);
  const area = previousHash.startsWith('#/student') ? 'student' : 'trainer';
  await page.goto(`/#/${area}/profile`);
  await page.getByRole('button', { name }).click();
  if (name.includes('тему')) await page.goto(`/${previousHash}`);
}
