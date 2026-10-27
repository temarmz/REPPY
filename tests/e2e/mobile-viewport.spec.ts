import { expect, test } from '@playwright/test';

test('меню доходит до края экрана, safe-area находится внутри и скролл его не сдвигает', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
  // Desktop browser engines do not expose the hardware home-indicator inset.
  // Exercise the actual CSS padding path with iPhone's usual 34px safe area.
  await page.addStyleTag({ content: ':root { --app-safe-bottom: 34px; }' });
  const nav = page.locator('.bottom-nav');
  for (const size of [{ width: 440, height: 956 }, { width: 390, height: 700 }, { width: 740, height: 390 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => {
      const box = await nav.boundingBox();
      return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - size.height);
    }).toBeLessThanOrEqual(1);
    await expect(nav).toHaveCSS('padding-bottom', '34px');
    const button = await nav.getByRole('button', { name: 'Сегодня' }).boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(size.height - 34);
    await page.locator('.page-wrap').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => {
      const box = await nav.boundingBox();
      return Math.abs(box!.y + box!.height - size.height);
    }).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await nav.getByRole('button', { name: 'Календарь' }).tap();
    await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Сегодня' }).tap();
  }
  await page.setViewportSize({ width: 440, height: 956 });
  await page.screenshot({ path: 'test-results/iphone-bottom-nav.png', animations: 'disabled' });
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
    if (role === 'student') await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();

    const nav = page.locator('.bottom-nav');
    const target = role === 'student' ? 'Профиль' : 'Ученики';
    await nav.getByRole('button', { name: target }).tap();
    await expect(nav.getByRole('button', { name: target })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Календарь' }).tap();
    await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');

    // Reproduce iOS swallowing the synthesized click while the page is moving.
    await page.evaluate(() => document.addEventListener('click', (event) => {
      if ((event.target as Element).closest('.bottom-nav')) event.stopImmediatePropagation();
    }, true));
    await page.locator('.page-wrap').evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }));
    await nav.getByRole('button', { name: target }).tap();
    await expect(nav.getByRole('button', { name: target })).toHaveAttribute('aria-current', 'page');
  });
}
