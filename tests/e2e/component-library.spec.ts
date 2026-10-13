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
    await expect(page.getByRole('button', { name: 'Средняя', exact: true })).toHaveCSS('min-height', '52px');
    await expect(page.getByRole('button', { name: 'Большая', exact: true })).toHaveCSS('min-height', '60px');
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
    expect(await page.locator('button:not([data-ui-control]), input:not([data-ui-control]), select:not([data-ui-control]), textarea:not([data-ui-control])').count()).toBe(0);
  });
}
