import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) {
  for (const width of [320, 390, 440, 844, 1280]) {
    test(`PageHeader keeps long content readable: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      const data = createInitialState();
      data.loggedIn = true;
      const name = 'Оченьдлинноеимяученика'.repeat(5);
      data.students.push({ id: 'qa-long', name, status: 'active', color: 'lime' });
      await page.addInitScript(({ data, theme }) => {
        localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
        localStorage.setItem('reppy-ui:theme', theme);
      }, { data, theme });
      await page.setViewportSize({ width, height: width === 844 ? 320 : 844 });
      await page.goto('/#/trainer/clients/qa-long');
      const heading = page.locator('main h1').first();
      await expect(heading).toHaveText(name.toUpperCase());
      const metrics = await heading.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { right: box.right, left: box.left, width: innerWidth,
          overflow: element.scrollWidth - element.clientWidth,
          documentOverflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(metrics.width);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath('long-profile-title.png') });
      await page.getByRole('button', { name: 'Редактировать данные ученика', exact: true }).click();
      await expect(page.getByLabel('Рост, см')).toBeVisible();
    });
  }
}
