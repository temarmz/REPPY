import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) {
  for (const width of [360, 390, 1280]) {
    test(`workout defaults, order and history correction: ${theme} ${width}`, async ({ page }, info) => {
      const data = createInitialState(); data.loggedIn = true;
      await page.addInitScript(({ data, theme }) => {
        localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
        localStorage.setItem('reppy-ui:theme', theme);
      }, { data, theme });
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/#/trainer/clients/artem/assign/new');
      await page.getByLabel('Название тренировки').fill('Нулевая тренировка');
      await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
      await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
      await expect(picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true })).toHaveClass(/selected/);
      await picker.getByRole('button', { name: 'Добавить Планка', exact: true }).click();
      await picker.getByRole('button', { name: 'Готово', exact: true }).click();
      await expect(page.locator('.plan-set-card:visible')).toHaveCount(2);
      await page.getByRole('button', { name: 'Порядок упражнений', exact: true }).first().click();
      const order = page.getByRole('dialog', { name: 'Порядок упражнений' });
      await order.getByRole('button', { name: 'Переместить Жим лёжа', exact: true }).press('ArrowDown');
      await expect(order.locator('.exercise-order-row').first()).toContainText('Планка');
      await page.screenshot({ path: info.outputPath('order.png') });
      await order.getByRole('button', { name: 'Готово' }).click();
      await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!));
      expect(saved.assignments.at(-1).workoutSnapshot.exercises.every((e: { plannedSets: unknown[] }) => JSON.stringify(e.plannedSets) === JSON.stringify([{ targetReps: 0, targetWeight: 0 }]))).toBe(true);
      const session = data.sessions.find((s) => s.completedAt)!;
      await page.goto(`/#/trainer/sessions/${session.id}`);
      await page.getByRole('button', { name: 'Исправить результат', exact: true }).click();
      await page.getByLabel('Название тренировки').fill('Исправленная история');
      const weight = page.locator('.active-exercise-card:visible').first().getByLabel('КГ').first();
      await weight.fill('42.5'); await weight.blur();
      await page.getByRole('button', { name: 'Сохранить исправления', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'ИСПРАВЛЕННАЯ ИСТОРИЯ', exact: true })).toBeVisible();
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!));
      expect(after.subscriptionEntries).toEqual(saved.subscriptionEntries);
      expect(after.sessions.find((s: { id: string }) => s.id === session.id).completedAt).toBe(session.completedAt);
      await page.screenshot({ path: info.outputPath('corrected.png') });
    });
  }
}

test('student can filter progress and finish with feedback in one sheet', async ({ page }, info) => {
  const data = createInitialState(); data.loggedIn = true; data.role = 'student';
  await page.addInitScript(data => localStorage.setItem('reppy-demo-v0', JSON.stringify(data)), data);
  await page.goto('/#/student');
  await page.getByRole('searchbox', { name: 'Поиск в прогрессе' }).fill('zzzzzzz');
  await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Поиск в прогрессе' }).fill('Жим');
  await expect(page.locator('.progress-card-list:visible')).toContainText('Жим');
  await page.getByRole('button', { name: 'Посмотреть тренировку', exact: true }).first().click();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  const finish = page.getByRole('dialog', { name: 'Завершение тренировки' });
  await expect(finish.getByRole('img', { name: 'Динозавр показывает большой палец' })).toBeVisible();
  await finish.getByLabel('Как прошла тренировка?', { exact: true }).selectOption('good');
  await finish.getByLabel('Комментарий о тренировке').fill('Всё получилось');
  await page.screenshot({ path: info.outputPath('finish.png') });
  await finish.getByRole('button', { name: 'Подтвердить завершение' }).click();
  await expect(page).toHaveURL(/\/success\//);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!));
  expect(saved.sessions.at(-1).mood).toBe('good');
  expect(saved.sessions.at(-1).comment).toBe('Всё получилось');
});
