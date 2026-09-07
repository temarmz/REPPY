import { test, expect, type Page } from '@playwright/test';
import { createInitialState, createWorkoutSession } from '../../app/reppy-data';

async function seedProgress(page: Page, count = 3) {
  const state = createInitialState();
  state.loggedIn = true;
  const assignment = state.assignments.find((item) => item.id === 'assignment-artem-push-today')!;
  state.sessions = Array.from({ length: count }, (_, index) => {
    const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'student');
    const date = new Date();
    date.setDate(date.getDate() - index * 7 - 1);
    session.id = `progress-${index}`;
    session.completedAt = date.toISOString();
    session.comment = 'Контрольный комментарий к тренировке';
    session.mood = 'good';
    session.results[0] = { ...session.results[0], completed: true, actualWeight: 80 - index * 2.5, actualReps: 8 };
    session.results[1] = { ...session.results[1], completed: true, actualWeight: 80 - index * 2.5, actualReps: 7 };
    return session;
  });
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('reppy-demo-v0', JSON.stringify(value)), state);
  await page.goto('/#/trainer/clients/artem');
  await page.reload();
  await expect(page.getByRole('button', { name: /Прогресс по упражнениям/ })).toBeVisible();
}

test('сводка, фильтры, таблица, график и возврат сохраняют контекст ученика', async ({ page }) => {
  await seedProgress(page);
  await page.getByRole('button', { name: /Прогресс по упражнениям/ }).click();
  await expect(page.locator('.progress-overview-row')).toHaveCount(1);
  await page.getByLabel('Поиск упражнения').pressSequentially('ЖиМ');
  await expect(page.getByLabel('Поиск упражнения')).toBeFocused();
  await expect(page.getByLabel('Поиск упражнения')).toHaveValue('ЖиМ');
  await page.locator('.progress-overview-row').click();
  await expect(page.getByLabel('Упражнение', { exact: true })).toContainText('Жим лёжа');
  await expect(page.locator('.progress-history-entry')).toHaveCount(3);
  await expect(page.locator('.progress-history-entry').first()).toContainText('2 из 4');
  await expect(page.locator('.progress-history-entry').first().locator('.progress-sets')).toHaveText(/80 кг × 8 \/ 7 повт.*Выполнено 2 из 4/);
  await expect(page.locator('.progress-history-entry').first().getByText('Факт: Не выполнен').first()).not.toBeVisible();
  await page.locator('.progress-history-entry').first().locator('summary').click();
  await expect(page.getByText('Комментарий к тренировке: Контрольный комментарий к тренировке').first()).toBeVisible();
  await page.getByRole('button', { name: 'График', exact: true }).click();
  const points = page.locator('svg g[role="button"]');
  await expect(points).toHaveCount(3);
  await points.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.progress-selected h3')).toContainText('75 кг');
  await page.getByRole('button', { name: 'Всего повторов', exact: true }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('15 повт.');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Всего повторов', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Таблица', exact: true }).click();
  await page.locator('.progress-date-link').first().click();
  await expect(page).toHaveURL(/trainer\/sessions\/progress-0/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Таблица', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByLabel('Поиск упражнения')).toHaveValue('ЖиМ');
  await page.goto('/#/trainer/clients/maria/progress');
  await expect(page.getByRole('heading', { name: 'Ещё нет результатов' })).toBeVisible();
  await expect(page.locator('.progress-overview-row')).toHaveCount(0);
});

test('поиск, пагинация и мобильный/широкий экран без переполнения', async ({ page }) => {
  await seedProgress(page, 25);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: /Прогресс по упражнениям/ }).click();
  await page.getByLabel('Поиск упражнения').fill('нет такого');
  await expect(page.getByRole('heading', { name: 'Упражнения не найдены' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить поиск' }).click();
  await page.getByRole('button', { name: 'Всё время', exact: true }).click();
  await page.locator('.progress-overview-row').click();
  await expect(page.locator('.progress-history-entry')).toHaveCount(20);
  await expect(page.getByText('25 занятий', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await expect(page.locator('.progress-history-entry')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.progress-history-entry').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/progress-mobile-table.png', fullPage: false, animations: 'disabled' });
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('svg g[role="button"]')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.progress-chart svg').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/progress-mobile-chart.png', fullPage: false, animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Таблица', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/progress-desktop-table.png', fullPage: false, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(page.locator('.progress-history-entry')).toHaveCount(5);
});

test('завершённый подход появляется в прогрессии и доступен из результата', async ({ page }) => {
  await seedProgress(page, 0);
  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить подход 1 — Жим лёжа', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.locator('.result-exercises')).toBeVisible();
  await page.locator('.result-exercises article').first().getByRole('button', { name: 'История упражнения' }).click();
  await expect(page.locator('.progress-history-entry')).toHaveCount(1);
  await expect(page.locator('.progress-history-entry').first()).toContainText('1 из 4');
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.getByText('Для динамики нужно ещё одно занятие.')).toBeVisible();
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
});

test('пустой период и неизвестные прямые ссылки показывают корректное состояние', async ({ page }) => {
  await seedProgress(page, 1);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    const old = new Date();
    old.setFullYear(old.getFullYear() - 1);
    state.sessions[0].completedAt = old.toISOString();
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.goto('/#/trainer/clients/artem/progress/bench-press?loadMode=external&measureType=reps');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'За этот период нет результатов' })).toBeVisible();
  await page.getByRole('button', { name: 'Показать всё время' }).click();
  await expect(page.locator('.progress-history-entry')).toHaveCount(1);
  await page.goto('/#/trainer/clients/artem/progress/bench-press?loadMode=bodyweight');
  await expect(page.getByText('Результаты не найдены.')).toBeVisible();
  await expect(page.locator('.progress-history-entry')).toHaveCount(0);
  await page.goto('/#/trainer/clients/missing/progress');
  await expect(page.getByText('Ученик не найден')).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться к ученикам' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients$/);
});

test('упражнение переключается на месте, сохраняя график, метрику и период', async ({ page }) => {
  await seedProgress(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    for (const session of state.sessions) {
      const secondExercise = session.workoutSnapshot.exercises[1];
      const result = session.results.find((item: { exerciseId: string; setNumber: number }) => item.exerciseId === secondExercise.id && item.setNumber === 1);
      result.completed = true;
    }
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.goto('/#/trainer/clients/artem/progress');
  await page.reload();
  await page.locator('.progress-overview-row').filter({ hasText: 'Жим лёжа' }).click();
  await page.getByRole('button', { name: 'График', exact: true }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
  await page.getByRole('button', { name: 'Предыдущее занятие' }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('77,5 кг');
  await page.getByRole('button', { name: 'Следующее занятие' }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
  await page.getByRole('button', { name: 'Всего повторов', exact: true }).click();
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await page.getByLabel('Упражнение', { exact: true }).selectOption({ label: 'Жим гантелей на наклонной скамье' });
  await expect(page).toHaveURL(/progress\/incline-dumbbell\?/);
  await expect(page.getByRole('button', { name: 'График', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Всего повторов', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '30 дней', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.progress-selected h3')).toContainText('10 повт.');
  await expect(page.locator('.progress-selected .progress-entry-details')).not.toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.locator('.progress-overview-row')).toHaveCount(2);
});
