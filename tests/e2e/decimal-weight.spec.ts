import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

const assignmentId = 'assignment-artem-push-today';
for (const theme of ['dark', 'light'] as const) {
  for (const mode of ['plan', 'trainer', 'student'] as const) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
      test(`decimal weight: ${theme}, ${mode}, ${width}x${height}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
        if (theme === 'light') await profileAction(page, 'Включить светлую тему');
        if (mode === 'student') await profileAction(page, 'Переключиться в роль ученика');
        const route = mode === 'plan' ? `/trainer/assignments/${assignmentId}/edit` : `/${mode}/workout/${assignmentId}`;
        await page.goto(`/#${route}`);
        const card = page.locator('[data-route-active="true"] .active-exercise-card').first();
        const weight = card.getByLabel('КГ').first();
        const reps = card.getByLabel('ПОВТОРЫ').first();
        await expect(weight).toHaveAttribute('inputmode', 'decimal');
        await weight.fill('7,25');
        await weight.press('Tab');
        await page.screenshot({ path: testInfo.outputPath('comma-weight.png'), animations: 'disabled' });
        await expect(weight).toHaveValue('7.25');

        await weight.fill('');
        await weight.pressSequentially('12,75');
        await weight.press('Enter');
        await expect(weight).toHaveValue('12.75');
        await weight.fill('31.25');
        await weight.press('Enter');
        await expect(weight).toHaveValue('31.25');
        await weight.fill('');
        await weight.press('Tab');
        await expect(weight).toHaveValue('');
        await reps.fill('8');
        await reps.press('Enter');
        await weight.fill('47,5');
        await expect.poll(() => page.evaluate(({ assignmentId, mode, route }) => {
          if (mode === 'plan') return JSON.parse(localStorage.getItem(`reppy-ui:workout-draft:${route}`)!).value.exercises[0].plannedSets[0].targetWeight;
          const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
          return data.sessions.find((item: { assignmentId: string; completedAt?: string }) => item.assignmentId === assignmentId && !item.completedAt).results[0].actualWeight;
        }, { assignmentId, mode, route })).toBe(47.5);
        await expect(weight).toBeFocused();
        if (mode === 'plan') {
          await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
          await expect(page).not.toHaveURL(new RegExp(`${assignmentId}/edit$`));
        } else {
          await card.getByRole('button', { name: /Завершить подход 1/ }).click();
          await expect(card.locator('.set-card.completed')).toHaveCount(1);
        }
        await expect.poll(() => page.evaluate(({ assignmentId, mode }) => {
          const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
          if (mode === 'plan') return data.assignments.find((item: { id: string }) => item.id === assignmentId).workoutSnapshot.exercises[0].plannedSets[0].targetWeight;
          return data.sessions.find((item: { assignmentId: string; completedAt?: string }) => item.assignmentId === assignmentId && !item.completedAt).results[0].actualWeight;
        }, { assignmentId, mode })).toBe(47.5);
        await page.goto(`/#${route}`);
        await page.reload();
        await expect(weight).toHaveValue('47.5');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
