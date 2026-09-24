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

  await expect(page.locator('.welcome-card > .brand-button')).toHaveCSS('margin-left', '0px');

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

test('внутренний дизайн-кит собирает реальные контролы и модальный слой', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshDemo(page);
  await page.getByRole('button', { name: 'Открыть настройки' }).click();
  await page.getByRole('button', { name: 'Открыть дизайн-кит' }).click();

  await expect(page).toHaveURL(/#\/trainer\/design-kit$/);
  await expect(page.getByRole('heading', { name: 'ДИЗАЙН-КИТ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Цвета и поверхности' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Типографика' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Действия' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Поля' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Карточка упражнения' })).toBeVisible();
  await expect(page.locator('.design-kit-button-grid [data-ui-control="action"]')).toHaveCount(4);
  await expect(page.locator('[data-ui-control="text-field"]')).toHaveCount(1);
  await expect(page.locator('[data-ui-control="schedule-fields"]')).toHaveCount(1);

  const scheduleFields = page.getByRole('group', { name: 'Дата и время тренировки' });
  const dateControl = page.locator('.design-kit-section .schedule-fields .date-picker-field > button');
  const timeControl = scheduleFields.locator('input[type="time"]');
  await expect(dateControl).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(dateControl).toHaveAttribute('aria-expanded', 'false');
  expect(Math.round((await dateControl.boundingBox())?.height ?? 0)).toBe(Math.round((await timeControl.boundingBox())?.height ?? 0));

  await dateControl.click();
  await expect(dateControl).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Закрыть выбор даты' }).click();

  await page.getByRole('button', { name: 'Открыть модалку' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Пример модального окна');
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.locator('.page-wrap').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/design-kit-mobile.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('системные состояния показывают конфликт и повторяют сохранение после возвращения сети', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshDemo(page);
  await page.goto('/#/trainer/design-kit');

  const samples = page.locator('.design-kit-system-states');
  await expect(samples).toContainText('Загружаем данные');
  await expect(samples).toContainText('Сохраняем изменения');
  await expect(samples).toContainText('Нет сети');
  await expect(samples).toContainText('Не удалось сохранить изменения');
  await expect(samples).toContainText('Данные изменились на другом устройстве');
  await expect(samples.getByRole('button', { name: 'Загрузить актуальные' })).toBeVisible();
  await samples.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/design-kit-system-states.png', animations: 'disabled' });

  await page.goto('/#/trainer');
  await expect(page.locator('.app-status-banner:not(.preview)')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toContainText('Изменения сохраняются на этом устройстве');
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toHaveCount(0);

  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    let shouldFail = true;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === 'reppy-demo-v0' && shouldFail) {
        shouldFail = false;
        throw new DOMException('Хранилище временно недоступно', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
  const saveError = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить изменения' });
  await expect(saveError).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toHaveCount(0);
  await context.setOffline(false);
  await expect(saveError).toHaveCount(0);
  await expect(page.locator('.app-status-banner:not(.preview)')).toHaveCount(0);
});

test('ошибка загрузки не подменяет данные и позволяет повторить запрос', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    let shouldFail = true;
    Storage.prototype.getItem = function getItem(key: string) {
      if (key === 'reppy-demo-v0' && shouldFail) {
        shouldFail = false;
        throw new DOMException('Хранилище временно недоступно', 'SecurityError');
      }
      return originalGetItem.call(this, key);
    };
  });

  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить данные');
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('button', { name: 'Попробовать REPPY' })).toBeVisible();
});

test('светлая тема переключается из компактной шапки, сохраняется и держит контраст', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshDemo(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const roleSwitch = page.getByRole('button', { name: 'Переключиться в роль ученика' });
  const themeSwitch = page.getByRole('button', { name: 'Включить светлую тему' });
  const roleBox = await roleSwitch.boundingBox();
  const themeBox = await themeSwitch.boundingBox();
  expect(roleBox?.width ?? 999).toBeLessThan(90);
  expect(Math.round(themeBox?.width ?? 0)).toBe(40);

  await themeSwitch.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Включить тёмную тему' })).toBeVisible();
  await expect(page.locator('.today-schedule')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const allDaysToggle = page.getByRole('switch', { name: /Все дни/ });
  await expect(allDaysToggle.locator('.schedule-view-icon .ui-icon')).toHaveCSS('width', '19px');
  await expect(allDaysToggle.locator('.toggle-track')).toHaveCSS('background-color', 'rgb(213, 219, 209)');
  const [allDaysIconBox, allDaysLabelBox] = await Promise.all([
    allDaysToggle.locator('.schedule-view-icon').boundingBox(),
    allDaysToggle.getByText('Все дни').boundingBox(),
  ]);
  expect(Math.round((allDaysLabelBox?.x ?? 0) - ((allDaysIconBox?.x ?? 0) + (allDaysIconBox?.width ?? 0)))).toBeLessThanOrEqual(5);
  await page.screenshot({ path: 'test-results/theme-light-trainer.png', animations: 'disabled' });

  await page.goto('/#/trainer/design-kit');
  const primary = page.getByRole('button', { name: 'Основное действие' });
  const primaryContrast = await primary.evaluate((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = parse(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const css = getComputedStyle(element);
    const foreground = luminance(css.color);
    const background = luminance(css.backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(primaryContrast).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('.design-kit-statuses span').first()).toHaveCSS('color', 'rgb(96, 72, 154)');
  await expect(page.locator('.design-kit-statuses .attention')).toHaveCSS('color', 'rgb(168, 68, 43)');
  await page.screenshot({ path: 'test-results/theme-light-design-kit.png', animations: 'disabled' });

  await page.goto('/#/trainer/calendar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.calendar-grid button.outside').first()).toHaveCSS('color', 'rgb(104, 113, 102)');
  await page.screenshot({ path: 'test-results/theme-light-calendar.png', animations: 'disabled' });

  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  await expect(page.locator('.set-count-control > span').first()).toHaveCSS('color', 'rgb(78, 89, 74)');
  await expect(page.locator('.set-count-control').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.set-count-control > strong')).toHaveCount(0);
  const firstPlanExercise = page.locator('.plan-exercise-card').first();
  await expect(firstPlanExercise.getByLabel('КГ').first()).toHaveCSS('border-top-width', '1px');
  await expect(firstPlanExercise.getByLabel('КГ').first()).toHaveCSS('border-top-color', 'rgb(130, 145, 126)');
  await expect(firstPlanExercise.getByLabel('КГ').first()).toHaveCSS('background-color', 'rgb(243, 246, 239)');
  await expect(page.locator('.plan-context-card .date-picker-field > button')).toHaveCSS('border-top-color', 'rgb(130, 145, 126)');
  const setCountGroup = firstPlanExercise.getByRole('group', { name: 'Подходы — Жим лёжа' });
  const [setCountLabelBox, removeSetBox] = await Promise.all([
    setCountGroup.locator(':scope > span').boundingBox(),
    setCountGroup.getByRole('button', { name: 'Удалить последний подход — Жим лёжа' }).boundingBox(),
  ]);
  expect(Math.round((removeSetBox?.x ?? 0) - ((setCountLabelBox?.x ?? 0) + (setCountLabelBox?.width ?? 0)))).toBeLessThanOrEqual(9);
  await expect(firstPlanExercise.locator('.active-exercise-footer-actions')).toHaveCSS('border-top-width', '1px');
  await expect(page.getByRole('button', { name: 'Добавить упражнение' }).locator('.ui-icon')).toBeVisible();
  await firstPlanExercise.getByRole('button', { name: 'Как выполнять — Жим лёжа' }).click();
  await expect(page.locator('.exercise-instruction-media')).toHaveCSS('color', 'rgb(96, 72, 154)');
  await page.getByRole('button', { name: 'Закрыть описание' }).click();
  await page.screenshot({ path: 'test-results/theme-light-assignment-edit.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const lightAdd = page.getByRole('dialog', { name: 'Добавить упражнения' }).getByRole('button', { name: 'Добавить Жим лёжа', exact: true });
  await expect(lightAdd).toHaveCSS('background-color', 'rgb(247, 248, 243)');
  await expect(lightAdd).toHaveCSS('color', 'rgb(48, 56, 46)');
  await page.getByRole('button', { name: 'Готово' }).click();

  await page.goto('/#/trainer/clients');
  await expect(page.locator('.person-avatar.lime').first()).toHaveCSS('color', 'rgb(79, 113, 17)');

  await page.goto('/#/trainer/clients/artem/subscription');
  await expect(page.locator('.subscription-entry-delta.negative').first()).toHaveCSS('color', 'rgb(168, 68, 43)');

  await page.goto('/#/trainer/workout/assignment-maria-legs');
  await expect(page.locator('.active-sticky-header')).toBeVisible();
  await page.screenshot({ path: 'test-results/theme-light-active-workout.png', animations: 'disabled' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/trainer');
  await expect(page.locator('.desktop-nav')).toHaveCSS('background-color', 'rgb(248, 249, 244)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/theme-light-trainer-desktop.png', animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/trainer');
  await roleSwitch.click();
  await expect(page).toHaveURL(/#\/student$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Включить тёмную тему' })).toBeVisible();
  await page.screenshot({ path: 'test-results/theme-light-student.png', animations: 'disabled' });

  await page.goto('/#/student/profile');
  await expect(page.locator('.athlete-details .section-heading h2')).toHaveCSS('color', 'rgb(48, 56, 46)');
  await expect(page.locator('.athlete-summary dd').first()).toHaveCSS('color', 'rgb(23, 27, 22)');
  await expect(page.locator('.athlete-summary > div').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.goto('/#/student/finish/session-artem-legs-history-5');
  await page.getByRole('button', { name: 'Отлично' }).click();
  await expect(page.locator('.mood-fieldset legend')).toHaveCSS('color', 'rgb(61, 70, 58)');
  await expect(page.locator('.mood-grid strong').first()).toHaveCSS('color', 'rgb(23, 27, 22)');
});

test('дата и время назначения имеют одинаковый компактный размер', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  const scheduleFields = page.getByRole('group', { name: 'Дата и время тренировки' });
  const dateControl = scheduleFields.getByRole('button', { name: /Дата тренировки:/ });
  const timeControl = scheduleFields.locator('input[type="time"]');
  const dateBox = await dateControl.boundingBox();
  const timeBox = await timeControl.boundingBox();
  expect(Math.round(dateBox?.height ?? 0)).toBe(48);
  expect(Math.round(timeBox?.height ?? 0)).toBe(48);
  expect(Math.round(dateBox?.width ?? 0)).toBe(Math.round(timeBox?.width ?? 0));
});

test('кнопка Назад восстанавливает точную глубину прокрутки предыдущего экрана', async ({ page }) => {
  await openFreshDemo(page);

  await page.getByRole('switch', { name: /Все дни/ }).click();
  const scrollArea = page.locator('.page-wrap');
  const target = page.locator('.plan-session-row').last();
  await target.scrollIntoViewIfNeeded();
  const previousDepth = await scrollArea.evaluate((element) => element.scrollTop);
  expect(previousDepth).toBeGreaterThan(100);

  await target.click();
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer$/);
  await expect.poll(async () => Math.abs(await scrollArea.evaluate((element) => element.scrollTop) - previousDepth)).toBeLessThanOrEqual(1);
});

test('кнопка Назад восстанавливает прокрутку окна на широком экране', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openFreshDemo(page);

  await page.getByRole('switch', { name: /Все дни/ }).click();
  const target = page.locator('.plan-session-row').last();
  await target.scrollIntoViewIfNeeded();
  const previousDepth = await page.evaluate(() => window.scrollY);
  expect(previousDepth).toBeGreaterThan(100);

  await target.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer$/);
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - previousDepth)).toBeLessThanOrEqual(1);
});

test('модалки и несохранённая форма корректно обрабатывают Back и Escape', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/assignments/assignment-anton-push-1/edit');
  await setFirstExerciseWeight(page, 81);

  await page.goBack();
  const discardDialog = page.getByRole('alertdialog');
  await expect(discardDialog).toBeVisible();
  await expect(page).toHaveURL(/#\/trainer\/assignments\/assignment-anton-push-1\/edit$/);
  await expect(discardDialog.getByRole('button', { name: 'Остаться' })).toBeFocused();
  await expect(discardDialog.getByRole('button', { name: 'Выйти без сохранения' })).toHaveClass(/danger-button/);
  await discardDialog.getByRole('button', { name: 'Остаться' }).click();

  const dateButton = page.getByRole('button', { name: /Дата тренировки:/ });
  await dateButton.click();
  await expect(page.getByRole('dialog', { name: 'Дата тренировки' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Дата тренировки' })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/trainer\/assignments\/assignment-anton-push-1\/edit$/);
  await expect(dateButton).toBeFocused();

  await dateButton.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Дата тренировки' })).toHaveCount(0);
  await expect(dateButton).toBeFocused();
});

test('тренер видит единые карточки расписания и назначает копию тренировки на свободную дату', async ({ page }) => {
  await openFreshDemo(page);

  const allDaysToggle = page.getByRole('switch', { name: /Все дни/ });
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'false');
  await expect(allDaysToggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(allDaysToggle).toHaveCSS('border-top-width', '0px');
  await expect(allDaysToggle.locator('.schedule-view-icon')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const occupiedOnlyDays = page.locator('.schedule-days-list .plan-day-card');
  expect(await occupiedOnlyDays.count()).toBeGreaterThan(0);
  await expect(page.locator('.schedule-days-list .empty-day')).toHaveCount(0);
  await expect(occupiedOnlyDays.first().locator('.plan-day-date')).toBeVisible();
  await expect(occupiedOnlyDays.first().locator('.plan-session-row')).toBeVisible();

  await allDaysToggle.click();
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.schedule-days-list .plan-day-card')).toHaveCount(14);
  await expect(page.locator('.schedule-days-list .empty-day').first()).not.toContainText('Свободно');

  const occupiedDateNumber = page.locator('.schedule-days-list .plan-day-card:not(.empty-day) .plan-day-date > strong').first();
  const emptyDateNumber = page.locator('.schedule-days-list .empty-day .plan-day-date > strong').first();
  expect(await occupiedDateNumber.evaluate((element) => getComputedStyle(element).fontSize))
    .toBe(await emptyDateNumber.evaluate((element) => getComputedStyle(element).fontSize));
  const firstMonth = page.locator('.schedule-days-list .plan-day-date > span > b').first();
  const expectedMonth = await firstMonth.locator('xpath=ancestor::time').getAttribute('datetime').then((value) => (
    new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
      .formatToParts(new Date(`${value}T12:00:00`))
      .find((part) => part.type === 'month')?.value ?? ''
  ));
  await expect(firstMonth).toHaveText(expectedMonth);

  const occupiedDay = page.locator('.schedule-days-list .plan-day-card:not(.empty-day)').first();
  const emptyDay = page.locator('.schedule-days-list .plan-day-card.empty-day').first();
  const occupiedHeaderBox = await occupiedDay.locator(':scope > header').boundingBox();
  const emptyActionBox = await emptyDay.locator(':scope > .empty-day-action').boundingBox();
  const occupiedPlusBox = await occupiedDay.locator('.schedule-add-button').boundingBox();
  const emptyPlusBox = await emptyDay.locator('.empty-day-plus').boundingBox();
  expect(Math.round(occupiedHeaderBox?.height ?? 0)).toBe(Math.round(emptyActionBox?.height ?? 0));
  expect(Math.round((occupiedPlusBox?.x ?? 0) + (occupiedPlusBox?.width ?? 0)))
    .toBe(Math.round((emptyPlusBox?.x ?? 0) + (emptyPlusBox?.width ?? 0)));

  await page.reload();
  await expect(allDaysToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.schedule-days-list .plan-day-card')).toHaveCount(14);

  const firstEmptyDay = page.locator('.schedule-days-list .plan-day-card.empty-day').first();
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
  const repeatSubmit = page.getByRole('button', { name: 'Назначить тренировку' });
  await expect(repeatSubmit.locator('.ui-icon')).toHaveAttribute('style', /icon-plus\.svg/);
  await repeatSubmit.click();

  await expect(page).toHaveURL(/#\/trainer$/);
  await expect(page.getByRole('status')).toContainText('Тренировка назначена: Мария А.');
  const assignedDay = page.locator('.schedule-days-list .plan-day-card').filter({ has: page.locator(`time[datetime="${selectedDate}"]`) });
  await expect(assignedDay).toContainText('Мария А.');

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'ВЫБРАТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Назначить тренировку' })).toHaveCount(0);
});

test('календарь тренера использует тот же плюс и выбор ученика', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/student/calendar');
  await expect(page.getByRole('button', { name: /Назначить тренировку на/ })).toHaveCount(0);

  await page.goto('/#/trainer/calendar');
  const todayMarker = page.locator('.calendar-grid button[aria-current="date"] > i');
  await expect(todayMarker).toHaveCount(1);
  await expect(todayMarker).toHaveText('');
  await expect(todayMarker).not.toHaveClass(/multiple/);
  const assignButton = page.getByRole('button', { name: /Назначить тренировку на/ });
  await expect(assignButton).toHaveClass(/schedule-add-button/);
  const buttonBox = await assignButton.boundingBox();
  expect(Math.round(buttonBox?.width ?? 0)).toBe(44);
  expect(Math.round(buttonBox?.height ?? 0)).toBe(44);
  await assignButton.click();

  const studentDialog = page.getByRole('dialog', { name: /Кого назначить/ });
  await expect(studentDialog).toBeVisible();
  await studentDialog.getByRole('button', { name: /Мария А\./ }).click();
  await expect(page).toHaveURL(/#\/trainer\/schedule\/\d{4}-\d{2}-\d{2}\/maria$/);
});

test('переключение месяца выбирает первый день и переход по внешней дате меняет месяц', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/calendar');

  const calendar = page.locator('.calendar-card').first();
  const initialMonth = await calendar.locator('.calendar-toolbar h2').textContent();
  await calendar.getByRole('button', { name: 'Следующий месяц' }).click();

  await expect(calendar.locator('.calendar-toolbar h2')).not.toHaveText(initialMonth ?? '');
  await expect(calendar.locator('.calendar-grid button[aria-pressed="true"]')).toHaveText('1');

  const visibleMonth = await calendar.locator('.calendar-toolbar h2').textContent();
  const nextMonthOutsideDay = calendar.locator('.calendar-grid button.outside:not(:disabled)').last();
  await nextMonthOutsideDay.click();

  await expect(calendar.locator('.calendar-toolbar h2')).not.toHaveText(visibleMonth ?? '');
  await expect(calendar.locator('.calendar-grid button[aria-pressed="true"]')).toHaveCount(1);
});

test('вложенные экраны остаются у канонического раздела навигации', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
  await expect(page.locator('.bottom-nav').getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');

  await page.goto('/#/trainer/clients/maria/assign');
  await expect(page.locator('.bottom-nav').getByRole('button', { name: 'Ученики' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.bottom-nav [aria-current="page"]')).toHaveCount(1);
});

test('нижнее меню остаётся кликабельным после вложенных экранов и закрытия модалки', async ({ page }) => {
  await openFreshDemo(page);
  const bottomNav = page.locator('.bottom-nav');

  await page.getByRole('button', { name: 'Открыть настройки' }).click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await bottomNav.getByRole('button', { name: 'Календарь' }).tap();
  await expect(page).toHaveURL(/#\/trainer\/calendar$/);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await bottomNav.getByRole('button', { name: 'Ученики' }).tap();
    await expect(page).toHaveURL(/#\/trainer\/clients$/);
    await expect(bottomNav.getByRole('button', { name: 'Ученики' })).toHaveAttribute('aria-current', 'page');

    await bottomNav.getByRole('button', { name: 'Главная' }).tap();
    await expect(page).toHaveURL(/#\/trainer$/);
    await expect(bottomNav.getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');

    await bottomNav.getByRole('button', { name: 'Календарь' }).tap();
    await expect(page).toHaveURL(/#\/trainer\/calendar$/);
    await expect(bottomNav.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
  }

  await page.goto('/#/trainer/clients/artem/subscription');
  await bottomNav.getByRole('button', { name: 'Ученики' }).tap();
  await expect(page).toHaveURL(/#\/trainer\/clients$/);
});

test('устаревшие маршруты общих тренировок больше не открываются', async ({ page }) => {
  await openFreshDemo(page);

  for (const route of ['/trainer/workouts', '/trainer/workouts/push-day', '/trainer/workouts/push-day/edit']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
    await expect(page.locator('.bottom-nav [aria-current="page"]')).toHaveCount(0);
  }
});

test('повтор завершённой тренировки из расписания использует фактические результаты', async ({ page }) => {
  await openFreshDemo(page);
  const targetDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await page.goto(`/#/trainer/schedule/${targetDate}/artem`);

  const completedWorkout = page.locator('.schedule-history-list .workout-history-row').filter({ hasText: 'Завершена' }).first();
  await expect(completedWorkout).toBeVisible();
  await completedWorkout.click();

  const firstSet = page.locator('.plan-exercise-card').first().locator('.plan-set-card').first();
  await expect(firstSet.getByLabel('КГ')).toHaveValue('70');
  await expect(firstSet.getByLabel('ПОВТОРЫ')).toHaveValue('10');
});

test('тренер повторяет назначение тому же ученику', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today');
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
  await page.getByRole('button', { name: 'Назначить тренировку' }).click();

  await expect(page).toHaveURL(/#\/trainer\/assignments\/assignment-/);
  await expect(page.getByText('Скопировано из предыдущей тренировки этого ученика')).toHaveCount(0);
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('82.5 кг × 8');
  await expect(page.getByText('Держи лопатки сведёнными')).toBeVisible();
});

test('редактирование одной назначенной тренировки не меняет другую', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  await setFirstExerciseWeight(page, 95);
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('95 кг × 8');

  await page.goto('/#/trainer/assignments/assignment-maria-push-1');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('80 кг × 8');
});

test('создание, копирование, редактирование и повтор используют единый редактор плана', async ({ page }) => {
  await openFreshDemo(page);

  for (const route of [
    '/trainer/clients/maria/assign/new',
    '/trainer/clients/maria/assign/copy/assignment-maria-legs',
    '/trainer/assignments/assignment-artem-push-today/edit',
    '/trainer/assignments/assignment-artem-push-today/repeat',
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main[data-workout-composer]')).toHaveCount(1);
    await expect(page.locator('.workout-plan-editor')).toHaveCount(1);
    await expect(page.locator('.plan-submit-actions .primary-button')).toHaveCount(1);
  }
});

test('в редакторе можно удалить последнее упражнение и снова начать с пустого плана', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/maria/assign/new');
  await page.getByLabel('Название тренировки').fill('Новая тренировка');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
  await picker.getByRole('button', { name: 'Готово' }).click();

  const card = page.locator('.plan-exercise-card').first();
  await card.getByRole('button', { name: 'Действия — Жим лёжа' }).click();
  const deleteExercise = page.getByRole('dialog', { name: 'Действия — Жим лёжа' }).getByRole('button', { name: 'Удалить упражнение' });
  await expect(deleteExercise).toBeEnabled();
  await deleteExercise.click();
  await expect(page.locator('.plan-exercise-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить упражнение' })).toBeVisible();
});


test('редактирование назначения не создаёт скрытые заготовки', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-artem-push-today/edit');
  await setFirstExerciseWeight(page, 85);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('status')).toContainText('Назначение сохранено');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0') || '{}'));
  expect(saved).not.toHaveProperty('workouts');
  expect(saved).not.toHaveProperty('studentWorkoutVersions');
  expect(saved.assignments.find((assignment: { id: string }) => assignment.id === 'assignment-artem-push-today')).not.toHaveProperty('source');
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
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria\/assign\/copy\/assignment-/);
  await expect(page.getByRole('heading', { name: 'ПОВТОРИТЬ ТРЕНИРОВКУ' })).toBeVisible();
  await expect(page.locator('.assignment-edit-person strong')).toHaveText('Мария А.');
  const firstExercise = page.locator('.plan-exercise-card').first();
  await expect(firstExercise).toHaveAttribute('data-exercise-card', 'plan');

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

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await expect(page.getByRole('dialog', { name: 'Добавить упражнения' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();

  await setFirstExerciseWeight(page, 62.5);
  await page.getByRole('button', { name: 'Назначить тренировку' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect(page.getByRole('status')).toContainText('Тренировка назначена: Мария А.');
  const assigned = page.locator('.profile-schedule .workout-row').filter({ hasText: 'Грудь и плечи' }).first();
  await assigned.click();
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('62.5 кг × 8');
});

test('новая тренировка сохраняется только в назначении ученика', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/clients/maria/assign');
  expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('шаблон');
  await page.getByRole('button', { name: 'Создать тренировку' }).click();
  await page.getByLabel('Название тренировки').fill('Персональная тренировка Марии');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const exercisePicker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await exercisePicker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
  await expect(exercisePicker).toBeVisible();
  await exercisePicker.getByRole('button', { name: 'Добавить Жим гантелей на наклонной скамье' }).click();
  await expect(exercisePicker.getByText('В тренировке: 2')).toBeVisible();
  await exercisePicker.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.plan-exercise-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Назначить тренировку' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0') || '{}'));
  expect(saved).not.toHaveProperty('workouts');
  expect(saved).not.toHaveProperty('studentWorkoutVersions');
  expect(saved.assignments.at(-1).workoutSnapshot.name).toBe('Персональная тренировка Марии');
  expect(saved.assignments.at(-1)).not.toHaveProperty('workoutId');
  expect(saved.assignments.at(-1)).not.toHaveProperty('source');
});

test('упражнение можно добавить повторно и убрать из окна выбора', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/maria/assign/new');
  await page.getByLabel('Название тренировки').fill('Круговая тренировка');
  await expect(page.locator('.plan-submit-actions')).toHaveCSS('position', 'static');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  const add = picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true });
  const remove = picker.getByRole('button', { name: 'Убрать Жим лёжа', exact: true });
  const addBox = await add.boundingBox();
  const removeBox = await remove.boundingBox();
  for (const box of [addBox, removeBox]) {
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(add).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.08)');
  await expect(add).toHaveCSS('color', 'rgb(183, 232, 90)');
  await add.click();
  await add.click();
  await expect(picker.getByRole('group', { name: 'Жим лёжа', exact: true })).toContainText('2');
  await expect(page.locator('.plan-exercise-card')).toHaveCount(2);
  await remove.click();
  await expect(picker.getByRole('group', { name: 'Жим лёжа', exact: true })).toContainText('1');
  await picker.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.plan-exercise-card')).toHaveCount(1);
  await expect(page.locator('.plan-exercise-card .set-card')).toHaveCount(1);
  const submit = page.getByRole('button', { name: 'Назначить тренировку' });
  await submit.scrollIntoViewIfNeeded();
  const submitBox = await submit.boundingBox();
  const floatingBox = await page.getByRole('button', { name: 'Добавить упражнение' }).boundingBox();
  expect(submitBox && floatingBox && submitBox.x + submitBox.width).toBeLessThanOrEqual(floatingBox?.x ?? 0);
});

test('онлайн-тренировка переиспользует назначение, инструкцию и списание абонемента', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/artem/assign/new');
  await page.getByLabel('Название тренировки').fill('Онлайн-техника');
  await page.getByRole('button', { name: 'Онлайн', exact: true }).click();

  await expect(page.getByRole('group', { name: 'Рекомендованная дата тренировки' })).toBeVisible();
  await expect(page.locator('.plan-context-card input[type="time"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
  await picker.getByRole('button', { name: 'Готово' }).click();

  const exercise = page.locator('.plan-exercise-card').first();
  await exercise.getByRole('button', { name: 'Как выполнять — Жим лёжа' }).click();
  const instruction = page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' });
  await instruction.getByPlaceholder('Опиши исходное положение, движение, дыхание и требования к технике').fill('Сведи лопатки, упрись стопами в пол и опускай гриф под контролем.');
  await instruction.locator('input[type="file"]').setInputFiles({
    name: 'bench-technique.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]),
  });
  await expect(instruction.locator('video')).toBeVisible();
  await instruction.getByRole('button', { name: 'Сохранить инструкцию' }).click();
  await expect(instruction).toHaveCount(0);
  await page.screenshot({ path: 'test-results/online-assignment-editor.png', animations: 'disabled' });

  await page.getByRole('button', { name: 'Назначить тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0') || '{}'));
  const assignment = saved.assignments.at(-1);
  expect(assignment.format).toBe('online');
  expect(assignment).not.toHaveProperty('scheduledTime');
  expect(assignment.workoutSnapshot.exercises[0].instructionText).toContain('Сведи лопатки');
  expect(assignment.workoutSnapshot.exercises[0].instructionVideo.name).toBe('bench-technique.mp4');

  await page.goto(`/#/trainer/assignments/${assignment.id}`);
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить на другую дату' }).click();
  await expect(page.getByRole('button', { name: 'Онлайн', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.plan-context-card input[type="time"]')).toHaveCount(0);
  await page.locator('.plan-exercise-card').first().getByRole('button', { name: 'Как выполнять — Жим лёжа' }).click();
  const repeatedInstruction = page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' });
  await expect(repeatedInstruction.getByPlaceholder('Опиши исходное положение, движение, дыхание и требования к технике')).toHaveValue(/Сведи лопатки/);
  await expect(repeatedInstruction.locator('video')).toBeVisible();
  await repeatedInstruction.getByRole('button', { name: 'Закрыть описание' }).click();

  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
  await page.goto(`/#/student/assignments/${assignment.id}`);
  await expect(page.locator('.student-assignment-schedule')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Предложить другое время' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/online-student-assignment.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Как выполнять — Жим лёжа' }).click();
  const studentInstruction = page.getByRole('dialog', { name: 'Как выполнять — Жим лёжа' });
  await expect(studentInstruction).toContainText('Сведи лопатки');
  await expect(studentInstruction.locator('video')).toBeVisible();
  await expect(studentInstruction.getByRole('button', { name: 'Сохранить инструкцию' })).toHaveCount(0);
  await studentInstruction.getByRole('button', { name: 'Закрыть описание' }).click();

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('dialog', { name: 'Завершение тренировки' }).getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('button', { name: /Хорошо.*Рабочий темп/ }).click();
  await page.getByRole('button', { name: 'Сохранить результат' }).click();
  await expect(page.getByText('Осталось 10 занятий')).toBeVisible();
});

test('несколько упражнений быстро добавляются на экране шириной 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openFreshDemo(page);
  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  const done = picker.getByRole('button', { name: 'Готово' });
  expect(await done.evaluate((button) => button.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);

  await picker.getByRole('button', { name: 'Добавить Жим лёжа', exact: true }).click();
  await picker.getByRole('button', { name: 'Добавить Жим гантелей на наклонной скамье' }).click();
  await expect(picker.getByText('В тренировке: 5')).toBeVisible();
  await done.click();

  await expect(page.locator('.active-exercise-card')).toHaveCount(5);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(320);
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

  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
  await expect(page.getByLabel('Остаток абонемента')).toContainText('Осталось 17 занятий');
  await page.goto('/#/student/profile');
  await expect(page.getByLabel('Абонемент')).toContainText('Осталось 17 занятий');
  await expect(page.getByLabel('Последние пополнения')).toContainText('12 000 ₽ · наличные');
});

test('выход из истории абонемента не зацикливается между историей и платежом', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/artem');
  await page.getByLabel('Абонемент').getByRole('button', { name: 'История' }).click();
  await page.locator('.subscription-entry-list > button').first().click();
  await page.getByLabel(/Комментарий/).fill('Проверка истории');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/artem\/subscription$/);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
  await expect(page.getByLabel('Абонемент')).toBeVisible();

  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients$/);
  await expect(page.getByRole('button', { name: 'Пригласить ученика' })).toBeVisible();
  await expect(page.locator('.client-card')).toHaveCount(3);
});

test('тренер удаляет отдельное пополнение или весь абонемент без удаления тренировок', async ({ page }) => {
  await openFreshDemo(page);
  await page.goto('/#/trainer/clients/artem/subscription');

  const paymentRows = page.locator('.subscription-entry-list > button');
  const paymentsBefore = await paymentRows.count();
  expect(paymentsBefore).toBeGreaterThan(1);
  await paymentRows.first().click();
  await page.getByRole('button', { name: 'Удалить это пополнение' }).click();
  const paymentDialog = page.getByRole('alertdialog', { name: 'Удалить пополнение?' });
  await expect(paymentDialog).toContainText('Списания тренировок сохранятся');
  await paymentDialog.getByRole('button', { name: 'Удалить пополнение' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/artem\/subscription$/);
  await expect(paymentRows).toHaveCount(paymentsBefore - 1);
  const dangerZone = page.getByLabel('Удаление абонемента');
  await expect(dangerZone).toContainText('Тренировки и результаты ученика останутся на месте');
  await dangerZone.getByRole('button', { name: 'Удалить полностью' }).click();
  const subscriptionDialog = page.getByRole('alertdialog', { name: 'Удалить абонемент полностью?' });
  await expect(subscriptionDialog).toContainText('Тренировки и их результаты сохранятся');
  await subscriptionDialog.getByRole('button', { name: 'Удалить абонемент' }).click();

  await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
  await expect(page.getByLabel('Абонемент')).toContainText('Абонемент не добавлен');
  await expect(page.getByRole('heading', { name: 'Последняя активность' })).toBeVisible();
});

test('главная ученика не показывает отсутствующий абонемент, но профиль его показывает', async ({ page }) => {
  await openFreshDemo(page);
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('reppy-demo-v0');
    if (!raw) throw new Error('Demo state is missing');
    const state = JSON.parse(raw);
    state.activeStudentId = 'maria';
    window.localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });

  await page.goto('/#/student');
  await page.reload();
  await expect(page.getByLabel('Остаток абонемента')).toHaveCount(0);
  await expect(page.getByText('Абонемент не добавлен')).toHaveCount(0);

  await page.goto('/#/student/profile');
  await expect(page.getByLabel('Абонемент')).toContainText('Абонемент не добавлен');
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
  await finishDialog.getByRole('button', { name: 'Завершить и списать занятие' }).click();

  await expect(page).toHaveURL(/#\/trainer\/sessions\/session-/);
  await expect(page.getByText('Одно занятие списано')).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByText('1 занятие в долг', { exact: true })).toBeVisible();
});

test('результат ученика виден тренеру и не меняется вместе с назначением', async ({ page }) => {
  await openFreshDemo(page);

  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
  await expect(page).toHaveURL(/#\/student$/);
  await expect(page.getByLabel('Остаток абонемента')).toContainText('Осталось 11 занятий');
  await page.getByRole('button', { name: 'Посмотреть тренировку' }).click();
  await expect(page).toHaveURL(/#\/student\/assignments\/assignment-artem-push-today$/);
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Жим лёжа' })).toBeVisible();
  await expect(page.locator('.active-exercise-card')).toHaveCount(3);
  await expect(page.locator('[data-exercise-card="active"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Жим гантелей на наклонной скамье' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Следующее упражнение' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  const studentFinishDialog = page.getByRole('dialog', { name: 'Завершение тренировки' });
  await expect(studentFinishDialog).toHaveCount(1);
  await expect(studentFinishDialog).toHaveAttribute('data-modal-frame', 'sheet');
  await expect(studentFinishDialog).toContainText('Есть незавершённые подходы');
  await studentFinishDialog.getByRole('button', { name: 'Завершить тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'КАК ПРОШЛО?' })).toBeVisible();
  await page.getByRole('button', { name: /Хорошо.*Рабочий темп/ }).click();
  await page.getByLabel(/Комментарий тренеру/).fill('Тестовый результат ученика');
  await page.getByRole('button', { name: 'Сохранить результат' }).click();
  await expect(page.getByRole('heading')).toHaveText(/ТРЕНИРОВКА\s*ЗАВЕРШЕНА/);
  await expect(page.getByText('Осталось 10 занятий')).toBeVisible();

  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByRole('button', { name: 'Переключиться в роль тренера' }).click();

  await page.evaluate(() => {
    const raw = localStorage.getItem('reppy-demo-v0');
    if (!raw) throw new Error('Демо-состояние не было сохранено');
    const state = JSON.parse(raw);
    const assignment = state.assignments.find((item: { id: string }) => item.id === 'assignment-artem-push-today');
    assignment.workoutSnapshot.exercises[0].plannedSets[0].targetWeight = 95;
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.reload();

  await page.goto('/#/trainer/clients/artem');
  const result = page.locator('.session-row').first();
  await expect(result).toContainText('Грудь и плечи');
  await expect(result).toContainText('Хорошо');
  await result.click();

  await expect(page.getByText('Тестовый результат ученика')).toBeVisible();
  await expect(page.locator('.session-summary dt')).toHaveCount(3);
  await expect(page.locator('.session-summary > div').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.result-exercises article').first()).toContainText('80 кг × 8');
});
test('тренер ведёт занятие, правит его в моменте и удаляет завершённый результат', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.locator('.active-exercise-card')).toHaveCount(3);
  await expect(page.getByRole('progressbar', { name: 'Прогресс тренировки' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.save-state[role="status"]')).toHaveText('Сохранено');
  await expect(page.getByRole('button', { name: 'Редактировать тренировку' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Завершить тренировку' })).toHaveCSS('background-color', 'rgb(183, 232, 90)');
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
    squatCard.getByRole('button', { name: 'Опустить Приседания ниже' }),
    squatCard.getByRole('button', { name: 'Как выполнять — Приседания' }),
    squatCard.getByRole('button', { name: 'Действия — Приседания' }),
  ].map(async (control) => (await control.boundingBox())?.height));
  expect(new Set(controlHeights).size).toBe(1);
  const commentBox = await squatCard.getByRole('button', { name: 'Добавить комментарий' }).boundingBox();
  const setsBox = await squatCard.getByRole('group', { name: 'Подходы — Приседания' }).boundingBox();
  expect(commentBox && setsBox && Math.abs(commentBox.y - setsBox.y)).toBeLessThanOrEqual(2);
  expect(setsBox && commentBox && setsBox.x - (commentBox.x + commentBox.width)).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole('button', { name: 'Добавить упражнение' })).toBeVisible();
  await expect(squatCard.locator('.active-comment-field')).toHaveCount(0);
  await squatCard.getByRole('button', { name: 'Добавить комментарий' }).click();
  const commentField = squatCard.locator('.active-comment-field textarea');
  await expect(commentField).toBeFocused();
  await commentField.fill('Колени держи по линии стоп');
  await expect(squatCard.getByRole('button', { name: 'Скрыть комментарий' })).toBeVisible();
  await squatCard.getByRole('button', { name: 'Скрыть комментарий' }).click();
  await expect(squatCard.locator('.active-comment-field')).toHaveCount(0);
  await expect(squatCard.getByRole('button', { name: 'Показать комментарий' })).toBeVisible();

  await expect(squatCard.locator('.set-card')).toHaveCount(4);
  await expect(squatCard.locator('.set-count-control > strong')).toHaveCount(0);
  await expect(squatCard.getByRole('checkbox', { name: 'Выполнено' })).toHaveCount(0);
  for (const controlName of ['Удалить последний подход — Приседания', 'Добавить подход — Приседания']) {
    const box = await squatCard.getByRole('button', { name: controlName }).boundingBox();
    expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
  await squatCard.getByRole('button', { name: 'Добавить подход — Приседания' }).click();
  await squatCard.getByRole('button', { name: 'Как выполнять — Приседания' }).click();
  const instructionDialog = page.getByRole('dialog', { name: 'Как выполнять — Приседания' });
  await expect(instructionDialog).toBeVisible();
  await expect(instructionDialog).toContainText('Добавь короткое видео с техникой');
  await expect(instructionDialog.getByPlaceholder('Опиши исходное положение, движение, дыхание и требования к технике')).toBeVisible();
  await expect(instructionDialog).toContainText('ОБОРУДОВАНИЕ');
  await expect(instructionDialog).toContainText('Штанга');
  await instructionDialog.getByRole('button', { name: 'Закрыть описание' }).click();

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await expect(page.locator('.exercise-picker-sheet .search-input')).toHaveCSS('font-size', '16px');
  await expect(page.getByRole('searchbox', { name: 'Поиск упражнений' })).toBeVisible();
  await page.getByRole('button', { name: 'Бицепс', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить Молотковые сгибания' }).click();
  const multiPicker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await expect(multiPicker).toBeVisible();
  expect(await multiPicker.getByRole('button', { name: 'Готово' }).evaluate((button) => button.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  await multiPicker.getByRole('button', { name: 'Добавить Сгибание рук с гантелями' }).click();
  await expect(multiPicker.getByText('В тренировке: 5')).toBeVisible();
  await multiPicker.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.active-exercise-card')).toHaveCount(5);
  await expect(page.locator('.active-exercise-card').nth(3)).toContainText('Молотковые сгибания');
  await expect(page.locator('.active-exercise-card').nth(4)).toContainText('Сгибание рук с гантелями');
  await expect(page.locator('.active-exercise-card').nth(4)).toHaveClass(/recently-moved/);
  await page.getByRole('button', { name: 'Опустить Молотковые сгибания ниже' }).click();
  await expect(page.locator('.active-exercise-card').nth(4)).toContainText('Молотковые сгибания');
  await expect(page.locator('.active-exercise-card').nth(4)).toHaveClass(/recently-moved/);

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await page.locator('.exercise-picker-sheet .search-input').fill('Тяга полотенца');
  await page.getByRole('button', { name: 'Добавить «Тяга полотенца»' }).click();
  await page.getByRole('dialog', { name: 'Добавить упражнения' }).getByRole('button', { name: 'Готово' }).click();
  const customCard = page.locator('.active-exercise-card').filter({ hasText: 'Тяга полотенца' });
  await expect(customCard).toBeVisible();
  await expect(customCard.getByText('Пользовательское упражнение')).toBeVisible();
  await expect(customCard).toHaveClass(/recently-moved/);
  await expect(customCard.locator('.set-card')).toHaveCount(1);
  await customCard.getByRole('button', { name: 'Добавить подход — Тяга полотенца' }).click();
  await expect(customCard.locator('.set-card')).toHaveCount(2);
  await customCard.getByRole('button', { name: 'Удалить последний подход — Тяга полотенца' }).click();
  await expect(customCard.locator('.set-card')).toHaveCount(1);

  await customCard.getByRole('button', { name: 'Действия — Тяга полотенца' }).click();
  let actionsDialog = page.getByRole('dialog', { name: 'Действия — Тяга полотенца' });
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

  await page.getByRole('button', { name: 'Удалить тренировку' }).click();
  const deleteDialog = page.getByRole('alertdialog');
  await expect(deleteDialog).toContainText('Тренировка и её результат будут удалены');
  await deleteDialog.getByRole('button', { name: 'Удалить тренировку' }).click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect(page.getByRole('status')).toContainText('Завершённая тренировка удалена');
});

test('упражнение со своим весом не показывает килограммы в плане', async ({ page }) => {
  await openFreshDemo(page);

  await page.goto('/#/trainer/clients/maria/assign/new');
  await page.getByLabel('Название тренировки').fill('Тренировка со своим весом');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const initialPicker = page.getByRole('dialog', { name: 'Добавить упражнения' });
  await initialPicker.getByRole('button', { name: 'Спина', exact: true }).click();
  await initialPicker.getByRole('button', { name: 'Добавить Подтягивания' }).click();
  await initialPicker.getByRole('button', { name: 'Готово' }).click();
  const pullUpsPlan = page.locator('.plan-exercise-card').filter({ hasText: 'Подтягивания' });
  await expect(pullUpsPlan.getByText('Спина · Свой вес')).toBeVisible();
  await expect(pullUpsPlan.getByLabel('КГ')).toHaveCount(0);
  await expect(pullUpsPlan.locator('.active-exercise-meta')).toHaveText('Спина · Свой вес');

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await page.getByRole('button', { name: 'Кор', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить Планка' }).click();
  await page.getByRole('button', { name: 'Готово' }).click();
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
      schemaVersion: number;
      workouts?: unknown[];
      assignments: Array<{ workoutId?: string; source?: string; workoutSnapshot?: { id: string } }>;
      studentWorkoutVersions?: unknown[];
    };
    const workout = structuredClone(legacy.assignments[0].workoutSnapshot!);
    legacy.schemaVersion = 4;
    legacy.workouts = [workout];
    legacy.studentWorkoutVersions = [];
    legacy.assignments[0].workoutId = workout.id;
    legacy.assignments[0].source = 'template';
    delete legacy.assignments[0].workoutSnapshot;
    window.localStorage.setItem('reppy-demo-v0', JSON.stringify(legacy));
  });

  await page.goto('/#/trainer/assignments/assignment-maria-legs');
  await page.reload();
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('Приседания');
  await expect(page.locator('.readonly-exercise-card').first()).toContainText('70 кг × 8');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('reppy-demo-v0') || '{}');
    return {
      schemaVersion: saved.schemaVersion,
      hasWorkouts: Object.hasOwn(saved, 'workouts'),
      hasVersions: Object.hasOwn(saved, 'studentWorkoutVersions'),
      hasWorkoutId: Object.hasOwn(saved.assignments[0], 'workoutId'),
      hasSource: Object.hasOwn(saved.assignments[0], 'source'),
    };
  })).toEqual({ schemaVersion: 6, hasWorkouts: false, hasVersions: false, hasWorkoutId: false, hasSource: false });
});
