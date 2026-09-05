import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('mobile final review gives the title its own flexible row', () => {
  const css=readFileSync(new URL('../app/clarity-pass.css',import.meta.url),'utf8');
  assert.match(css, /@media\(max-width:600px\)\{\s*\.app-shell \.final-design-group>summary\{grid-template-columns:44px minmax\(0,1fr\) 18px!important/);
  assert.match(css, /\.final-design-group>summary>em\{grid-column:2;grid-row:3/);
  assert.match(css, /\.final-design-group>summary>span\{grid-column:2;grid-row:1;min-width:0;white-space:normal!important/);
});
