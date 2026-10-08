import assert from 'node:assert/strict';
import test from 'node:test';
import { observeMobileViewport } from '../app/mobile-viewport.ts';

function viewportFixture() {
  const viewport = Object.assign(new EventTarget(), { height: 720, offsetTop: 0, scale: 1 });
  const callbacks = new Map();
  let id = 0;
  const target = Object.assign(new EventTarget(), {
    innerHeight: 844, visualViewport: viewport,
    requestAnimationFrame: (callback) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (key) => callbacks.delete(key),
  });
  const values = new Map();
  const root = { style: { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) } };
  const flush = () => { for (const callback of callbacks.values()) callback(); callbacks.clear(); };
  return { target, viewport, values, root, flush, callbacks };
}

test('реальная видимая высота, клавиатура и смещение учитываются без превышения innerHeight', () => {
  const fixture = viewportFixture();
  const stop = observeMobileViewport(fixture.target, fixture.root);
  assert.equal(fixture.values.get('--app-visible-height'), '720px');
  fixture.viewport.height = 500;
  fixture.viewport.offsetTop = 60;
  fixture.viewport.dispatchEvent(new Event('resize'));
  fixture.viewport.dispatchEvent(new Event('scroll'));
  assert.equal(fixture.callbacks.size, 1);
  fixture.flush();
  assert.equal(fixture.values.get('--app-visible-height'), '500px');
  assert.equal(fixture.values.get('--app-visible-top'), '60px');
  fixture.target.innerHeight = 400;
  fixture.target.dispatchEvent(new Event('resize'));
  fixture.flush();
  assert.equal(fixture.values.get('--app-visible-height'), '400px');
  stop();
});

test('pinch zoom не сжимает интерфейс, cleanup снимает обработчики и запланированный кадр', () => {
  const fixture = viewportFixture();
  const stop = observeMobileViewport(fixture.target, fixture.root);
  fixture.viewport.scale = 2;
  fixture.viewport.height = 300;
  fixture.viewport.dispatchEvent(new Event('resize'));
  fixture.flush();
  assert.equal(fixture.values.get('--app-visible-height'), '720px');
  fixture.viewport.dispatchEvent(new Event('resize'));
  stop();
  assert.equal(fixture.callbacks.size, 0);
  assert.equal(fixture.values.size, 0);
  fixture.viewport.dispatchEvent(new Event('resize'));
  fixture.target.dispatchEvent(new Event('pageshow'));
  assert.equal(fixture.callbacks.size, 0);
});
