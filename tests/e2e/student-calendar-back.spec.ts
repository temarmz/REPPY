import { expect, test } from '@playwright/test';

test('просмотр тренировки всегда возвращает в календарь, даже после переключения вкладок', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();

  const assignment = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('reppy-demo-v0')!);
    return data.assignments.find((item: { studentId: string; status: string }) =>
      item.studentId === data.activeStudentId && item.status === 'assigned');
  }) as { id: string; scheduledFor: string };
  expect(assignment).toBeTruthy();
  await page.evaluate((day) => sessionStorage.setItem('reppy-ui:calendar-day:student', day), assignment.scheduledFor);

  const nav = page.locator('.bottom-nav');
  await nav.getByRole('button', { name: 'Календарь' }).tap();
  await page.locator('.agenda-list > button').first().tap();
  await expect(page).toHaveURL(/#\/student\/calendar\/assignments\/[^/]+$/);
  await page.getByRole('button', { name: 'Назад' }).tap();
  await expect(page).toHaveURL(/#\/student\/calendar$/);

  await page.locator('.agenda-list > button').first().tap();
  await page.evaluate(() => document.addEventListener('click', (event) => {
    if ((event.target as Element).closest('.back-button')) event.stopImmediatePropagation();
  }, true));
  await page.getByRole('button', { name: 'Назад' }).tap();
  await expect(page).toHaveURL(/#\/student\/calendar$/);

  await page.locator('.agenda-list > button').first().tap();
  await nav.getByRole('button', { name: 'Профиль' }).tap();
  await nav.getByRole('button', { name: 'Календарь' }).tap();
  await expect(page).toHaveURL(/#\/student\/calendar\/assignments\/[^/]+$/);
  await page.getByRole('button', { name: 'Назад' }).tap();
  await expect(page).toHaveURL(/#\/student\/calendar$/);

  await page.goto(`/#/student/calendar/assignments/${assignment.id}`);
  await page.getByRole('button', { name: 'Назад' }).tap();
  await expect(page).toHaveURL(/#\/student\/calendar$/);
});
