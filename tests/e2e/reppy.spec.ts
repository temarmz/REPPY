import { expect, test, type Page } from '@playwright/test';

async function openFreshDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expect(page).toHaveURL(/#\/trainer$/);
}

async function setExerciseSetWeight(page: Page, setIndex: number, weight: number) {
  const input = page.locator('.plan-exercise-card').first().locator('.plan-set-card').nth(setIndex).getByLabel('КГ');
  await input.fill(String(weight));
  await input.press('Enter');
}

async function setFirstExerciseWeight(page: Page, weight: number) {
  await setExerciseSetWeight(page, 0, weight);
}

test('лендинг кратко объясняет продукт и не переполняет мобильный экран', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ВЕДИ УЧЕНИКОВ. ВИДЬ ПРОГРЕСС.' })).toBeVisible();
  await expect(page.locator('.workflow-grid > li')).toHaveCount(3);
  await expect(page.locator('.landing-art-placeholder')).toHaveCount(2);
  await expect(page.locator('.price-tier-grid > article')).toHaveCount(4);
  await expect(page.getByText('Для ученика — 0 ₽')).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

test('настройки демо остаются поверх нижнего меню на коротком экране', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await openFreshDemo(page);
  await page.getByRole('button', { name: 'Открыть настройки' }).click();

  const dialog = page.getByRole('dialog', { name: 'Настройки демо' });
  const resetButton = page.getByRole('button', { name: 'Сбросить демо-данные' });
  await expect(dialog).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  const isButtonOnTop = await resetButton.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === element;
  });
  expect(isButtonOnTop).toBe(true);
  const resetBox = await resetButton.boundingBox();
  expect(resetBox!.y + resetBox!.height).toBeLessThanOrEqual(520);
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
});

test('тренер видит все дни и назначает ученику копию прошлой тренировки на свободную дату', async ({ page }) => {
  await openFreshDemo(page);

  const allDaysToggle = page.getByRole('switch', { name: /Все дни/ });
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.all-days-list')).toHaveCount(0);
  const compactDate = page.locator('.trainer-upcoming-row time strong').first();
  expect(await compactDate.textContent()).toBe((await compactDate.textContent())?.toLocaleLowerCase('ru-RU'));

  await allDaysToggle.click();
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.all-days-list .plan-day-card')).toHaveCount(14);

  const occupiedDateNumber = page.locator('.all-days-list .plan-day-card:not(.empty-day) .plan-day-date > strong').first();
  const emptyDateNumber = page.locator('.all-days-list .empty-day .plan-day-date > strong').first();
  expect(await occupiedDateNumber.evaluate((element) => getComputedStyle(element).fontSize))
    .toBe(await emptyDateNumber.evaluate((element) => getComputedStyle(element).fontSize));
  const firstMonth = page.locator('.all-days-list .plan-day-date > span > b').first();
  const expectedMonth = await firstMonth.locator('xpath=ancestor::time').getAttribute('datetime').then((value) => (
    new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
      .formatToParts(new Date(`${value}T12:00:00`))
      .find((part) => part.type === 'month')?.value ?? ''
  ));
  await expect(firstMonth).toHaveText(expectedMonth);

  await page.reload();
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.all-days-list .plan-day-card')).toHaveCount(14);

  const firstEmptyDay = page.locator('.all-days-list .plan-day-card.empty-day').first();
  const selectedDate = await firstEmptyDay.locator('time').getAttribute('datetime');
  expect(selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await firstEmptyDay.getByRole('button', { name: /Назначить ученика/ }).click();

  const studentDialog = page.getByRole('dialog', { name: /Кого назначить/ });
  await expect(studentDialog).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await studentDialog.getByRole('button', { name: /Мария А\./ }).click();

  await expect(page).toHaveURL(new RegExp(`#\/trainer\/schedule\/${selectedDate}\/maria$`));
  await expect(page.getByRole('heading', { name: 'ВЫБРАТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать тренировку' })).toBeVisible();
  const previousWorkout = page.locator('.schedule-history-list > button').first();
  await expect(previousWorkout).toContainText('Ноги');
  await previousWorkout.click();

  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Дата тренировки:/ })).toBeVisible();
  await page.getByRole('button', { name: 'Создать копию' }).click();

  await expect(page).toHaveURL(/#\/trainer$/);
  await expect(page.getByRole('status')).toContainText('Тренировка назначена: Мария А.');
  const assignedDay = page.locator('.all-days-list .plan-day-card').filter({ has: page.locator(`time[datetime="${selectedDate}"]`) });
  await expect(assignedDay).toContainText('Мария А.');

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'ВЫБРАТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать копию' })).toHaveCount(0);
});

test('повтор завершённой тренировки из расписания использует фактические результаты', async ({ page }) => {
  await openFreshDemo(page);
  const targetDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await page.goto(`/#/trainer/schedule/${targetDate}/artem`);

  const completedWorkout = page.locator('.schedule-history-list .workout-template-row').filter({ hasText: 'Завершена' }).first();
  await expect(completedWorkout).toBeVisible();
  await completedWorkout.click();

  const firstSet = page.locator('.plan-exercise-card').first().locator('.plan-set-card').first();
  await expect(firstSet.getByLabel('КГ')).toHaveValue('70');
  await expect(firstSet.getByLabel('ПОВТОРЫ')).toHaveValue('10');
});

test('тренер дублирует шаблон и повторяет назначение тому же ученику', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/workouts/push-day');
  const assignButton = page.getByRole('button', { name: 'Назначить', exact: true });
  const editButton = page.getByRole('button', { name: 'Редактировать', exact: true });
  const duplicateButton = page.getByRole('button', { name: 'Дублировать' });
  const [assignBox, editBox, duplicateBox] = await Promise.all([assignButton.boundingBox(), editButton.boundingBox(), duplicateButton.boundingBox()]);
  expect(assignBox?.width ?? 0).toBeGreaterThan((editBox?.width ?? 0) * 1.8);
  expect(Math.round(editBox?.y ?? -1)).toBe(Math.round(duplicateBox?.y ?? -2));
  await duplicateButton.click();
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Грудь и плечи — копия');
  await page.getByRole('button', { name: 'Сохранить тренировку' }).click();

  await page.goto('/#/trainer/workouts');
  await expect(page.getByRole('heading', { name: 'Грудь и плечи — копия', exact: true })).toBeVisible();

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.getByRole('button', { name: 'Создать шаблон из назначения' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить на другую дату' }).click();
  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await page.getByRole('button', { name: /Новая дата:/ }).click();
  const repeatDatePicker = page.getByRole('dialog', { name: 'Новая дата' });
  await expect(repeatDatePicker.locator('.calendar-grid button[aria-current="date"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(repeatDatePicker.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();
  await repeatDatePicker.getByRole('button', { name: 'Выбрать дату' }).click();
  await expect(page.getByText('КОПИЯ ДЛЯ ТОГО ЖЕ УЧЕНИКА')).toHaveCount(0);

  await setFirstExerciseWeight(page, 82.5);
  const firstCard = page.locator('.plan-exercise-card').first();
  await firstCard.getByRole('button', { name: 'Добавить комментарий' }).click();
  await firstCard.locator('.active-comment-field textarea').fill('Держи лопатки сведёнными');
  await page.getByRole('button', { name: 'Создать копию' }).click();

  await expect(page).toHaveURL(/#\/trainer\/assignments\/assignment-/);
  await expect(page.getByText('Скопировано из предыдущей тренировки этого ученика')).toHaveCount(0);
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('82.5 кг × 8');
  await expect(page.getByText('Держи лопатки сведёнными')).toBeVisible();
});

test('редактирование шаблона не меняет существующее назначение', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('80 кг × 8');

  await page.goto('/#/trainer/workouts/push-day/edit');
  await setExerciseSetWeight(page, 0, 95);
  await setExerciseSetWeight(page, 1, 90);
  await page.getByRole('button', { name: 'Сохранить тренировку' }).click();

  await page.goto('/#/trainer/workouts/push-day');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('95 кг × 8');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('90 кг × 8');

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('80 кг × 8');
});


test('редактирование назначения не создаёт скрытую персональную версию', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  await setFirstExerciseWeight(page, 85);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('status')).toContainText('Назначение сохранено');

  await page.goto('/#/trainer/workouts/push-day/assign');
  await expect(page.getByText('Для Артем А. есть сохранённая версия')).toHaveCount(0);
  await expect(page.locator('.select-student-list > button:not(.assign-button)').first()).toContainText('Артем А.');
})

test('тренер назначает тренировку из профиля ученика и сразу подстраивает план', async ({ page }) => {
  await openFreshDemo(page);

  await expect(page.locator('.bottom-nav')).not.toContainText('Тренировки');
  await page.goto('/#/trainer/clients/maria');
  await page.getByRole('button', { name: 'Назначить тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign$/);
  await expect(page.getByRole('heading', { name: 'ВЫБРАТЬ ТРЕНИРОВКУ' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign\/new$/);
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign$/);

  await page.getByRole('button', { name: /Грудь и плечи/ }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign\/push-day$/);
  await expect(page.getByRole('heading', { name: 'НАЗНАЧИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.locator('.assignment-edit-person strong')).toHaveText('Мария А.');
  const firstExercise = page.locator('.plan-exercise-card').first();

  await page.getByRole('button', { name: /Дата тренировки:/ }).click();
  const assignmentDatePicker = page.getByRole('dialog', { name: 'Дата тренировки' });
  await expect(assignmentDatePicker).toBeVisible();
  await expect(assignmentDatePicker.locator('.calendar-grid button')).toHaveCount(42);
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await assignmentDatePicker.getByRole('button', { name: 'Выбрать дату' }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await firstExercise.getByRole('button', { name: 'Как выполнять — Жим лёжа' }).click();
  await expect(page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть описание' }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await firstExercise.getByRole('button', { name: 'Действия — Жим лёжа' }).click();
  await expect(page.getByRole('dialog', { name: 'Действия — Жим лёжа' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть действия' }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await firstExercise.getByRole('button', { name: 'Ещё упражнение' }).click();
  await expect(page.getByRole('dialog', { name: 'Добавить упражнение после выбранного' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await setFirstExerciseWeight(page, 62.5);
  await page.getByRole('button', { name: 'Назначить Мария А.' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect(page.getByRole('status')).toContainText('Тренировка назначена: Мария А.');
  const assigned = page.locator('.profile-schedule .workout-row').filter({ hasText: 'Грудь и плечи' }).first();
  await assigned.click();
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('62.5 кг × 8');
});

test('тренер пополняет и исправляет абонемент, ученик видит остаток и последние оплаты', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/artem');

  const subscription = page.getByLabel('Абонемент');
  await expect(subscription).toContainText('Осталось 11 занятий');
  await expect(subscription).toContainText('11 400 ₽ · наличные');
  await subscription.getByRole('button', { name: 'Продлить' }).click();

  await expect(page.getByLabel('Количество занятий')).toHaveValue('8');
  await expect(page.getByLabel('Стоимость, ₽')).toHaveValue('11400');
  await page.getByRole('button', { name: 'Перевод' }).click();
  await page.getByRole('button', { name: /Дата оплаты:/ }).click();
  const paymentDatePicker = page.getByRole('dialog', { name: 'Дата оплаты' });
  await expect(paymentDatePicker).toBeVisible();
  await expect(paymentDatePicker.locator('.calendar-grid button')).toHaveCount(42);
  await expect(paymentDatePicker.locator('.calendar-grid button[aria-pressed="true"]')).toHaveCount(1);
  await paymentDatePicker.getByRole('button', { name: 'Выбрать дату' }).click();
  await expect(paymentDatePicker).toHaveCount(0);
  await page.getByLabel(/Комментарий/).fill('Оплата за новый блок');
  await page.getByRole('button', { name: 'Добавить пополнение' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
  await expect(subscription).toContainText('Осталось 19 занятий');
  await expect(subscription).toContainText('11 400 ₽ · перевод');
  await subscription.getByRole('button', { name: 'История' }).click();

  await expect(page.getByRole('heading', { name: 'ИСТОРИЯ АБОНЕМЕНТА' })).toBeVisible();
  await expect(page.getByText('Осталось 19 занятий')).toBeVisible();
  await page.locator('.subscription-entry-list > button').first().click();
  await expect(page.getByRole('heading', { name: 'ИСПРАВИТЬ ПОПОЛНЕНИЕ' })).toBeVisible();
  await page.getByLabel('Количество занятий').fill('6');
  await page.getByLabel('Стоимость, ₽').fill('12000');
  await page.getByRole('button', { name: 'Наличные' }).click();
  await page.getByLabel(/Комментарий/).fill('Исправлено тренером');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();

  await expect(page.getByText('Осталось 17 занятий')).toBeVisible();
  await expect(page.locator('.subscription-entry-list > button').first()).toContainText('12 000 ₽ · наличные');
  await expect(page.locator('.subscription-entry-list > button').first()).toContainText('Исправлено тренером');

  await page.getByRole('button', { name: /DEMO.*Тренер.*Ученик/ }).first().click();
  await expect(page.getByLabel('Остаток абонемента')).toContainText('Осталось 17 занятий');
  await page.goto('/#/student/profile');
  await expect(page.getByLabel('Абонемент')).toContainText('Осталось 17 занятий');
  await expect(page.getByLabel('Последние пополнения')).toContainText('12 000 ₽ · наличные');
});

test('тренер может завершить занятие в долг и списание происходит один раз', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await expect(page.getByText('Абонемент не добавлен')).toBeVisible();
  await page.getByRole('button', { name: 'Начать тренировку' }).click();

  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  const finishDialog = page.getByRole('dialog', { name: 'Завершение тренировки' });
  await expect(finishDialog).toContainText('Абонемент закончился');
  await expect(finishDialog).toContainText('1 занятие в долг');
  page.once('dialog', (dialog) => dialog.accept());
  await finishDialog.getByRole('button', { name: 'Завершить и списать занятие' }).click();

  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);
  await expect(page.getByText('Одно занятие списано')).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByLabel('Абонемент')).toContainText('1 занятие в долг');
});

test('результат ученика виден тренеру и не меняется вместе с шаблоном', async ({ page }) => {
  await openFreshDemo(page);

  await page.getByRole('button', { name: /DEMO.*Тренер.*Ученик/ }).first().click();
  await expect(page).toHaveURL(/#\/student$/);
  await expect(page.getByLabel('Остаток абонемента')).toContainText('Осталось 11 занятий');
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
  await expect(page.getByText('Осталось 10 занятий')).toBeVisible();

  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: /DEMO.*Ученик.*Тренер/ }).first().click();

  await page.goto('/#/trainer/workouts/push-day/edit');
  await setFirstExerciseWeight(page, 95);
  await page.getByRole('button', { name: 'Сохранить тренировку' }).click();

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
  await expect(page.getByRole('button', { name: 'Завершить тренировку' })).toHaveCSS('background-color', 'rgb(198, 255, 61)');
  await expect(page.locator('.active-sticky-header')).toHaveCSS('position', 'sticky');
  const safeAreaCover = await page.locator('.active-sticky-header').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { background: style.backgroundColor, content: style.content };
  });
  expect(safeAreaCover.background).toBe('rgb(9, 11, 9)');
  expect(safeAreaCover.content).not.toBe('none');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => Math.round((await page.locator('.active-sticky-header').boundingBox())?.y ?? -1)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  const squatCard = page.locator('.active-exercise-card').filter({ hasText: 'Приседания' });
  await expect(squatCard.getByText('Квадрицепс · Штанга')).toBeVisible();
  const firstSquatSetButton = page.getByRole('button', { name: 'Завершить подход 1 — Приседания' });
  await expect(firstSquatSetButton).toHaveCSS('color', 'rgb(105, 112, 104)');
  await expect(firstSquatSetButton.locator('.ui-icon')).toHaveAttribute('style', /icon-checkmark\.svg/);
  const controlHeights = await Promise.all([
    squatCard.getByRole('button', { name: 'Добавить комментарий' }),
    squatCard.getByRole('button', { name: 'Опустить Приседания ниже' }),
    squatCard.getByRole('button', { name: 'Как выполнять — Приседания' }),
    squatCard.getByRole('button', { name: 'Действия — Приседания' }),
  ].map(async (control) => (await control.boundingBox())?.height));
  expect(new Set(controlHeights).size).toBe(1);
  const footerButtonRows = await Promise.all([
    squatCard.getByRole('button', { name: 'Ещё подход' }),
    squatCard.getByRole('button', { name: 'Ещё упражнение' }),
  ].map(async (control) => Math.round((await control.boundingBox())?.y ?? -1)));
  expect(new Set(footerButtonRows).size).toBe(1);
  await expect(squatCard.locator('.active-comment-field')).toHaveCount(0);
  await squatCard.getByRole('button', { name: 'Добавить комментарий' }).click();
  const commentField = squatCard.locator('.active-comment-field textarea');
  await expect(commentField).toBeFocused();
  await commentField.fill('Колени держи по линии стоп');
  await expect(squatCard.getByRole('button', { name: 'Скрыть комментарий' })).toBeVisible();
  await squatCard.getByRole('button', { name: 'Скрыть комментарий' }).click();
  await expect(squatCard.locator('.active-comment-field')).toHaveCount(0);
  await expect(squatCard.getByRole('button', { name: 'Показать комментарий' })).toBeVisible();

  await expect(squatCard.getByLabel('Подходы')).toHaveCount(0);
  await expect(squatCard.getByRole('checkbox', { name: 'Выполнено' })).toHaveCount(0);
  await squatCard.getByRole('button', { name: 'Ещё подход' }).click();
  await squatCard.getByRole('button', { name: 'Как выполнять — Приседания' }).click();
  const instructionDialog = page.getByRole('dialog', { name: 'Как выполнять — Приседания' });
  await expect(instructionDialog).toBeVisible();
  await expect(instructionDialog).toContainText('Займи устойчивое исходное положение');
  await expect(instructionDialog).toContainText('Видео и изображения появятся здесь');
  await expect(instructionDialog).toContainText('ОБОРУДОВАНИЕ');
  await expect(instructionDialog).toContainText('Штанга');
  await instructionDialog.getByRole('button', { name: 'Закрыть описание' }).click();

  await squatCard.getByRole('button', { name: 'Ещё упражнение' }).click();
  await expect(page.locator('.exercise-picker-sheet .search-input')).toHaveCSS('font-size', '16px');
  await page.getByRole('button', { name: 'Бицепс', exact: true }).click();
  await page.getByRole('button', { name: /Молотковые сгибания/ }).click();
  await expect(page.locator('.active-exercise-card')).toHaveCount(4);
  await expect(page.locator('.active-exercise-card').nth(1)).toContainText('Молотковые сгибания');
  await expect(page.locator('.active-exercise-card').nth(1)).toHaveClass(/recently-moved/);
  await page.getByRole('button', { name: 'Опустить Молотковые сгибания ниже' }).click();
  await expect(page.locator('.active-exercise-card').nth(2)).toContainText('Молотковые сгибания');
  await expect(page.locator('.active-exercise-card').nth(2)).toHaveClass(/recently-moved/);

  const hammerCard = page.locator('.active-exercise-card').filter({ hasText: 'Молотковые сгибания' });
  await hammerCard.getByRole('button', { name: 'Ещё упражнение' }).click();
  await page.locator('.exercise-picker-sheet .search-input').fill('Тяга полотенца');
  await page.getByRole('button', { name: 'Добавить «Тяга полотенца»' }).click();
  const customCard = page.locator('.active-exercise-card').filter({ hasText: 'Тяга полотенца' });
  await expect(customCard).toBeVisible();
  await expect(customCard.getByText('Пользовательское упражнение')).toBeVisible();
  await expect(customCard).toHaveClass(/recently-moved/);
  await expect(customCard.locator('.set-card')).toHaveCount(3);
  await customCard.getByRole('button', { name: 'Действия — Тяга полотенца' }).click();
  let actionsDialog = page.getByRole('dialog', { name: 'Действия — Тяга полотенца' });
  await actionsDialog.getByRole('button', { name: /Удалить подход/ }).click();
  await expect(customCard.locator('.set-card')).toHaveCount(2);

  await customCard.getByRole('button', { name: 'Действия — Тяга полотенца' }).click();
  actionsDialog = page.getByRole('dialog', { name: 'Действия — Тяга полотенца' });
  await actionsDialog.getByRole('button', { name: /Удалить упражнение/ }).click();
  await expect(customCard).toHaveCount(0);

  await expect(squatCard.locator('.set-card')).toHaveCount(5);
  await expect(squatCard.locator('.set-card').last().getByLabel('КГ')).toHaveValue('70');
  await expect(squatCard.locator('.set-card').last().getByLabel('ПОВТОРЫ')).toHaveValue('8');
  await squatCard.getByLabel('КГ').first().fill('72.5');
  await squatCard.getByLabel('КГ').first().press('Enter');
  await squatCard.getByLabel('ПОВТОРЫ').first().fill('6');
  await squatCard.getByLabel('ПОВТОРЫ').first().press('Enter');
  await page.getByRole('button', { name: 'Завершить подход 1 — Приседания' }).click();
  await squatCard.getByRole('button', { name: 'Действия — Приседания' }).click();
  actionsDialog = page.getByRole('dialog', { name: 'Действия — Приседания' });
  await expect(actionsDialog.getByRole('button', { name: /Удалить упражнение/ })).toBeDisabled();
  await actionsDialog.getByRole('button', { name: 'Закрыть действия' }).click();

  const legPressCard = page.locator('.active-exercise-card').filter({ hasText: 'Жим ногами' });
  await page.getByRole('button', { name: 'Завершить подход 1 — Жим ногами' }).click();
  await expect(legPressCard.locator('.set-card.completed')).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await expect(page.getByRole('dialog', { name: 'Завершение тренировки' })).toBeVisible();
  await page.getByRole('button', { name: 'Не списывать занятие' }).click();

  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);
  await expect(page.getByText('РЕЗУЛЬТАТ ЗАПОЛНИЛ')).toHaveCount(0);
  await expect(page.getByText('Занятие не списано')).toBeVisible();
  await expect(page.getByText('Колени держи по линии стоп')).toBeVisible();

  await page.getByRole('button', { name: 'Повторить на другую дату' }).click();
  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  const repeatedSquat = page.locator('.plan-exercise-card').first();
  await expect(repeatedSquat.locator('.active-comment-field textarea')).toHaveValue('Колени держи по линии стоп');
  await expect(repeatedSquat.getByLabel('КГ').first()).toHaveValue('72.5');
  await expect(repeatedSquat.getByLabel('ПОВТОРЫ').first()).toHaveValue('6');
  await page.goBack();
  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect(page.getByRole('status')).toContainText('Завершённая тренировка удалена');
});

test('упражнение со своим весом не показывает килограммы в плане', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/workouts/pull-day/edit');
  const pullUpsPlan = page.locator('.plan-exercise-card').filter({ hasText: 'Подтягивания' });
  await expect(pullUpsPlan.getByText('Спина · Свой вес')).toBeVisible();
  await expect(pullUpsPlan.getByLabel('КГ')).toHaveCount(0);
  await expect(pullUpsPlan.locator('.active-exercise-meta')).toHaveText('Спина · Свой вес');

  await pullUpsPlan.getByRole('button', { name: 'Ещё упражнение' }).click();
  await page.getByRole('button', { name: 'Кор', exact: true }).click();
  await page.getByRole('button', { name: /Планка/ }).click();
  const plankPlan = page.locator('.plan-exercise-card').filter({ hasText: 'Планка' });
  await expect(plankPlan.getByLabel('КГ')).toHaveCount(0);
  await expect(plankPlan.getByLabel('СЕКУНДЫ').first()).toHaveValue('30');
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
  await expect(page.getByText('Основано на шаблоне «Ноги»')).toHaveCount(0);
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('Приседания');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('70 кг × 8');
});
