import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  test(`профиль и контраст подходов: ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    await page.getByRole('navigation', { name: 'Основная навигация' }).last().getByRole('button', { name: 'Профиль' }).click();
    await expect(page).toHaveURL(/#\/trainer\/profile$/);
    await expect(page.getByRole('button', { name: 'Переключиться в роль ученика' })).toBeVisible();
    if (theme === 'light') await profileAction(page, 'Включить светлую тему');
    await profileAction(page, 'Переключиться в роль ученика');
    await expect(page).toHaveURL(/#\/student$/);
    await page.getByRole('navigation', { name: 'Основная навигация' }).last().getByRole('button', { name: 'Профиль' }).click();
    const edit = page.getByRole('button', { name: 'Редактировать', exact: true });
    await edit.click();
    const phone = page.getByLabel('Мобильный телефон');
    const previousPhone = await phone.inputValue();
    await phone.fill('+7 123 456 78 90');
    await page.getByRole('button', { name: 'Отмена' }).click();
    await edit.click();
    await expect(phone).toHaveValue(previousPhone);

    await page.goto('/#/student/assignments/assignment-artem-push-today');
    const setLabel = page.getByText('Подход 1').first();
    await expect(setLabel).toBeVisible();
    const contrast = await setLabel.evaluate((element) => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value: string) => rgb(value).map((channel) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = luminance(getComputedStyle(element).color);
      const background = luminance(getComputedStyle(element.closest('.readonly-exercise-card')!).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
}
