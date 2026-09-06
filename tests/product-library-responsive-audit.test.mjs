import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
test('the unnumbered product library does not inherit the numbered step grid',()=>{
  assert.match(css,/\.app-shell \.factory-panel:has\(\.recipe-card\) \.recipe-card\{\s*display:block!important;min-width:0;/);
});
test('narrow library header gives creation actions a separate wrapping row',()=>{
  const rules=css.slice(css.indexOf('/* D1159:'));
  assert.match(rules,/@media\(max-width:760px\)/);
  assert.match(rules,/grid-template-columns:34px minmax\(0,1fr\)/);
  assert.match(rules,/grid-column:1\/-1;display:flex;flex-wrap:wrap;width:100%/);
  assert.match(rules,/\.bundle-builder\{grid-template-columns:minmax\(0,1fr\)/);
});
