import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const tile=source.slice(source.indexOf('function PrintifyImageTile('),source.indexOf('function PrintifyImagePicker('));
test('expanded mockups load near the viewport instead of requesting the entire catalog immediately',()=>{
  assert.match(tile,/<img[^>]*loading="lazy"/);
});
test('transient image failures retry with a bounded backoff and cleanup',()=>{
  assert.match(tile,/state!=="failed"\|\|attempt>=2/);
  assert.match(tile,/800\*2\*\*attempt/);
  assert.match(tile,/return\(\)=>window.clearTimeout\(timer\)/);
  assert.match(tile,/useEffect\(\(\)=>\{setState\("loading"\);setAttempt\(0\)\},\[src\]\)/);
});
