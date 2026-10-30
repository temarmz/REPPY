import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

test('плавающее меню сохраняет боковые отступы, safe area и положение при скролле', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await profileAction(page, 'Переключиться в роль ученика');
  // Desktop browser engines do not expose the hardware home-indicator inset.
  // Exercise the floating bar's bottom margin with iPhone's usual 34px safe area.
  await page.addStyleTag({ content: ':root { --app-safe-bottom: 34px; }' });
  const nav = page.locator('.bottom-nav');
  for (const size of [{ width: 440, height: 956 }, { width: 390, height: 700 }, { width: 360, height: 700 }, { width: 740, height: 390 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const box = await nav.boundingBox();
      return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - (size.height - 42));
    }).toBeLessThanOrEqual(1);
    await expect(nav).toHaveCSS('margin-left', '12px');
    await expect(nav).toHaveCSS('margin-right', '12px');
    await expect(nav).toHaveCSS('margin-bottom', '42px');
    await expect(nav).toHaveCSS('border-bottom-left-radius', '999px');
    await expect(nav).toHaveCSS('border-bottom-right-radius', '999px');
    await expect(nav.getByRole('button', { name: 'Сегодня' })).toHaveCSS('border-radius', '999px');
    const navBox = await nav.boundingBox();
    expect(navBox!.x).toBe(12);
    expect(navBox!.x + navBox!.width).toBe(size.width - 12);
    const button = await nav.getByRole('button', { name: 'Сегодня' }).boundingBox();
    expect(Math.abs((button!.y - navBox!.y) - (navBox!.y + navBox!.height - button!.y - button!.height))).toBeLessThanOrEqual(1);
    expect(button!.y + button!.height).toBeLessThanOrEqual(size.height - 42);
    await page.locator('.page-wrap').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => {
      const box = await nav.boundingBox();
      return Math.abs(box!.y + box!.height - (size.height - 42));
    }).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await nav.getByRole('button', { name: 'Календарь' }).tap();
    await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Сегодня' }).tap();
  }
  await expect(nav.locator('button:not(.active)').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(nav.locator('button.active')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.setViewportSize({ width: 440, height: 956 });
  await page.screenshot({ path: 'test-results/iphone-bottom-nav-dark.png', animations: 'disabled' });
  await profileAction(page, 'Включить светлую тему');
  await expect(nav.locator('button:not(.active)').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(nav.locator('button.active')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'test-results/iphone-bottom-nav.png', animations: 'disabled' });
});

test('экран загрузки имеет ровный чёрный фон и однотонный индикатор', async ({ page }) => {
  let releaseAsset!: () => void;
  const heldAsset = new Promise<void>((resolve) => { releaseAsset = resolve; });
  await page.route('**/good-sm.png', async (route) => {
    await heldAsset;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const loading = page.locator('.loading-screen');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(loading.locator('.loading-bar i')).toHaveCSS('background-image', 'none');
  await expect(loading.locator('.loading-logo')).toHaveCSS('filter', 'none');
  expect(await loading.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none');
  await page.screenshot({ path: 'test-results/loading-black.png', animations: 'disabled' });
  releaseAsset();
});

test('меню не обрезается, когда видимая область iPhone меньше CSS viewport', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 720 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expect(page.locator('.app-shell')).toHaveCSS('height', '720px');
  const nav = page.locator('.bottom-nav');
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  for (const label of await nav.locator('small').all()) {
    const bounds = await label.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  }
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 600 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.app-shell')).toHaveCSS('height', '600px');
  await nav.getByRole('button', { name: 'Календарь' }).tap();
  await expect(page).toHaveURL(/#\/trainer\/calendar$/);
});

for (const role of ['student', 'trainer'] as const) {
  test(`первое касание меню переключает ${role} во время скролла даже без click`, async ({ page }) => {
    await page.setViewportSize({ width: role === 'student' ? 390 : 360, height: 700 });
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (role === 'student') await profileAction(page, 'Переключиться в роль ученика');

    const nav = page.locator('.bottom-nav');
    const target = role === 'student' ? 'Профиль' : 'Ученики';
    await nav.getByRole('button', { name: target }).tap();
    await expect(nav.getByRole('button', { name: target })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Календарь' }).tap();
    await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');

    // Reproduce iOS swallowing the synthesized click while the page is moving.
    await page.evaluate(() => document.addEventListener('click', (event) => {
      if (event.isTrusted && (event.target as Element).closest('.bottom-nav')) event.stopImmediatePropagation();
    }, true));
    await page.locator('.page-wrap').evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }));
    await nav.getByRole('button', { name: target }).tap();
    await expect(nav.getByRole('button', { name: target })).toHaveAttribute('aria-current', 'page');
  });
}
