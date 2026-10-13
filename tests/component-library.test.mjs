import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const app = new URL('../app/', import.meta.url);
function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root);
    return entry.isDirectory() ? filesUnder(url) : [url];
  });
}
const files = filesUnder(app);

test('every visual HTML/SVG element is rendered through the central UI library', () => {
  for (const file of files.filter((url) => url.pathname.endsWith('.tsx'))) {
    const source = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (/^[a-z]/.test(tag)) {
          assert.ok(file.pathname.endsWith('/ui/controls.tsx') && ['button', 'input', 'select', 'textarea'].includes(tag), `${file.pathname}: native ${tag} bypasses the UI library`);
        }
        const style = node.attributes.properties.find((property) => property.name?.getText(source) === 'style');
        assert.ok(!style || file.pathname.includes('/app/ui/'), `${file.pathname}: inline appearance bypasses shared styles`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test('all appearance lives in UI styles and references defined tokens', () => {
  const cssFiles = files.filter((url) => url.pathname.endsWith('.css'));
  assert.deepEqual(cssFiles.map((url) => url.pathname.replace(app.pathname, '')).sort(), ['globals.css', 'ui/styles.css', 'ui/tokens.css']);
  const content = cssFiles.map((url) => [url.pathname, readFileSync(url, 'utf8')]);
  const all = content.map(([, value]) => value).join('\n');
  const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const runtime = files.filter((url) => /\.tsx?$/.test(url.pathname)).map((url) => readFileSync(url, 'utf8')).join('\n');
  for (const match of runtime.matchAll(/setProperty\('(--[\w-]+)'/g)) defined.add(match[1]);
  for (const [name, value] of content) {
    for (const match of value.matchAll(/var\((--[\w-]+)/g)) {
      assert.ok(defined.has(match[1]) || match[1] === '--font-geist-sans', `${name}: undefined ${match[1]}`);
    }
    if (!name.endsWith('/ui/tokens.css')) {
      assert.doesNotMatch(value, /#[\da-f]{3,8}\b|rgba?\(/i, `${name}: color outside the shared palette`);
      assert.doesNotMatch(value, /(?:font-size|border-radius)\s*:[^;{}]*\d+px/, `${name}: visual size outside the shared scales`);
    }
  }
  assert.match(readFileSync(new URL('globals.css', app), 'utf8'), /^@import '.\/ui\/tokens.css';\s*@import '.\/ui\/styles.css';\s*$/);
});

test('shared UI patterns and assets are not duplicated on screens', () => {
  for (const file of files.filter((url) => url.pathname.endsWith('.tsx') && !url.pathname.includes('/app/ui/'))) {
    const value = readFileSync(file, 'utf8');
    assert.doesNotMatch(value, /<Box\s+className="(?:section-heading|active-progress|workout-progress|toast)"/, `${file.pathname}: repeated visual pattern should use its component`);
    assert.doesNotMatch(value, /src="(?:logo-wordmark|logo-full|logo|good-sm)\.png"/, `${file.pathname}: shared asset outside UI_ASSETS`);
  }
});
