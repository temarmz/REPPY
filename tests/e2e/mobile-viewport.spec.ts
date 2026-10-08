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

test('standalone правило задаёт полную высоту экрана', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  // Desktop engines cannot emulate an installed iPhone app. Activate the
  // shipped standalone CSS rule itself, rather than copying it into the test.
  expect(await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]);
    const rule = rules.find((rule) => rule instanceof CSSMediaRule && rule.conditionText.includes('standalone')) as CSSMediaRule | undefined;
    if (!rule) return false;
    const fullHeight = [...rule.cssRules].some((child) => child instanceof CSSStyleRule
      && child.selectorText === '.app-shell:not(.focus-mode)' && child.style.height === '100vh');
    rule.media.mediaText = '(max-width: 800px)';
    return fullHeight;
  })).toBe(true);
  await expect.poll(async () => Math.abs(await page.locator('.app-shell').evaluate((element) => element.getBoundingClientRect().height) - 844)).toBeLessThanOrEqual(1);
});
