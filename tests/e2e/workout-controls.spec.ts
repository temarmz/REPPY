import { expect, test } from '@playwright/test';
import { createInitialState } from '../../app/reppy-data';

for (const theme of ['dark', 'light']) for (const width of [360, 390, 1280]) {
  test(`shared exercise controls and replacement ${theme} ${width}`, async ({ page }, info) => {
    const data = createInitialState(); data.loggedIn = true;
    await page.addInitScript(({ data, theme }) => {
      localStorage.setItem('reppy-demo-v0', JSON.stringify(data)); localStorage.setItem('reppy-ui:theme', theme);
    }, { data, theme });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/trainer/workout/assignment-artem-push-today');
    await expect(page.getByRole('button', { name: 'Порядок упражнений', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-active-exercise] .exercise-reorder-button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
    await picker.getByRole('button', { name: 'Добавить Планка', exact: true }).click();
    await expect(picker.locator('.picker-exercise-row').filter({ hasText: /^Планка/ })).toHaveClass(/added/);
    await page.screenshot({ path: info.outputPath('picker.png') });
    await picker.getByRole('button', { name: 'Готово', exact: true }).click();
    const card = page.locator('[data-active-exercise]').first();
    const original = await card.getAttribute('data-active-exercise');
    const values = await card.locator('.set-card input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
    await card.getByRole('button', { name: /^Действия —/ }).click();
    await page.getByRole('button', { name: /Заменить упражнение/ }).click();
    const replacement = page.getByRole('dialog', { name: 'Заменить упражнение' });
    await replacement.getByRole('searchbox', { name: 'Поиск упражнений' }).fill('Жим гантелей сидя');
    await replacement.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-active-exercise', original!);
    await expect(card).toContainText('Жим гантелей сидя');
    expect(await card.locator('.set-card input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(values);
    await page.getByRole('button', { name: 'Порядок упражнений', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Порядок упражнений' })).toBeVisible();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    const saved = data.sessions.find(session => session.completedAt)!;
    await page.goto(`/#/trainer/sessions/${saved.id}`);
    const feedback = page.locator('.section-actions');
    const exercises = page.locator('.result-exercises');
    const actions = page.locator('.session-result-actions');
    await expect(feedback).toBeVisible();
    expect((await actions.boundingBox())!.y - ((await feedback.boundingBox())!.y + (await feedback.boundingBox())!.height)).toBeGreaterThanOrEqual(20);
    expect((await exercises.boundingBox())!.y - ((await actions.boundingBox())!.y + (await actions.boundingBox())!.height)).toBeGreaterThanOrEqual(20);
  });
}
