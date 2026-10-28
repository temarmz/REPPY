import { expect, test } from '@playwright/test';
import { profileAction } from './profile-action';

test('редактирование личного профиля использует одну прокрутку', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
    await profileAction(page, 'Переключиться в роль ученика');
    await page.goto('/#/student/profile');
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const phone = page.getByLabel('Мобильный телефон');
    await phone.focus();
    await expect(phone).toBeFocused();
    await expect(page.locator('.app-shell')).toHaveCSS('position', 'relative');
    await expect(page.locator('.page-wrap')).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 420 });
      Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 80 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => page.evaluate(() => document.querySelector('.page-wrap')!.scrollTop)).toBe(0);
    await expect.poll(async () => {
      const box = await phone.boundingBox();
      return (box?.y ?? 999) + (box?.height ?? 0);
    }).toBeLessThanOrEqual(500);
    await phone.fill('+7 999 111 22 33');
    await expect(phone).toBeFocused();
    const notes = page.getByLabel('Противопоказания и особенности', { exact: false });
    await notes.focus();
    await expect.poll(async () => {
      const box = await notes.boundingBox();
      return (box?.y ?? 999) + (box?.height ?? 0);
    }).toBeLessThanOrEqual(500);
    expect(await page.evaluate(() => document.querySelector('.page-wrap')!.scrollTop)).toBe(0);
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.locator('.bottom-nav')).toBeVisible();
});
