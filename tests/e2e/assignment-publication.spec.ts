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
      await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
      await picker.getByRole('button', { name: 'Готово', exact: true }).click();
      await page.locator('.plan-exercise-card:visible').getByRole('button', { name: 'Добавить подход', exact: false }).click();
      const card = page.locator('.plan-exercise-card:visible');
      const reps = card.getByLabel('ПОВТОРЫ').first();
      const weight = card.getByLabel('КГ').first();
      await reps.fill('1.5');
      await expect(reps).toHaveAttribute('aria-invalid', 'true');
      await reps.blur();
      await expect(reps).toHaveValue('0');
      await weight.fill('20');
      await weight.blur();
      const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.filter((a: { workoutSnapshot: { name: string } }) => a.workoutSnapshot.name === 'Проверка назначения').length);
      expect(await count()).toBe(0);
      await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
      await expect(page.getByText('Проверь подходы: количество и вес должны быть неотрицательными; пустой подход — 0 × 0.', { exact: true })).toBeVisible();
      expect(await count()).toBe(0);
      await page.reload();
      await expect(page.getByLabel('Название тренировки')).toHaveValue('Проверка назначения');
      await expect(reps).toHaveValue('0');
      await expect(weight).toHaveValue('20');
      await reps.fill('30');
      await reps.blur();
      await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
      await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
      await expect.poll(count).toBe(1);
    });
  }
}
