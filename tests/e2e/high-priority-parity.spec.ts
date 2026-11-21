import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['light', 'dark']) for (const width of [360, 390, 1280]) {
  test(`custom definition draft, equipment and instance modes ${theme} ${width}`, async ({ page }, info) => {
    const data = createInitialState(); data.loggedIn = true;
    await page.addInitScript(({ data, theme }) => {
      if (!localStorage.getItem('reppy-demo-v0')) localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
      localStorage.setItem('reppy-ui:theme', theme);
    }, { data, theme });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/trainer/clients/artem/assign/new');
    await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Создать своё упражнение', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Новое упражнение' });
    await form.getByLabel('Название упражнения', { exact: true }).fill('Тяга полотенца для проверки');
    await form.getByLabel('Оборудование', { exact: true }).fill('Полотенце');
    const save = form.getByRole('button', { name: /^Сохранить и добавить/ });
    await expect(save).toBeDisabled();
    await form.getByRole('group', { name: 'Группы мышц упражнения' }).getByRole('button', { name: 'Спина', exact: true }).click();
    await form.getByRole('combobox', { name: 'Измерение', exact: true }).selectOption('duration');
    await expect(form.getByRole('combobox', { name: 'Нагрузка', exact: true })).toHaveValue('external');
    await page.reload();
    await expect(form.getByLabel('Название упражнения', { exact: true })).toHaveValue('Тяга полотенца для проверки');
    await expect(form.getByLabel('Оборудование', { exact: true })).toHaveValue('Полотенце');
    await expect(form.getByRole('combobox', { name: 'Измерение', exact: true })).toHaveValue('duration');
    await page.screenshot({ path: info.outputPath('custom-draft-restored.png') });
    await save.click();
    await dialog.getByRole('button', { name: 'Редактировать Тяга полотенца для проверки', exact: true }).click();
    const editForm = page.getByRole('dialog', { name: 'Редактирование упражнения' });
    await expect(editForm.getByLabel('Оборудование', { exact: true })).toHaveValue('Полотенце');
    await editForm.getByLabel('Название упражнения', { exact: true }).fill('');
    await page.reload();
    await expect(editForm.getByLabel('Название упражнения', { exact: true })).toHaveValue('');
    await expect(editForm.getByLabel('Оборудование', { exact: true })).toHaveValue('Полотенце');
    await editForm.getByLabel('Название упражнения', { exact: true }).fill('Тяга полотенца для проверки');
    await editForm.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
    const card = page.locator('[data-plan-exercise]').first();
    await card.getByLabel('Нагрузка', { exact: true }).selectOption('bodyweight');
    await expect(card.locator('.set-card input')).toHaveCount(1);
    await card.getByLabel('Нагрузка', { exact: true }).selectOption('external');
    await card.getByLabel('Измерение', { exact: true }).selectOption('reps');
    await expect(card.locator('.set-card input')).toHaveCount(2);
    await expect(card.locator('.set-card input').first()).toHaveValue('0');
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('instance-modes.png') });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).customExercises);
    const definition = stored.find((item: { name: string }) => item.name === 'Тяга полотенца для проверки');
    expect(definition.equipment).toBe('Полотенце');
    expect(definition.measureType).toBe('duration');
    expect(definition.loadMode).toBe('external');
  });
}

for (const role of ['trainer', 'student'] as const) for (const theme of ['light', 'dark']) {
  test(`active exercise modes and nullable feedback ${role} ${theme}`, async ({ page }) => {
    const data = createInitialState(); data.loggedIn = true; data.role = role;
    await page.addInitScript(({ data, theme }) => {
      if (!localStorage.getItem('reppy-demo-v0')) localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
      localStorage.setItem('reppy-ui:theme', theme);
    }, { data, theme });
    await page.goto(`/#/${role}/workout/assignment-artem-push-today`);
    const card = page.locator('[data-active-exercise]').first();
    await card.getByRole('button', { name: /^Действия —/ }).click();
    const actions = page.getByRole('dialog');
    await actions.getByLabel('Нагрузка', { exact: true }).selectOption('bodyweight');
    await expect(actions.getByLabel('Измерение', { exact: true })).toBeDisabled();
    await actions.getByRole('button', { name: 'Закрыть действия', exact: true }).click();
    const amounts = card.locator('.set-card input[inputmode="numeric"]');
    await amounts.first().fill('2.5');
    await expect(amounts.first()).toHaveAttribute('aria-invalid', 'true');
    for (const amount of await amounts.all()) await amount.fill('0');
    await card.getByRole('button', { name: /^Действия —/ }).click();
    await actions.getByLabel('Измерение', { exact: true }).selectOption('duration');
    await actions.getByRole('button', { name: 'Закрыть действия', exact: true }).click();
    await expect(card.locator('.set-card').first().locator('input')).toHaveCount(1);
    await expect(card.locator('.set-columns')).toContainText('СЕК.');
    const session = data.sessions.find(item => item.completedAt)!;
    await page.goto(`/#/${role === 'trainer' ? 'trainer/sessions' : 'student/calendar/sessions'}/${session.id}`);
    await page.getByRole('button', { name: 'Изменить отзыв', exact: true }).click();
    const feedback = page.getByRole('dialog');
    await feedback.getByRole('combobox').selectOption('');
    await feedback.getByLabel('Комментарий о тренировке').fill('Комментарий без оценки');
    await feedback.getByRole('button', { name: 'Сохранить отзыв', exact: true }).click();
    await expect(page.locator('.session-feedback')).toContainText('Комментарий без оценки');
    await expect(page.locator('.session-feedback strong')).toHaveCount(0);
  });
}

test('trainer manages custom exercises from the library and edits the student name', async ({ page }) => {
  const data = createInitialState();
  data.loggedIn = true;
  await page.addInitScript((state) => {
    if (!localStorage.getItem('reppy-demo-v0')) localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  }, data);
  await page.goto('/#/trainer/profile');
  await page.getByRole('button', { name: 'Библиотека упражнений' }).click();
  const search = page.getByRole('searchbox', { name: 'Поиск упражнений' });
  await search.fill('гантели');
  await expect(page.locator('.picker-exercise-row').first()).toContainText(/гантел/i);
  await search.clear();
  await page.getByRole('button', { name: 'Создать своё упражнение' }).click();
  await page.getByLabel('Название упражнения').fill('Локальная тяга для библиотеки');
  await page.getByRole('button', { name: 'Спина', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить упражнение', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать Локальная тяга для библиотеки' }).click();
  await expect(page.getByLabel('Название упражнения')).toHaveValue('Локальная тяга для библиотеки');
  await page.goto('/#/trainer/clients/artem');
  await page.getByRole('button', { name: 'Редактировать данные ученика' }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Артем Проверочный');
  await page.getByRole('button', { name: 'Сохранить данные' }).click();
  await expect(page.getByRole('heading', { name: 'АРТЕМ ПРОВЕРОЧНЫЙ', exact: true })).toBeVisible();
});
