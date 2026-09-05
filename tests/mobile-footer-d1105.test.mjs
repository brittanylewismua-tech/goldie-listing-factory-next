import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('mobile footer gives continuation a full row without pushing controls offscreen', () => {
  const css = readFileSync(new URL('../app/interface-v2.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* Keep every continuation reachable'), css.indexOf('.app-shell .workflow-footer-actions .launch-button'));
  assert.match(block, /display:grid!important/);
  assert.match(block, /\.footer-forward-action\{\s*grid-row:1;grid-column:1\/-1/);
  assert.match(block, /\.workflow-back\{\s*grid-row:2;grid-column:1/);
  assert.match(block, /\.save-draft-link\{\s*grid-row:2;grid-column:2/);
});
