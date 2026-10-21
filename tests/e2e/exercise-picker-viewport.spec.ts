import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    test(`exercise picker stays usable: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      const data = createInitialState();
      data.loggedIn = true;
      await page.addInitScript(({ data, theme }) => {
        localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
        localStorage.setItem('reppy-ui:theme', theme);
      }, { data, theme });
      await page.setViewportSize({ width, height });
      await page.goto('/#/trainer/clients/artem/assign/new');
      await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
      await expect(picker).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('picker-open.png') });
      const list = await picker.locator('.picker-list').boundingBox();
      expect(list!.height).toBeGreaterThanOrEqual(64);
      const filters = picker.locator('.muscle-filter');
      const filterBox = await filters.boundingBox();
      expect(filterBox!.height).toBeGreaterThanOrEqual(width <= 800 ? 44 : 34);
      await filters.getByRole('button', { name: 'Грудь', exact: true }).click();
      await expect(filters.getByRole('button', { name: 'Грудь', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await filters.getByRole('button', { name: 'Все', exact: true }).click();
      const add = picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true });
      await add.click({ timeout: 4000 });
      await expect(picker.getByText('В тренировке: 1', { exact: true })).toBeVisible();
      await picker.getByRole('button', { name: 'Убрать Жим лёжа', exact: true }).click();
      await expect(picker.getByText('В тренировке: 0', { exact: true })).toBeVisible();
      await picker.getByRole('searchbox', { name: 'Поиск упражнений' }).fill('Изолированное упражнение с длинным названием');
      await picker.getByRole('group', { name: 'Группы мышц упражнения' }).getByRole('button', { name: 'Грудь', exact: true }).click();
      await picker.getByRole('button', { name: /^Сохранить и добавить/ }).click();
      await expect(picker.getByText('В тренировке: 1', { exact: true })).toBeVisible();
      const done = picker.getByRole('button', { name: 'Готово', exact: true });
      await done.scrollIntoViewIfNeeded();
      const box = await done.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      await page.screenshot({ path: testInfo.outputPath('picker-selected.png') });
      await done.click();
      await expect(picker).toHaveCount(0);
      await expect(page.locator('.plan-exercise-card:visible')).toHaveCount(1);
    });
  }

  test(`exercise picker survives a reduced visual viewport while searching: ${theme}`, async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
    await page.goto('/#/trainer/clients/artem/assign/new');
    await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
    await picker.getByRole('searchbox', { name: 'Поиск упражнений' }).fill('Жим лёжа');
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 320 });
      Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 40 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
    const done = picker.getByRole('button', { name: 'Готово', exact: true });
    await done.scrollIntoViewIfNeeded();
    const box = await done.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(40);
    expect(box!.y + box!.height).toBeLessThanOrEqual(360);
    await page.screenshot({ path: testInfo.outputPath('picker-reduced.png') });
    await done.click();
    await expect(picker).toHaveCount(0);
  });
}
