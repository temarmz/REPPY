import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  for (const width of [360, 390, 1280]) {
    test(`invalid plan stays a local draft until fixed: ${theme}, ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      await page.evaluate(theme => localStorage.setItem('reppy-ui:theme', theme), theme);
      await page.goto('/#/trainer/clients/maria/assign/new');
      await page.reload();
      await page.getByLabel('Название тренировки').fill('Проверка назначения');
      await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
      await picker.getByRole('button', { name: 'Добавить Планка', exact: true }).click();
      await picker.getByRole('button', { name: 'Готово', exact: true }).click();
      await page.locator('.plan-exercise-card:visible').getByRole('button', { name: 'Добавить подход', exact: false }).click();
      const reps = page.locator('.plan-exercise-card:visible').getByLabel('СЕКУНДЫ').first();
      await reps.fill('');
      await reps.blur();
      const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.filter((a: { workoutSnapshot: { name: string } }) => a.workoutSnapshot.name === 'Проверка назначения').length);
      expect(await count()).toBe(0);
      await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
      await expect(page.getByText('Проверь подходы: количество должно быть больше нуля, вес — неотрицательным.', { exact: true })).toBeVisible();
      expect(await count()).toBe(0);
      await page.reload();
      await expect(page.getByLabel('Название тренировки')).toHaveValue('Проверка назначения');
      await expect(reps).toHaveValue('');
      await reps.fill('30');
      await reps.blur();
      await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
      await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
      await expect.poll(count).toBe(1);
    });
  }
}
