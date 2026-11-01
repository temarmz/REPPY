import { profileAction } from './profile-action';
import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  for (const role of ['trainer', 'student'] as const) {
    for (const [width, height] of [[320, 568], [390, 844], [440, 844], [740, 320]]) {
      test(`an out-and-back touch gesture is not a menu tap: ${theme}, ${role}, ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
        if (theme === 'light') await profileAction(page, 'Включить светлую тему');
        if (role === 'student') await profileAction(page, 'Переключиться в роль ученика');
        const initialRoute = role === 'student' ? '/student/profile' : '/trainer/clients/invite';
        await page.goto(`/#${initialRoute}`);
        if (role === 'student') await page.locator('.athlete-heading-edit').click();
        const field = role === 'student' ? page.getByLabel('Противопоказания и особенности', { exact: false }) : page.getByLabel('Имя ученика');
        await field.fill('Keep this unfinished form');
        await field.blur();
        const nav = page.locator('.bottom-nav');
        const target = nav.getByRole('button', { name: 'Календарь', exact: true });
        const rect = await target.boundingBox();
        expect(rect).not.toBeNull();
        const x = rect!.x + rect!.width / 2;
        const y = rect!.y + rect!.height / 2;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 32, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 2, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(550);
        await page.screenshot({ path: testInfo.outputPath('after-gesture.png'), animations: 'disabled' });
        await expect(page).toHaveURL(new RegExp(`#${initialRoute}$`));
        await expect(field).toHaveValue('Keep this unfinished form');
        await target.tap();
        await expect(nav.getByRole('button', { name: 'Календарь', exact: true })).toHaveAttribute('aria-current', 'page');
        const origin = role === 'student' ? 'Профиль' : 'Ученики';
        await (role === 'student' ? page.locator('.topbar').getByRole('button', { name: origin, exact: true }) : nav.getByRole('button', { name: origin, exact: true })).tap();
        await expect(field).toHaveValue('Keep this unfinished form');
        await cdp.detach();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}
