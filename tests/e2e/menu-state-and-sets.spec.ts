import { expect, test, type Page } from '@playwright/test';

async function demo(page: Page, student = false) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  if (student) await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
}

test('вкладки сохраняют раскрытый профиль, незавершённый ввод, календарь и независимый скролл', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await demo(page, true);
  const nav = page.locator('.bottom-nav');
  const scroll = page.locator('.page-wrap');
  await nav.getByRole('button', { name: 'Профиль' }).click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const field = page.getByLabel('Рост, см');
  await field.fill('183');
  await scroll.evaluate((element) => { element.scrollTop = 180; });
  const profileDepth = await scroll.evaluate((element) => element.scrollTop);
  expect(profileDepth).toBeGreaterThan(0);
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  const month = await page.locator('[data-route-active="true"] .calendar-toolbar h2').innerText();
  const selected = await page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]').getAttribute('aria-label');
  await scroll.evaluate((element) => { element.scrollTop = 120; });
  const calendarDepth = await scroll.evaluate((element) => element.scrollTop);
  await nav.getByRole('button', { name: 'Сегодня' }).click();
  await nav.getByRole('button', { name: 'Профиль' }).click();
  await expect(field).toHaveValue('183');
  await expect.poll(async () => Math.abs(await scroll.evaluate((element) => element.scrollTop) - profileDepth)).toBeLessThanOrEqual(1);
  await nav.getByRole('button', { name: 'Профиль' }).click();
  await expect.poll(async () => Math.abs(await scroll.evaluate((element) => element.scrollTop) - profileDepth)).toBeLessThanOrEqual(1);
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await expect(page.locator('[data-route-active="true"] .calendar-toolbar h2')).toHaveText(month);
  await expect(page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]')).toHaveAttribute('aria-label', selected!);
  await expect.poll(async () => Math.abs(await scroll.evaluate((element) => element.scrollTop) - calendarDepth)).toBeLessThanOrEqual(1);
});

test('вкладка возвращает открытую страницу внутри раздела и её глубину прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await demo(page, true);
  const nav = page.locator('.bottom-nav');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    const assignment = data.assignments.find((item: { studentId: string; status: string }) => item.studentId === 'artem' && item.status === 'completed');
    sessionStorage.setItem('reppy-ui:calendar-day:student', assignment.scheduledFor);
  });
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await page.locator('[data-route-active="true"] .agenda-list button').first().click();
  const url = page.url();
  const scroll = page.locator('.page-wrap');
  await scroll.evaluate((element) => { element.scrollTop = 180; });
  const depth = await scroll.evaluate((element) => element.scrollTop);
  expect(depth).toBeGreaterThan(0);
  await nav.getByRole('button', { name: 'Сегодня' }).click();
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await expect(page).toHaveURL(url);
  await expect.poll(async () => Math.abs(await scroll.evaluate((element) => element.scrollTop) - depth)).toBeLessThanOrEqual(1);
});

test('завершённая тренировка возвращается в календарь на ту же дату и прокрутку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await demo(page, true);
  const nav = page.locator('.bottom-nav');
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('button', { name: 'История' })).toHaveCount(0);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    const assignment = data.assignments.find((item: { studentId: string; status: string }) => item.studentId === 'artem' && item.status === 'completed');
    sessionStorage.setItem('reppy-ui:calendar-day:student', assignment.scheduledFor);
  });
  await nav.getByRole('button', { name: 'Календарь' }).click();
  const selected = await page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]').getAttribute('aria-label');
  const card = page.locator('[data-route-active="true"] .agenda-list button').first();
  await card.scrollIntoViewIfNeeded();
  const depth = await page.locator('.page-wrap').evaluate((element) => element.scrollTop);
  await card.click();
  await expect(page).toHaveURL(/#\/student\/calendar\/sessions\//);
  await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar$/);
  await expect(page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]')).toHaveAttribute('aria-label', selected!);
  await expect.poll(async () => Math.abs(await page.locator('.page-wrap').evaluate((element) => element.scrollTop) - depth)).toBeLessThanOrEqual(1);
});

test('незавершённая тренировка сохраняет раздел открытия: календарь или сегодня', async ({ page }) => {
  await demo(page, true);
  const nav = page.locator('.bottom-nav');
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await page.locator('[data-route-active="true"] .agenda-list button').first().click();
  await expect(page).toHaveURL(/#\/student\/calendar\/assignments\//);
  await expect(nav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar\/workout\//);
  await page.getByRole('button', { name: 'Вернуться назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar\/assignments\//);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar$/);
  await nav.getByRole('button', { name: 'Сегодня' }).click();
  await page.getByRole('button', { name: 'Посмотреть тренировку', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/assignments\//);
  await expect(nav.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/student$/);
});

test('старые ссылки истории открывают календарь и сохранённые результаты', async ({ page }) => {
  await demo(page, true);
  await page.goto('/#/student/history');
  await expect(page).toHaveURL(/#\/student\/calendar$/);
  await page.goto('/#/student/history/session-artem-legs-history-1');
  await expect(page).toHaveURL(/#\/student\/calendar\/sessions\/session-artem-legs-history-1$/);
  await expect(page.locator('[data-route-active="true"]').getByLabel('Итоги тренировки')).toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar$/);
});

test('после завершения из календаря кнопка Готово возвращает к выбранному дню', async ({ page }) => {
  await demo(page, true);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Календарь' }).click();
  const selected = await page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]').getAttribute('aria-label');
  await page.locator('[data-route-active="true"] .agenda-list button').first().click();
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('dialog', { name: 'Завершение тренировки' }).getByRole('button', { name: 'Завершить тренировку' }).click();
  await expect(page).toHaveURL(/#\/student\/calendar\/finish\//);
  await page.getByRole('button', { name: /Хорошо.*Рабочий темп/ }).click();
  await page.getByRole('button', { name: 'Сохранить результат' }).click();
  await expect(page).toHaveURL(/#\/student\/calendar\/success\//);
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/calendar$/);
  await expect(page.locator('[data-route-active="true"] .calendar-grid [aria-pressed="true"]')).toHaveAttribute('aria-label', selected!);
  await page.locator('[data-route-active="true"] .agenda-list button').first().click();
  await expect(page).toHaveURL(/#\/student\/calendar\/sessions\//);
});

test('редактор сохраняет незаполненную тренировку при смене вкладки без подтверждения потери', async ({ page }) => {
  await demo(page);
  await page.goto('/#/trainer/clients/maria/assign/new');
  await page.getByLabel('Название тренировки').fill('Незаконченный план');
  const nav = page.locator('.bottom-nav');
  await nav.getByRole('button', { name: 'Календарь' }).click();
  await expect(page).toHaveURL(/#\/trainer\/calendar$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Ученики' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign\/new$/);
  await expect(page.getByLabel('Название тренировки')).toHaveValue('Незаконченный план');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
  await picker.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: 'Назначить тренировку', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await page.goto('/#/trainer/clients/maria/assign/new');
  await expect(page.getByLabel('Название тренировки')).toHaveValue('');
});

for (const width of [320, 440]) {
  test(`один пустой подход, дробный вес и ровная сетка на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await demo(page, true);
    // Reproduce an old session that has a three-set snapshot but no saved results.
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
      const assignment = data.assignments.find((item: { id: string }) => item.id === 'assignment-artem-push-today');
      data.sessions.push({ id: 'interrupted-start', assignmentId: assignment.id, studentId: assignment.studentId,
        startedAt: new Date().toISOString(), recordedBy: 'student', workoutSnapshot: assignment.workoutSnapshot, results: [] });
      localStorage.setItem('reppy-demo-v0', JSON.stringify(data));
    });
    await page.goto('/#/student/workout/assignment-artem-push-today');
    await page.reload();
    const card = page.locator('[data-route-active="true"] .active-exercise-card').first();
    await expect(card.locator('.set-card')).toHaveCount(0);
    await card.getByRole('button', { name: /Добавить подход/ }).click();
    await expect(card.locator('.set-card')).toHaveCount(1);
    await expect(page.locator('[data-route-active="true"] .active-exercise-card').nth(1).locator('.set-card')).toHaveCount(0);
    const weight = card.getByLabel('КГ');
    const reps = card.getByLabel('ПОВТОРЫ');
    await expect(weight).toHaveValue('');
    await expect(reps).toHaveValue('');
    const complete = card.getByRole('button', { name: /Завершить подход 1/ });
    await expect(complete).toBeDisabled();
    // Type one character at a time to exercise the intermediate decimal separator.
    await weight.pressSequentially('2.5');
    await weight.press('Enter');
    await expect(weight).toHaveValue('2.5');
    await weight.fill('2,5');
    await weight.press('Enter');
    await expect(weight).toHaveValue('2.5');
    await reps.fill('8');
    await reps.press('Enter');
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(card.locator('.set-card.completed')).toHaveCount(1);
    const layout = await card.locator('.set-card').evaluate((element) => {
      const label = element.querySelector('.set-number span')!.getBoundingClientRect();
      const labels = [...element.querySelectorAll('label span')].map((el) => el.getBoundingClientRect().top);
      const input = element.querySelector('input')!.getBoundingClientRect();
      const check = element.querySelector('button')!.getBoundingClientRect();
      const number = element.querySelector('.set-number')!.getBoundingClientRect();
      return { labelTop: label.top, labels, inputY: input.y, checkY: check.y, inputHeight: input.height,
        checkHeight: check.height, gap: input.x - number.right };
    });
    for (const top of layout.labels) expect(Math.abs(top - layout.labelTop)).toBeLessThanOrEqual(1);
    expect(layout.inputY).toBe(layout.checkY);
    expect(layout.inputHeight).toBe(layout.checkHeight);
    expect(layout.gap).toBeGreaterThanOrEqual(8);
    await card.getByRole('button', { name: /Добавить подход/ }).click();
    await expect(card.locator('.set-card')).toHaveCount(2);
    await expect(card.locator('.set-card').last().getByLabel('КГ')).toHaveValue('');
    await expect(card.locator('.set-card').last().getByLabel('ПОВТОРЫ')).toHaveValue('');
    await expect(card.locator('.set-card').first().getByLabel('КГ')).toHaveValue('2.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 440) await page.screenshot({ path: 'test-results/sets-aligned.png', fullPage: false });
  });
}
