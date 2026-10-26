import { expect, test } from '@playwright/test';

const assignmentId = 'assignment-artem-push-today';
const sessionId = 'session-artem-legs-history-5';
const editorRoute = `/trainer/assignments/${assignmentId}/edit`;

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[320, 568], [390, 844], [440, 844], [844, 320], [1280, 800]]) {
    for (const form of ['invite', 'profile', 'payment', 'reschedule', 'feedback', 'instruction'] as const) {
      test(`form draft recovery: ${form}, ${theme}, ${width}x${height}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
        if (theme === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
        if (form === 'reschedule' || form === 'feedback') await page.getByRole('button', { name: 'Переключиться в роль ученика' }).click();
        const source = await page.evaluate(({ form, assignmentId, sessionId, editorRoute }) => {
          const original = localStorage.getItem('reppy-demo-v0');
          const data = JSON.parse(original!);
          const exercise = data.assignments.find((item: { id: string }) => item.id === assignmentId).workoutSnapshot.exercises[0];
          const key = form === 'invite' ? 'invite-student:demo'
            : form === 'profile' ? 'athlete:artem:compact'
              : form === 'payment' ? 'subscription:artem:new'
                : form === 'reschedule' ? `reschedule:${assignmentId}`
                  : form === 'feedback' ? `feedback:${sessionId}` : `instruction:${editorRoute}:${exercise.id}`;
          const value = form === 'invite' ? { name: {} }
            : form === 'profile' ? { expanded: true, editing: true, phone: {}, contraindications: 'Keep this valid note' }
              : form === 'payment' ? { occurredAt: 'not-a-date', comment: 'Keep this valid note' }
                : form === 'reschedule' ? { requestOpen: true, scheduledFor: {}, scheduledTime: '25:90' }
                  : form === 'feedback' ? { mood: {}, comment: {} } : { instructionText: {} };
          localStorage.setItem(`reppy-ui:draft:${key}`, JSON.stringify({ savedAt: Date.now(), value }));
          return { original, exercise, student: data.students.find((item: { id: string }) => item.id === 'artem') };
        }, { form, assignmentId, sessionId, editorRoute });
        const route = form === 'invite' ? '/trainer/clients/invite' : form === 'profile' ? '/trainer/clients/artem'
          : form === 'payment' ? '/trainer/clients/artem/subscription/new'
            : form === 'reschedule' ? `/student/assignments/${assignmentId}`
              : form === 'feedback' ? `/student/finish/${sessionId}` : editorRoute;
        await page.goto(`/#${route}`);
        if (form === 'instruction') await page.getByRole('button', { name: `Как выполнять — ${source.exercise.name}`, exact: true }).first().click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: testInfo.outputPath('recovered-form.png'), animations: 'disabled' });
        await testInfo.attach('page-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
        if (form === 'invite') {
          const name = page.getByLabel('Имя ученика');
          await expect(name).toHaveValue('');
          await name.fill('Recovered student');
          await page.reload();
          await expect(name).toHaveValue('Recovered student');
          await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
          await expect(page.getByText('Recovered student почти в команде')).toBeVisible();
          await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.filter((item: { name: string }) => item.name === 'Recovered student').length)).toBe(1);
        } else if (form === 'profile') {
          const fields = page.locator('.athlete-form');
          await expect(fields).toBeVisible();
          await expect(fields.getByLabel('Телефон')).toHaveValue(source.student.phone);
          await expect(fields.getByLabel('Противопоказания и особенности', { exact: false })).toHaveValue('Keep this valid note');
          await fields.getByRole('button', { name: 'Сохранить данные' }).click();
          await expect(fields).toHaveCount(0);
          expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).students.find((item: { id: string }) => item.id === 'artem').phone)).toBe(source.student.phone);
        } else if (form === 'payment') {
          await expect(page.getByRole('button', { name: 'Дата оплаты:', exact: false })).toBeVisible();
          await expect(page.locator('.subscription-payment-form textarea')).toHaveValue('Keep this valid note');
          await page.getByRole('button', { name: 'Добавить пополнение', exact: true }).click();
          await expect(page).toHaveURL(/#\/trainer\/clients\/artem$/);
          expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).subscriptionEntries.at(-1).comment)).toBe('Keep this valid note');
          expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).subscriptionEntries.length)).toBe(JSON.parse(source.original!).subscriptionEntries.length + 1);
        } else if (form === 'reschedule') {
          await expect(page.getByRole('button', { name: 'Новая дата:', exact: false })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Отправить тренеру', exact: true })).toBeDisabled();
          expect(await page.evaluate(() => localStorage.getItem('reppy-demo-v0'))).toBe(source.original);
        } else if (form === 'feedback') {
          const comment = page.getByLabel('Комментарий тренеру', { exact: false });
          await expect(comment).toHaveValue('');
          await expect(page.getByRole('button', { name: 'Сохранить результат', exact: true })).toBeDisabled();
          await comment.fill('Recovered feedback');
          await page.reload();
          await expect(comment).toHaveValue('Recovered feedback');
          await page.locator('.mood-grid button').first().click();
          await page.getByRole('button', { name: 'Сохранить результат', exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`/success/${sessionId}$`));
          expect(await page.evaluate(id => JSON.parse(localStorage.getItem('reppy-demo-v0')!).sessions.find((item: { id: string }) => item.id === id).comment, sessionId)).toBe('Recovered feedback');
          expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).subscriptionEntries)).toEqual(JSON.parse(source.original!).subscriptionEntries);
        } else {
          const text = page.getByLabel('Подробное описание упражнения');
          await expect(text).toHaveValue(source.exercise.instructionText ?? '');
          await text.fill('Recovered instruction');
          await page.getByRole('button', { name: 'Сохранить инструкцию', exact: true }).click();
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
          expect(await page.evaluate(id => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.find((item: { id: string }) => item.id === id).workoutSnapshot.exercises[0].instructionText, assignmentId)).toBe('Recovered instruction');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
