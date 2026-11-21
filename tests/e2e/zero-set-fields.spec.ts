import { test, expect } from '@playwright/test';
for (const theme of ['dark', 'light']) test(`zero fields and custom exercise ${theme}`, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.goto('/#/trainer/clients/artem/assign/new');
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Создать своё упражнение' }).click();
  await dialog.getByLabel('Название упражнения').fill('Моё упражнение');
  await dialog.getByRole('group', { name: 'Группы мышц упражнения' }).getByRole('button', { name: 'Грудь', exact: true }).click();
  const contrast = await dialog.locator('.custom-muscle-groups .selected').evaluate(button => {
    const style = getComputedStyle(button);
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: `/tmp/reppy-custom-${theme}.png` });
  await dialog.getByRole('button', { name: 'Сохранить и добавить' }).click();
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  const card = page.locator('.plan-exercise-card');
  await expect(card.locator('input').nth(0)).toHaveValue('0');
  await expect(card.locator('input').nth(1)).toHaveValue('0');
  await expect(card.locator('.set-columns')).toContainText('ПОВТОРЫ');
  await card.getByRole('button', { name: /^Добавить подход —/ }).click();
  await expect(card.locator('.set-card')).toHaveCount(2);
  await card.getByRole('button', { name: /^Удалить последний подход —/ }).click();
  await expect(card.locator('.set-card')).toHaveCount(1);
});
