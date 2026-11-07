// Two real build artifacts, one origin, no production deploy or data changes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { chromium } from '@playwright/test';
const root = 'work/ops-rollback'; await mkdir(root, { recursive: true });
const run = (cmd, args, env = process.env) => execFileSync(cmd, args, { env, stdio: 'pipe' });
const started = Date.now();
for (const name of ['baseline', 'candidate']) {
  run('npm', ['run', 'build:pages'], { ...process.env, GITHUB_RUN_ID: `drill-${name}`, GITHUB_RUN_ATTEMPT: '1' });
  await rm(join(root, name), { recursive: true, force: true });
  await cp('pages-dist', join(root, name), { recursive: true });
  run('node', ['scripts/release-artifact.mjs', 'create', join(root, name), join(root, `${name}.json`)]);
  run('tar', ['-czf', join(root, `${name}.tar.gz`), '-C', root, name]);
}
let active = 'baseline';
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.includes('..')) { res.writeHead(400).end(); return; }
    const file = join(root, active, pathname === '/' ? 'index.html' : pathname);
    const bytes = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const checks = [];
try {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'Попробовать REPPY' }).click();
  await page.locator('[data-route-active="true"] main').waitFor();
  const before = await page.evaluate(() => localStorage.getItem('reppy-demo-v0'));
  assert.ok(before);
  for (const release of ['candidate', 'baseline']) {
    if (release === 'baseline') {
      // Delete unpacked baseline: restoration must really read the retained archive.
      await rm(join(root, 'baseline'), { recursive: true });
      run('tar', ['-xzf', join(root, 'baseline.tar.gz'), '-C', root]);
      run('node', ['scripts/release-artifact.mjs', 'verify', join(root, 'baseline'), join(root, 'baseline.json')]);
    }
    active = release; await page.reload();
    await page.locator('[data-route-active="true"] main').waitFor();
    const manifest = await (await page.request.get(url + '/release.json')).json();
    assert.ok(manifest.release.includes(`drill-${release}`));
    assert.equal(await page.evaluate(() => localStorage.getItem('reppy-demo-v0')), before);
    checks.push({ release, id: manifest.release, storagePreserved: true });
  }
  const summary = { at: new Date().toISOString(), durationMs: Date.now() - started, scope: 'local-static-artifact-rollback-with-demo-storage', checks };
  await writeFile(join(root, 'report.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
