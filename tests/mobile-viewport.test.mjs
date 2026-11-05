import assert from 'node:assert/strict';
import test from 'node:test';
import { observeMobileViewport } from '../app/mobile-viewport.ts';

function viewportFixture() {
  const viewport = Object.assign(new EventTarget(), { height: 720, offsetTop: 0, scale: 1 });
  const callbacks = new Map();
  let id = 0;
  const target = Object.assign(new EventTarget(), {
    innerHeight: 844, visualViewport: viewport,
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
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

test('возвращение из фона не применяет временно неверные координаты WebView', () => {
  const fixture = viewportFixture();
  const stop = observeMobileViewport(fixture.target, fixture.root);
  fixture.viewport.height = 1;
  fixture.viewport.offsetTop = 800;
  fixture.target.document.dispatchEvent(new Event('visibilitychange'));
  fixture.flush();
  assert.equal(fixture.values.get('--app-visible-height'), '720px');
  assert.equal(fixture.values.get('--app-visible-top'), '0px');

  fixture.viewport.height = 700;
  fixture.viewport.offsetTop = 800;
  fixture.target.document.dispatchEvent(new Event('visibilitychange'));
  fixture.flush();
  assert.equal(fixture.values.get('--app-visible-height'), '700px');
  assert.equal(fixture.values.get('--app-visible-top'), '144px');
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

test('смена фокуса обновляет состояние клавиатуры без resize и снимается при cleanup', () => {
  const fixture = viewportFixture();
  const attributes = new Set();
  fixture.root.classList = { contains: () => false };
  fixture.root.toggleAttribute = (key, enabled) => enabled ? attributes.add(key) : attributes.delete(key);
  fixture.root.removeAttribute = key => attributes.delete(key);
  const stop = observeMobileViewport(fixture.target, fixture.root);
  fixture.viewport.height = 420;
  fixture.target.document.activeElement = { tagName: 'TEXTAREA' };
  fixture.target.document.dispatchEvent(new Event('focusin'));
  fixture.flush();
  assert.equal(attributes.has('data-keyboard-open'), true);
  fixture.target.document.activeElement = { tagName: 'BUTTON' };
  fixture.target.document.dispatchEvent(new Event('focusout'));
  fixture.flush();
  assert.equal(attributes.has('data-keyboard-open'), false);
  stop();
  fixture.target.document.dispatchEvent(new Event('focusin'));
  fixture.target.document.dispatchEvent(new Event('focusout'));
  assert.equal(fixture.callbacks.size, 0);
});
