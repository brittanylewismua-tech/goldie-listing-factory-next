import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('D1097: recovery My Products link opens saved products, not Printify catalog',()=>{
  const source=readFileSync(new URL('../app/photo-delivery-handoff.tsx',import.meta.url),'utf8');
  assert.match(source,/href="https:\/\/printify\.com\/app\/store\/products"/);
  assert.doesNotMatch(source,/href=\{handoffBlockers\(\).length\?undefined:"https:\/\/printify.com\/app\/products"\}/);
});
