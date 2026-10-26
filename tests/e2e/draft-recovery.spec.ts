import { expect, test } from '@playwright/test';

const assignmentId = 'assignment-artem-push-today';
const sizes = [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]];

for (const theme of ['dark', 'light'] as const) {
  for (const [index, [width, height]] of sizes.entries()) {
    test(`workout draft recovery: ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
      if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
      const route = `/trainer/assignments/${assignmentId}/edit`;
      await page.goto(`/#${route}`);
      const cards = page.locator('[data-route-active="true"] .plan-exercise-card');
      const weight = cards.first().getByLabel('КГ').first();
      await weight.fill('7.25');
      await weight.press('Tab');
      const corruption = await page.evaluate(({ route, assignmentId, index }) => {
        const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
        const source = data.assignments.find((item: { id: string }) => item.id === assignmentId);
        const key = `reppy-ui:workout-draft:${route}`;
        const draft = JSON.parse(localStorage.getItem(key)!);
        if (index === 0) draft.value.exercises = {};
        else if (index === 1) draft.value.name = {};
        else if (index === 2) draft.value.exercises[0].name = {};
        else if (index === 3) draft.value.scheduledFor = 'not-a-date';
        else draft.value.exercises = [null];
        return { source, key, raw: JSON.stringify(draft) };
      }, { route, assignmentId, index });
      const original = corruption.source;
      await page.addInitScript(({ key, raw }) => {
        if (sessionStorage.getItem('reppy-qa:workout-corruption-injected')) return;
        localStorage.setItem(key, raw);
        sessionStorage.setItem('reppy-qa:workout-corruption-injected', 'true');
      }, corruption);
      await page.reload();
      await page.waitForTimeout(750);
      await page.screenshot({ path: testInfo.outputPath('workout-recovered.png'), animations: 'disabled' });
      await testInfo.attach('page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
      await expect(cards).toHaveCount(original.workoutSnapshot.exercises.length);
      await expect(weight).toHaveValue(String(original.workoutSnapshot.exercises[0].plannedSets[0].targetWeight));
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.find((item: { id: string }) => item.id === id), assignmentId)).toEqual(original);
      await weight.fill('12.5');
      await weight.press('Tab');
      await page.reload();
      await expect(weight).toHaveValue('12.5');
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      const expected = structuredClone(original);
      expected.workoutSnapshot.exercises[0].plannedSets[0].targetWeight = 12.5;
      await expect.poll(() => page.evaluate(id => {
        const assignment = JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.find((item: { id: string }) => item.id === id);
        return assignment.workoutSnapshot.exercises;
      }, assignmentId)).toEqual(expected.workoutSnapshot.exercises);
      expect(errors).toEqual([]);
    });
  }

  for (const mode of ['plan', 'trainer', 'student'] as const) {
    for (const [width, height] of sizes) {
      test(`picker draft recovery: ${theme}, ${mode}, ${width}x${height}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
        if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
        if (mode === 'student') await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
        const route = mode === 'plan' ? `/trainer/assignments/${assignmentId}/edit` : `/${mode}/workout/${assignmentId}`;
        await page.goto(`/#${route}`);
        const cards = page.locator('[data-route-active="true"] .active-exercise-card');
        await expect(cards.first()).toBeVisible();
        const count = await cards.count();
        const original = await page.evaluate(({ route, mode }) => {
          const key = `reppy-ui:draft:picker:${mode === 'plan' ? '' : 'active:'}${route}`;
          localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value: { search: {}, selectedMuscle: 'all',
            customLoadMode: 'external', customMeasureType: 'reps', customMuscleGroups: {} } }));
          return localStorage.getItem('reppy-demo-v0');
        }, { route, mode });
        await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
        await page.waitForTimeout(750);
        await page.screenshot({ path: testInfo.outputPath('picker-recovered.png'), animations: 'disabled' });
        await testInfo.attach('page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
        const picker = page.getByRole('dialog', { name: 'Добавить упражнения' });
        await expect(picker).toBeVisible();
        const search = picker.getByRole('searchbox', { name: 'Поиск упражнений' });
        await expect(search).toHaveValue('');
        expect(await page.evaluate(() => localStorage.getItem('reppy-demo-v0'))).toBe(original);
        await search.fill('Планка');
        await picker.getByRole('button', { name: 'Добавить Планка', exact: true }).click();
        await picker.getByRole('button', { name: 'Готово', exact: true }).click();
        await expect(cards).toHaveCount(count + 1);
        await page.reload();
        await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
        await expect(search).toHaveValue('Планка');
        await picker.getByRole('button', { name: 'Готово', exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
