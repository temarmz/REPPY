import { expect, test } from '@playwright/test';

for (const role of ['trainer', 'student']) for (const theme of ['dark', 'light']) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`navigation fits without overlapping labels: ${role}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(theme => localStorage.setItem('reppy-ui:theme', theme), theme);
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      await page.goto(`/#/${role}`);
      const nav = page.locator(width > 800 ? '.desktop-nav' : '.bottom-nav');
      await expect(nav).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('navigation.png'), animations: 'disabled' });
      if (width <= 800) {
        expect(await nav.evaluate(nav => {
          const bounds = nav.getBoundingClientRect();
          return Array.from(nav.querySelectorAll('button')).every(button => {
            const rect = button.getBoundingClientRect();
            const label = button.querySelector('small')!.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 48 && rect.left >= bounds.left && rect.right <= bounds.right
              && label.left >= rect.left && label.right <= rect.right
              && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
          });
        })).toBe(true);
      }
      for (const name of ['Календарь', 'Заметки', 'Главная']) {
        const button = nav.getByRole('button', { name, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-current', 'page');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
