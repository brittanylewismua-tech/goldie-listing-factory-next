import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
const boundary=css.slice(css.indexOf('/* D1140:'));
test('bundle products have a full-width chapter header and generous inter-product spacing',()=>{
  assert.match(boundary,/\.in-batch \+ \.step-product-card\.in-batch\{\s*margin-top:64px/);
  assert.match(boundary,/width:100%;box-sizing:border-box;margin:0 0 28px;padding:24px/);
  assert.match(boundary,/background:#f5b8df;border:2px solid #171717/);
  assert.match(boundary,/\.batch-product-position\{[^}]*font-size:14px!important/s);
  assert.doesNotMatch(boundary,/\.is-(open|closed)\s*>\s*header/,'open and closed products must share the same boundary');
});
test('bundle chapter identity wraps and the status gets its own mobile row',()=>{
  assert.match(boundary,/minmax\(0,1fr\)/);
  assert.match(boundary,/overflow-wrap:anywhere/);
  assert.match(boundary,/@media\(max-width:640px\)/);
  assert.match(boundary,/\.step-product-state\{grid-column:2;justify-self:start/);
  assert.match(boundary,/:focus-visible\{\s*outline:3px solid #171717;outline-offset:6px/);
});
