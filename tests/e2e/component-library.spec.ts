import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  test(`общая библиотека обновляет настоящие экраны и дизайн-кит: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
    await page.evaluate(() => { location.hash = '/trainer/design-kit'; });
    await expect(page.getByRole('heading', { name: 'ДИЗАЙН-КИТ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Маленькая', exact: true })).toHaveCSS('min-height', '44px');
    await expect(page.getByRole('button', { name: 'Средняя', exact: true })).toHaveCSS('min-height', '48px');
    await expect(page.getByRole('button', { name: 'Большая', exact: true })).toHaveCSS('min-height', '56px');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--button-font-size', '18px');
      document.documentElement.style.setProperty('--control-height-small', '48px');
      document.documentElement.style.setProperty('--control-radius', '10px');
    });
    await expect(page.getByRole('button', { name: 'Основное действие' })).toHaveCSS('font-size', '18px');
    const small = page.getByRole('button', { name: 'Маленькая', exact: true });
    await expect(small).toHaveCSS('min-height', '48px');
    await expect(small).toHaveCSS('border-radius', '10px');
    const toggle = page.getByRole('switch', { name: 'Переключатель' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Выбор значения').selectOption('in-person');
    await expect(page.getByLabel('Выбор значения')).toHaveValue('in-person');
    await expect(page.getByLabel('Недоступное поле')).toBeDisabled();
    await expect(page.getByLabel('Ошибка заполнения')).toHaveAttribute('aria-invalid', 'true');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.evaluate(() => { location.hash = '/trainer/calendar'; });
    await expect(page.locator('.calendar-grid button').first()).toHaveCSS('font-size', '18px');
    expect(await page.locator('#root button:not([data-ui-control]), #root input:not([data-ui-control]), #root select:not([data-ui-control]), #root textarea:not([data-ui-control])').count()).toBe(0);
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`масштабы меняют разные семейства UI централизованно: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
    await page.evaluate(() => { location.hash = '/trainer/design-kit'; });
    const name = page.getByLabel('Название тренировки');
    const nameHeight = (await name.boundingBox())!.height;
    const exercise = page.locator('.readonly-exercise-card').first();
    const oldRadius = await exercise.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius));
    const icon = page.getByRole('button', { name: 'Основное действие' }).locator('.ui-icon');
    const oldIconWidth = (await icon.boundingBox())!.width;
    await page.getByRole('heading', { name: 'Карточки, списки и навигация' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/component-library-patterns-${theme}.png`, animations: 'disabled' });
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--ui-font-scale', '1.1');
      root.style.setProperty('--ui-radius-scale', '1.25');
      root.style.setProperty('--ui-control-height-scale', '1.25');
      root.style.setProperty('--ui-icon-scale', '1.25');
    });
    expect((await name.boundingBox())!.height).toBeCloseTo(nameHeight * 1.25, 0);
    expect(await exercise.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))).toBeCloseTo(oldRadius * 1.25, 0);
    expect((await icon.boundingBox())!.width).toBeCloseTo(oldIconWidth * 1.25, 0);
    await expect(page.getByRole('button', { name: 'Основное действие' })).toHaveCSS('font-size', '15.4px');
    await expect(page.getByRole('progressbar', { name: 'Пример прогресса' })).toHaveAttribute('aria-valuenow', '65');
    await expect(page.getByRole('heading', { name: 'Состав библиотеки' })).toBeVisible();
    expect(await page.locator('.ui-component-inventory > span').count()).toBeGreaterThan(60);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.evaluate(() => { location.hash = '/trainer'; });
    await expect(page.getByRole('switch', { name: 'Все дни' })).toHaveCSS('min-height', '55px');
    await expect(page.locator('.bottom-nav button').first()).toHaveCSS('font-size', '15.4px');
    await expect(page.locator('.plan-day-card').first()).toHaveCSS('border-radius', '25px');
    expect(await page.locator('main:not([data-ui-element]), section:not([data-ui-element]), article:not([data-ui-element]), h1:not([data-ui-element]), h2:not([data-ui-element])').count()).toBe(0);
  });
}
