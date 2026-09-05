import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('optional title builders have readable text, padding and full-size disclosure targets',()=>{
  const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
  const rule=css.slice(css.lastIndexOf('/* Optional title builders'));
  assert.match(rule,/min-height:44px/);assert.match(rule,/padding:12px 16px/);assert.match(rule,/font:600 14px/);
  assert.match(rule,/:focus-visible\{outline:2px/);assert.match(rule,/listing-tags-field\{font-size:14px!important/);
});
