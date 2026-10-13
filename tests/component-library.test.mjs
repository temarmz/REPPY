import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const app = new URL('../app/', import.meta.url);
const nativeControls = new Set(['button', 'input', 'select', 'textarea']);

test('screens use the shared controls instead of native JSX controls', () => {
  for (const file of readdirSync(app).filter((name) => name.endsWith('.tsx') && name !== 'ui-controls.tsx')) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, app), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        assert.ok(!nativeControls.has(node.tagName.getText(source)), `${file} bypasses the shared component library`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test('visual styles use defined design tokens and keep colors in the palette', () => {
  const styles = new URL('styles/', app);
  const files = readdirSync(styles).filter((name) => name.endsWith('.css'));
  const content = files.map((name) => [name, readFileSync(new URL(name, styles), 'utf8')]);
  const all = content.map(([, value]) => value).join('\n');
  const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const viewport = readdirSync(app).filter((name) => /\.tsx?$/.test(name)).map((name) => readFileSync(new URL(name, app), 'utf8')).join('\n');
  for (const match of viewport.matchAll(/setProperty\('(--[\w-]+)'/g)) defined.add(match[1]);
  for (const [name, value] of content) {
    for (const match of value.matchAll(/var\((--[\w-]+)/g)) {
      assert.ok(defined.has(match[1]) || match[1] === '--font-geist-sans', `${name}: undefined ${match[1]}`);
    }
    if (name !== '00-design-tokens.css') {
      assert.doesNotMatch(value, /#[\da-f]{3,8}\b|rgba?\(/i, `${name}: color outside the shared palette`);
      assert.doesNotMatch(value, /(?:font-size|border-radius)\s*:[^;{}]*\d+px/, `${name}: visual size outside the shared scales`);
    }
  }
});
