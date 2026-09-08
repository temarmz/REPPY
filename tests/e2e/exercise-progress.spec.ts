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
  await expect(page.getByRole('region', { name: 'Прогресс по упражнениям' })).toBeVisible();
}

const progressSection = (page: Page) => page.getByRole('region', { name: 'Прогресс по упражнениям' });

test('прогресс встроен внизу профиля, упражнение открывается одним нажатием', async ({ page }) => {
  await seedProgress(page, 25);
  const section = progressSection(page);
  await expect(section.locator('.workout-row')).toHaveCount(1);
  expect(await section.evaluate((element) => element === element.parentElement?.lastElementChild)).toBe(true);
  await expect(section).toContainText('Было: 77,5 кг × 8 повт.');
  await expect(section).toContainText('Стало: 80 кг × 8 повт.');
  await expect(section).toContainText('+2,5 кг при тех же повторах');
  const backStyle = await page.locator('.back-button').evaluate((element) => {
    const css = getComputedStyle(element);
    return [css.backgroundColor, css.color, css.borderRadius, css.minHeight];
  });
  await section.getByRole('button', { name: /Жим лёжа/ }).click();
  await expect(page.locator('svg g[role="button"]')).toHaveCount(25);
  await expect(page.getByText('Всё время · 25 занятий')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Таблица|График|30 дней|90 дней|Всего повторов/ })).toHaveCount(0);
  expect(await page.locator('.back-button').evaluate((element) => {
    const css = getComputedStyle(element);
    return [css.backgroundColor, css.color, css.borderRadius, css.minHeight];
  })).toEqual(backStyle);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
  await expect(section).toBeVisible();
});

test('график, клавиатура, соседние занятия и полная тренировка', async ({ page }) => {
  await seedProgress(page);
  await progressSection(page).getByRole('button', { name: /Жим лёжа/ }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
  await page.getByRole('button', { name: 'Предыдущее занятие' }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('77,5 кг');
  await page.getByRole('button', { name: 'Следующее занятие' }).click();
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
  await page.locator('svg g[role="button"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.progress-selected h3')).toContainText('75 кг');
  await page.getByRole('button', { name: 'Открыть тренировку' }).click();
  await expect(page).toHaveURL(/sessions\/progress-2$/);
  await expect(page.getByText('Контрольный комментарий к тренировке')).toBeVisible();
  await page.locator('.result-exercises article').first().getByRole('button', { name: 'Прогресс упражнения' }).click();
  await expect(page.locator('.progress-chart')).toBeVisible();
});

test('история доступна перед тренировкой только для упражнений с результатами', async ({ page }) => {
  await seedProgress(page);
  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.getByRole('button', { name: 'Прогресс упражнения' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Прогресс упражнения' }).click();
  await expect(page.locator('svg g[role="button"]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/assignments\/assignment-artem-push-today$/);
});

test('старые ссылки показывают всю историю, чужие и отсутствующие результаты не попадают в график', async ({ page }) => {
  await seedProgress(page, 25);
  await page.goto('/#/trainer/clients/artem/progress/bench-press?loadMode=external&measureType=reps&view=table&metric=sum&period=30&q=missing');
  await page.reload();
  await expect(page.locator('svg g[role="button"]')).toHaveCount(25);
  await expect(page.locator('.progress-selected h3')).toContainText('80 кг');
  await page.goto('/#/trainer/clients/maria');
  await expect(progressSection(page).locator('.workout-row')).toHaveCount(0);
  await expect(progressSection(page)).toContainText('Здесь появятся результаты');
  await page.goto('/#/trainer/clients/artem/progress/bench-press?loadMode=bodyweight');
  await expect(page.getByText('Результаты не найдены.')).toBeVisible();
  await expect(page.locator('svg')).toHaveCount(0);
  await page.goto('/#/trainer/clients/artem/progress');
  await expect(progressSection(page).locator('.workout-row')).toHaveCount(1);
});

test('результат нового занятия появляется в профиле и на графике', async ({ page }) => {
  await seedProgress(page, 0);
  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.getByRole('button', { name: 'Прогресс упражнения' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить подход 1 — Жим лёжа', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.goto('/#/trainer/clients/artem');
  await expect(progressSection(page)).not.toContainText('Первый результат');
  await expect(progressSection(page).locator('.progress-trend')).toHaveCount(0);
  await progressSection(page).getByRole('button', { name: /Жим лёжа/ }).click();
  await expect(page.locator('svg g[role="button"]')).toHaveCount(1);
  await expect(page.getByText('Для динамики нужно ещё одно занятие.')).toBeVisible();
  await expect(page.locator('.progress-selected')).toContainText('Выполнено 1 из 4');
});

test('мобильный и широкий экран используют общие контролы без переполнения', async ({ page }) => {
  await seedProgress(page, 25);
  await page.setViewportSize({ width: 360, height: 800 });
  await progressSection(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/progress-profile-mobile.png', animations: 'disabled' });
  await progressSection(page).getByRole('button', { name: /Жим лёжа/ }).click();
  await expect(page.locator('.progress-chart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/progress-mobile-chart.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/progress-desktop-chart.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('данные ученика под именем редактируются карандашом и сохраняются', async ({ page }) => {
  await seedProgress(page);
  await page.setViewportSize({ width: 360, height: 800 });
  const intro = page.locator('.student-profile-intro');
  await expect(intro.getByRole('button', { name: 'Редактировать данные ученика' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Данные и ограничения' })).toHaveCount(0);
  await intro.getByRole('button', { name: 'Редактировать данные ученика' }).click();
  await page.getByLabel('Рост, см').fill('181');
  await page.getByLabel('Вес, кг').fill('82.5');
  await page.getByLabel('Противопоказания и особенности', { exact: false }).fill('Беречь левое колено');
  await page.getByRole('button', { name: 'Сохранить данные' }).click();
  await expect(intro).toContainText('181 см · 82.5 кг');
  await expect(intro).toContainText('Ограничения: Беречь левое колено');
  await intro.getByRole('button', { name: 'Редактировать данные ученика' }).click();
  await page.getByLabel('Рост, см').fill('199');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await intro.getByRole('button', { name: 'Редактировать данные ученика' }).click();
  await expect(page.getByLabel('Рост, см')).toHaveValue('181');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.reload();
  await expect(intro).toContainText('Ограничения: Беречь левое колено');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/student-profile-intro.png', animations: 'disabled' });
});

test('при смене веса формат каждого подхода остаётся одинаковым', async ({ page }) => {
  await seedProgress(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    state.sessions[0].results[1].actualWeight = 82.5;
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.reload();
  const section = progressSection(page);
  await expect(section).toContainText('Стало: 82,5 кг × 7 повт.');
  await expect(section).toContainText('+5 кг, −1 повт.');
  await section.getByRole('button', { name: /Жим лёжа/ }).click();
  await expect(page.locator('.progress-selected .progress-set')).toHaveText(['1. 80 кг × 8 повт.', '2. 82,5 кг × 7 повт.']);
});

test('цвет текста различает динамику без дополнительных стрелок', async ({ page }) => {
  await seedProgress(page);
  const section = progressSection(page);
  await expect(section.locator('.progress-trend')).toHaveCount(0);
  await expect(section.locator('.progress-comparison-change')).toHaveCSS('color', 'rgb(198, 255, 61)');
  await expect(section).not.toContainText('Лучшие подходы');
  for (const scenario of [
    { weight: 77.5, reps: 8, trend: 'Без изменений', color: 'rgb(151, 157, 149)' },
    { weight: 70, reps: 6, trend: 'Спад', color: 'rgb(255, 106, 53)' },
    { weight: 85, reps: 5, trend: 'Смешанная динамика', color: 'rgb(151, 157, 149)' },
  ]) {
    await page.evaluate(({ weight, reps }) => {
      const state = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
      state.sessions[0].results[0].actualWeight = weight;
      state.sessions[0].results[0].actualReps = reps;
      state.sessions[0].results[1].actualWeight = weight;
      state.sessions[0].results[1].actualReps = reps - 1;
      localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
    }, scenario);
    await page.reload();
    await expect(section.locator('.progress-trend')).toHaveCount(0);
    await expect(section.locator('.progress-comparison-change')).toHaveCSS('color', scenario.color);
  }
});
