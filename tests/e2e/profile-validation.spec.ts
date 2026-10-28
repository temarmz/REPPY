import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

test('malformed numeric fields in a restored profile draft cannot crash the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  const original = await page.evaluate(() => {
    const student = JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem');
    localStorage.setItem('reppy-ui:draft:athlete:artem:compact', JSON.stringify({ savedAt: Date.now(), value: {
      expanded: true, editing: true, height: 181, weight: { value: 82.5 }, gender: 'male', phone: '', contraindications: 'Draft remains usable',
    } }));
    return student;
  });
  await page.goto('/#/trainer/clients/artem');
  const form = page.locator('.athlete-form');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Рост, см')).toHaveValue(original.height ? String(original.height) : '');
  await expect(form.getByLabel('Вес, кг')).toHaveValue(original.weight ? String(original.weight) : '');
  await form.getByRole('button', { name: 'Сохранить данные' }).click();
  await expect(form).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  for (const role of ['trainer', 'student'] as const) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`profile metric validation: ${theme}, ${role}, ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
        if (theme === 'light') await profileAction(page, 'Включить светлую тему');
        if (role === 'student') await profileAction(page, 'Переключиться в роль ученика');
        await page.goto(role === 'trainer' ? '/#/trainer/clients/artem' : '/#/student/profile');
        const edit = role === 'trainer' ? page.getByRole('button', { name: 'Редактировать данные ученика' })
          : page.locator('.athlete-heading-edit');
        await edit.click();
        const form = page.locator('.athlete-form');
        const heightInput = form.getByLabel('Рост, см');
        const weightInput = form.getByLabel('Вес, кг');
        const original = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem'));
        const comment = 'Ограничение для проверки длинного текста. '.repeat(20).slice(0, 800);
        await form.getByLabel('Противопоказания и особенности', { exact: false }).fill(comment);

        for (const invalid of [{ height: '0', weight: '75.2', error: 'Укажи рост от 50 до 260 см.' },
          { height: '261', weight: '75.2', error: 'Укажи рост от 50 до 260 см.' },
          { height: '182.5', weight: '19.9', error: 'Укажи вес от 20 до 500 кг.' },
          { height: '182.5', weight: '501', error: 'Укажи вес от 20 до 500 кг.' }]) {
          await heightInput.fill(invalid.height);
          await weightInput.fill(invalid.weight);
          await form.getByRole('button', { name: 'Сохранить данные' }).click();
          await expect(form).toBeVisible();
          await expect(form.getByRole('alert')).toHaveText(invalid.error);
          await expect(form.getByLabel('Противопоказания и особенности', { exact: false })).toHaveValue(comment);
          await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem'))).toEqual(original);
        }
        await page.screenshot({ path: testInfo.outputPath('metric-error.png'), animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await heightInput.fill('182.5');
        await weightInput.fill('75.2');
        await expect(form.getByRole('alert')).toHaveCount(0);
        await form.getByRole('button', { name: 'Сохранить данные' }).click();
        await expect(form).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => {
          const student = JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem');
          return { height: student.height, weight: student.weight, comment: student.contraindications };
        })).toEqual({ height: 182.5, weight: 75.2, comment });
        await edit.click();
        await heightInput.fill('');
        await weightInput.fill('');
        await form.getByRole('button', { name: 'Сохранить данные' }).click();
        await expect(form).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => {
          const student = JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem');
          return [student.height ?? null, student.weight ?? null];
        })).toEqual([null, null]);
      });
    }
  }
}
