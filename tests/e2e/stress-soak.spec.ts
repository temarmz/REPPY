import { test, expect } from '@playwright/test';
import { createInitialState, createWorkoutSession } from '../../app/reppy-data';

for (const role of ['trainer', 'student'] as const) for (const theme of ['light', 'dark'] as const) {
  test(`large history navigation soak: ${role}, ${theme}`, async ({ page, context }, testInfo) => {
    const rounds = Number(process.env.REPPY_SOAK_ROUNDS ?? 10);
    expect(Number.isInteger(rounds) && rounds > 0 && rounds <= 10000).toBe(true);
    test.setTimeout(Math.max(180_000, rounds * 1500));
    const interval = Number(process.env.REPPY_SOAK_INTERVAL_MS ?? 250);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const state = createInitialState(); state.loggedIn = true; state.role = role;
    const assignment = state.assignments.find(a => a.id === 'assignment-artem-push-today')!;
    const base = assignment.workoutSnapshot.exercises[0];
    const workout = { ...assignment.workoutSnapshot, exercises: Array.from({ length: 25 }, (_, i) => ({ ...structuredClone(base), id: `stress-exercise-${i}`, exerciseId: base.exerciseId,
      plannedSets: Array.from({ length: 8 }, () => ({ targetWeight: 50, targetReps: 12 })) })) };
    state.sessions = Array.from({ length: 40 }, (_, i) => {
      const session = createWorkoutSession(assignment, workout, 'student'); session.id = `stress-session-${i}`;
      session.completedAt = new Date(Date.UTC(2023, i, 10)).toISOString();
      session.results = session.results.map(r => ({ ...r, completed: true, actualWeight: 50 + i, actualReps: 12 })); return session;
    });
    await page.goto('/');
    await page.evaluate(({ state, theme }) => { localStorage.clear(); localStorage.setItem('reppy-demo-v0', JSON.stringify(state)); localStorage.setItem('reppy-ui:theme', theme); }, { state, theme });
    await page.reload();
    const routes = role === 'trainer' ? ['/trainer', '/trainer/calendar', '/trainer/clients', '/trainer/clients/artem/progress', '/trainer/notes', '/trainer/profile']
      : ['/student', '/student/calendar', '/student/progress/bench-press', '/student/notes', '/student/profile'];
    const timings: number[] = []; const heap: number[] = [];
    for (let round = 0; round < rounds; round++) for (const route of routes) {
      const start = Date.now(); await page.goto('/#' + route);
      await expect(page.locator(`[data-route-view="${route}"][data-route-active="true"] main:not([aria-busy="true"])`)).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.loading-screen')).toHaveCount(0);
      await page.locator('.page-wrap').evaluate(el => { el.scrollTop = el.scrollHeight; });
      timings.push(Date.now() - start);
      if (interval > 0) await page.waitForTimeout(interval);
      const memory = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0); if (memory) heap.push(memory);
      if (round === 4) { await context.setOffline(true); await page.locator('.bottom-nav button').first().click(); await context.setOffline(false); }
    }
    // Abruptly close the renderer and reopen using the same persisted browser storage.
    await page.close(); const reopened = await context.newPage(); await reopened.goto('/#/' + role);
    await expect(reopened.locator('[data-route-active="true"] main')).toBeVisible();
    const restored = await reopened.evaluate(() => JSON.parse(localStorage.getItem('reppy-demo-v0')!).sessions);
    expect(restored).toHaveLength(40); expect(restored.reduce((n: number, s: { results: unknown[] }) => n + s.results.length, 0)).toBe(8000);
    expect(errors).toEqual([]);
    timings.sort((a,b) => a-b);
    await testInfo.attach('soak-metrics', { body: JSON.stringify({ role, theme, transitions: timings.length, sessions: 40, sets: 8000,
      p50: timings[Math.floor(timings.length * .5)], p95: timings[Math.floor(timings.length * .95)], max: timings.at(-1), heap }, null, 2), contentType: 'application/json' });
  });
}
