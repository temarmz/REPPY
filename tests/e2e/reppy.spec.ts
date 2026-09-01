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

test('тренер дублирует шаблон и повторяет назначение тому же ученику', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/workouts/push-day');
  await page.getByRole('button', { name: 'Дублировать' }).click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Грудь и плечи — копия');
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();

  await page.goto('/#/trainer/workouts');
  await expect(page.getByRole('heading', { name: 'Грудь и плечи — копия', exact: true })).toBeVisible();

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.getByRole('button', { name: 'Создать шаблон из назначения' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить на другую дату' }).click();
  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.getByText('КОПИЯ ДЛЯ ТОГО ЖЕ УЧЕНИКА')).toBeVisible();

  await setFirstExerciseWeight(page, 82.5);
  await page.locator('.coach-note-field textarea').first().fill('Держи лопатки сведёнными');
  await page.getByRole('button', { name: 'Скопировать тренировку' }).click();

  await expect(page).toHaveURL(/#\/trainer\/assignments\/assignment-/);
  await expect(page.getByText('Скопировано из предыдущей тренировки этого ученика')).toBeVisible();
  await expect(page.locator('.exercise-plan-list article').first()).toContainText('82.5 кг');
  await expect(page.getByText('Держи лопатки сведёнными')).toBeVisible();
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
  await page.getByRole('button', { name: 'Посмотреть тренировку' }).click();
  await expect(page).toHaveURL(/#\/student\/assignments\/assignment-artem-push-today$/);
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Жим лёжа' })).toBeVisible();
  await expect(page.locator('.active-exercise-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Жим гантелей на наклонной скамье' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Следующее упражнение' })).toHaveCount(0);
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
test('тренер ведёт занятие, правит его в моменте и удаляет завершённый результат', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.locator('.active-exercise-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Редактировать тренировку' })).toHaveCount(0);

  const squatCard = page.locator('.active-exercise-card').filter({ hasText: 'Приседания' });
  await expect(squatCard.locator('.active-comment-field')).toHaveCount(0);
  await squatCard.getByRole('button', { name: 'Добавить комментарий' }).click();
  await squatCard.locator('.active-comment-field textarea').fill('Колени держи по линии стоп');

  await expect(squatCard.getByLabel('Подходы')).toHaveCount(0);
  await expect(squatCard.getByRole('checkbox', { name: 'Выполнено' })).toHaveCount(0);
  await squatCard.getByRole('button', { name: 'Добавить подход' }).click();
  await squatCard.getByRole('button', { name: 'Как выполнять — Приседания' }).click();
  await expect(squatCard.getByText('Приседания — как выполнять')).toBeVisible();

  await squatCard.getByRole('button', { name: 'Добавить ниже' }).click();
  await page.getByRole('button', { name: 'Бицепс', exact: true }).click();
  await page.getByRole('button', { name: /Молотковые сгибания/ }).click();
  await expect(page.locator('.active-exercise-card')).toHaveCount(4);
  await expect(page.locator('.active-exercise-card').nth(1)).toContainText('Молотковые сгибания');
  await page.getByRole('button', { name: 'Опустить Молотковые сгибания ниже' }).click();
  await expect(page.locator('.active-exercise-card').nth(2)).toContainText('Молотковые сгибания');

  await expect(squatCard.locator('.set-card')).toHaveCount(5);
  await expect(squatCard.locator('.set-card').last().getByLabel('КГ')).toHaveValue('70');
  await expect(squatCard.locator('.set-card').last().getByLabel('ПОВТОРЫ')).toHaveValue('8');
  await page.getByRole('button', { name: 'Завершить подход 1 — Приседания' }).click();
  await expect(squatCard.getByRole('button', { name: 'Удалить упражнение — Приседания' })).toBeDisabled();

  const legPressCard = page.locator('.active-exercise-card').filter({ hasText: 'Жим ногами' });
  await page.getByRole('button', { name: 'Завершить подход 1 — Жим ногами' }).click();
  await expect(legPressCard.locator('.set-card.completed')).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();

  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);
  await expect(page.getByText('Тренер во время офлайн-занятия')).toBeVisible();
  await expect(page.getByText('Колени держи по линии стоп')).toBeVisible();

  await page.getByRole('button', { name: 'Повторить на другую дату' }).click();
  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.locator('.coach-note-field textarea').first()).toHaveValue('Колени держи по линии стоп');
  await page.goBack();
  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect(page.getByRole('status')).toContainText('Завершённая тренировка удалена');
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
