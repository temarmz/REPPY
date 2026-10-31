import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { profileAction } from './profile-action';

type BrowserProblem = { kind: 'console' | 'page'; message: string };

function watchBrowserProblems(page: Page, ignoredConsole: string[] = []) {
  const problems: BrowserProblem[] = [];
  page.on('pageerror', (error) => problems.push({ kind: 'page', message: error.message }));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !ignoredConsole.some((expected) => text.includes(expected))) {
      problems.push({ kind: 'console', message: text });
    }
  });
  return problems;
}

async function openFreshDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expect(page).toHaveURL(/#\/trainer$/);
  await expect(page.locator('[data-route-active="true"] main:not([aria-busy="true"])')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reppy-demo-v0') !== null)).toBe(true);
}

async function expectResponsiveScreen(page: Page) {
  await expect(page.locator('.loading-screen')).toHaveCount(0, { timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => {
    const path = location.hash.slice(1) || '/';
    const route = Array.from(document.querySelectorAll<HTMLElement>('[data-route-view]'))
      .find((element) => element.dataset.routeView === path);
    const main = route?.querySelector('main:not([aria-busy="true"])');
    return route?.dataset.routeActive === 'true' && Boolean(main?.getClientRects().length);
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function auditTouchTargets(page: Page) {
  const problems = await page.locator('[data-route-view] main button:visible, .bottom-nav button:visible, .desktop-nav button:visible').evaluateAll((buttons) => buttons.flatMap((button) => {
    const element = button as HTMLButtonElement;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') return [];
    const route = element.closest<HTMLElement>('[data-route-view]');
    if (route && route.dataset.routeView !== (location.hash.slice(1) || '/')) return [];
    const bounds = element.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    if (centerX < 0 || centerX > innerWidth || centerY < 0 || centerY > innerHeight) return [];
    const page = element.closest('.page-wrap');
    const pageBounds = page?.getBoundingClientRect();
    if (pageBounds && (centerY < pageBounds.top || centerY > pageBounds.bottom)) return [];
    const center = document.elementFromPoint(centerX, centerY);
    const covered = !center || center.closest('button') !== element;
    const tooSmall = bounds.width < 44 || bounds.height < 44;
    const canScrollPastFloatingNav = covered
      && center instanceof Element
      && Boolean(center.closest('.bottom-nav'))
      && !element.closest('.bottom-nav')
      && ((page instanceof HTMLElement && page.scrollTop + page.clientHeight < page.scrollHeight - 1)
        || window.scrollY + innerHeight < (document.scrollingElement?.scrollHeight ?? 0) - 1);
    if (canScrollPastFloatingNav) return [];
    if (!covered && !tooSmall) return [];
    return [{
      label: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ') || '<button>',
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      covered,
      center: [Math.round(centerX), Math.round(centerY)],
      covering: center instanceof Element
        ? center.closest('button')?.getAttribute('aria-label') || center.closest('button')?.textContent?.trim().replace(/\s+/g, ' ') || center.className
        : '<none>',
    }];
  }));
  expect(problems, 'Enabled controls must have an unobstructed 44×44 px touch target').toEqual([]);
}

async function selectThemeForProject(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name !== 'mobile-light') return;
  await profileAction(page, 'Включить светлую тему');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

test('critical navigation stays responsive for trainer and student', async ({ page }, testInfo) => {
  const browserProblems = watchBrowserProblems(page);
  await openFreshDemo(page);
  await selectThemeForProject(page, testInfo);

  for (const label of ['Календарь', 'Ученики', 'Заметки', 'Профиль', 'Главная']) {
    const navigation = page.locator('.bottom-nav:visible, .desktop-nav:visible');
    const control = (label === 'Профиль' ? page.locator('.topbar') : navigation).getByRole('button', { name: label, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-current', 'page');
    await expectResponsiveScreen(page);
    await auditTouchTargets(page);
  }

  await profileAction(page, 'Переключиться в роль ученика');
  await expect(page).toHaveURL(/#\/student$/);
  for (const label of ['Календарь', 'Заметки', 'Профиль', 'Главная']) {
    const navigation = page.locator('.bottom-nav:visible, .desktop-nav:visible');
    const control = (label === 'Профиль' ? page.locator('.topbar') : navigation).getByRole('button', { name: label, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-current', 'page');
    await expectResponsiveScreen(page);
    await auditTouchTargets(page);
  }

  await page.getByRole('button', { name: 'Посмотреть тренировку' }).click();
  await expect(page).toHaveURL(/#\/student\/assignments\//);
  await expectResponsiveScreen(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/student$/);
  await expectResponsiveScreen(page);
  await page.goForward();
  await expect(page).toHaveURL(/#\/student\/assignments\//);
  await expectResponsiveScreen(page);
  if (testInfo.project.name !== 'desktop-chromium') {
    await page.evaluate(() => document.addEventListener('click', (event) => {
      if ((event.target as Element).closest('.back-button')) event.stopImmediatePropagation();
    }, true));
    await page.getByRole('button', { name: 'Назад', exact: true }).tap();
    await expect(page).toHaveURL(/#\/student$/);
    await expectResponsiveScreen(page);
  }
  expect(browserProblems).toEqual([]);
});

test('empty data has actionable trainer and student states', async ({ page }, testInfo) => {
  const browserProblems = watchBrowserProblems(page);
  await openFreshDemo(page);
  await selectThemeForProject(page, testInfo);

  await page.evaluate(() => {
    const raw = localStorage.getItem('reppy-demo-v0');
    if (!raw) throw new Error('Demo state was not persisted');
    const state = JSON.parse(raw);
    state.students = [];
    state.assignments = [];
    state.sessions = [];
    state.subscriptionEntries = [];
    state.activeStudentId = '';
    state.role = 'trainer';
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.goto('/#/trainer/clients');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Учеников пока нет' })).toBeVisible();
  const invite = page.getByRole('button', { name: 'Пригласить ученика' }).last();
  await expect(invite).toBeVisible();
  await auditTouchTargets(page);
  await invite.click();
  await expect(page).toHaveURL(/#\/trainer\/clients\/invite$/);
  await expectResponsiveScreen(page);

  await page.evaluate(() => {
    const raw = localStorage.getItem('reppy-demo-v0');
    if (!raw) throw new Error('Demo state was not persisted');
    const state = JSON.parse(raw);
    state.students = [{ id: 'empty-student', name: 'Новый ученик', status: 'active', color: 'lime' }];
    state.activeStudentId = 'empty-student';
    state.assignments = [];
    state.sessions = [];
    state.subscriptionEntries = [];
    state.role = 'student';
    localStorage.setItem('reppy-demo-v0', JSON.stringify(state));
  });
  await page.goto('/#/student');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Две недели свободны' })).toBeVisible();
  await expectResponsiveScreen(page);
  await auditTouchTargets(page);
  expect(browserProblems).toEqual([]);
});

test('slow startup and offline mode always expose progress or recovery', async ({ page, context }) => {
  const browserProblems = watchBrowserProblems(page, [
    'net::ERR_INTERNET_DISCONNECTED',
    'WebKit encountered an internal error',
  ]);
  let releaseAsset!: () => void;
  const heldAsset = new Promise<void>((resolve) => { releaseAsset = resolve; });
  await page.route('**/good-sm.png', async (route) => {
    await heldAsset;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.loading-screen')).toBeVisible();
  await expect(page.locator('.loading-screen')).toHaveAttribute('aria-busy', 'true');
  releaseAsset();
  await expect(page.getByRole('button', { name: 'Попробовать REPPY' })).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await expectResponsiveScreen(page);

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Изменения сохраняются на этом устройстве' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toHaveCount(0);
  await expectResponsiveScreen(page);
  expect(browserProblems).toEqual([]);
});

test('long iPhone session keeps one active route and recovers an orphaned modal lock', async ({ page }, testInfo) => {
  const browserProblems = watchBrowserProblems(page);
  await openFreshDemo(page);

  for (let index = 0; index < 24; index += 1) {
    const route = index % 2 ? `/trainer/clients/soak-${index}` : '/trainer/calendar';
    await page.evaluate((next) => { location.hash = next; }, route);
    await expect(page.locator('[data-route-active="true"]')).toHaveCount(1);
    await expect(page.locator('[data-route-active="true"]')).toHaveAttribute('data-route-view', route);
  }

  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (!shell) throw new Error('App shell is missing');
    document.body.classList.add('modal-open');
    shell.inert = true;
    shell.setAttribute('aria-hidden', 'true');
    window.dispatchEvent(new CustomEvent('reppy:modal-layer', { detail: true }));
  });
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  const navigation = testInfo.project.name === 'desktop-chromium' ? page.locator('.desktop-nav') : page.locator('.bottom-nav');
  await expect(navigation).toBeVisible();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.app-shell')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  expect(browserProblems).toEqual([]);
});

test('a repeated assignment activation creates only one calendar item', async ({ page }) => {
  const browserProblems = watchBrowserProblems(page);
  await openFreshDemo(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.length as number);
  await page.goto('/#/trainer/clients/maria/assign');
  await page.locator('.workout-history-row').first().click();
  const submit = page.getByRole('button', { name: /Назначить/ });
  await expect(submit).toBeEnabled();
  await submit.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page).toHaveURL(/#\/trainer\/clients\/maria$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).assignments.length as number)).toBe(before + 1);
  expect(browserProblems).toEqual([]);
});
