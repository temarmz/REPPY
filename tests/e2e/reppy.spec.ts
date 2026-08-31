import { expect, test, type Page } from '@playwright/test';

async function openFreshDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expect(page).toHaveURL(/#\/trainer$/);
}

async function setFirstExerciseWeight(page: Page, weight: number) {
  const input = page.locator('.exercise-editor').first().getByLabel('Вес, кг');
  await input.fill(String(weight));
  await input.press('Enter');
}

test('тренер создаёт независимые шаблоны из копии и назначения', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/workouts/push-day');
  await page.getByRole('button', { name: 'Дублировать' }).click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Грудь и плечи — копия');
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();

  await page.goto('/#/trainer/workouts');
  await expect(page.getByRole('heading', { name: 'Грудь и плечи — копия', exact: true })).toBeVisible();

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await page.getByRole('button', { name: 'Создать шаблон из назначения' }).click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Грудь и плечи · Артем А.');
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();

  await page.goto('/#/trainer/workouts');
  await expect(page.getByRole('heading', { name: 'Грудь и плечи · Артем А.', exact: true })).toBeVisible();
});

test('редактирование шаблона не меняет существующее назначение', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('4 × 8 · 80 кг');

  await page.goto('/#/trainer/workouts/push-day/edit');
  await setFirstExerciseWeight(page, 95);
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();

  await page.goto('/#/trainer/workouts/push-day');
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('4 × 8 · 95 кг');

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('4 × 8 · 80 кг');
});

test('персональная версия предлагается для следующего назначения', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  await setFirstExerciseWeight(page, 85);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Назначение и версия ученика сохранены');

  await page.goto('/#/trainer/workouts/push-day/assign');
  await expect(page.getByText('Для Артем А. есть сохранённая версия')).toBeVisible();
  await expect(page.getByText('По умолчанию назначаем персональные упражнения и нагрузки.')).toBeVisible();
});

test('результат ученика виден тренеру и не меняется вместе с шаблоном', async ({ page }) => {
  await openFreshDemo(page);

  await page.getByRole('button', { name: /DEMO.*Тренер.*Ученик/ }).first().click();
  await expect(page).toHaveURL(/#\/student$/);
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Жим лёжа' })).toBeVisible();

  await page.getByRole('button', { name: 'Следующее упражнение' }).click();
  await page.getByRole('button', { name: 'Следующее упражнение' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();

  await expect(page.getByRole('heading', { name: 'КАК ПРОШЛО?' })).toBeVisible();
  await page.getByRole('button', { name: /Хорошо.*Рабочий темп/ }).click();
  await page.getByLabel(/Комментарий тренеру/).fill('Тестовый результат ученика');
  await page.getByRole('button', { name: 'Сохранить результат' }).click();
  await expect(page.getByRole('heading')).toHaveText(/ТРЕНИРОВКА\s*ЗАВЕРШЕНА/);

  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: /DEMO.*Ученик.*Тренер/ }).first().click();

  await page.goto('/#/trainer/workouts/push-day/edit');
  await setFirstExerciseWeight(page, 95);
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();

  await page.goto('/#/trainer/clients/artem');
  const result = page.locator('.session-row').first();
  await expect(result).toContainText('Грудь и плечи');
  await expect(result).toContainText('Хорошо');
  await result.click();

  await expect(page.getByText('Тестовый результат ученика')).toBeVisible();
  await expect(page.locator('.result-exercises article').first()).toContainText('80 кг × 8');
});
test('старое сохранённое состояние автоматически обновляется при загрузке', async ({ page }) => {
  await openFreshDemo(page);

  await page.evaluate(() => {
    const raw = window.localStorage.getItem('reppy-demo-v0');
    if (!raw) throw new Error('Демо-состояние не было сохранено');
    const legacy = JSON.parse(raw) as {
      assignments: Array<{ source?: unknown; workoutSnapshot?: unknown }>;
      studentWorkoutVersions?: unknown;
    };
    delete legacy.studentWorkoutVersions;
    delete legacy.assignments[0].source;
    delete legacy.assignments[0].workoutSnapshot;
    window.localStorage.setItem('reppy-demo-v0', JSON.stringify(legacy));
  });

  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await expect(page.getByText('Основано на шаблоне «Ноги»')).toBeVisible();
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('Приседания');
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('4 × 8 · 70 кг');
});
