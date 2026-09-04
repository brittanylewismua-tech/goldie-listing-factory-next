import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
test('D1096: the editor scroll target clears the fixed header and sticky listing switch',()=>{
  const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
  assert.match(css,/\.factory-listing-screen > \.factory-listing-grid\{scroll-margin-top:160px\}/);
});
test('D1095: bundle next/previous scrolls the source editor, not the first hidden product',()=>{
  const line=source.split('\n').find(line=>line.includes('const showListing='));
  assert.match(line,/source.closest\(".factory-listing-screen"\)/);
  assert.doesNotMatch(line,/document.querySelector/);
  assert.match(line,/editor\?\.scrollIntoView\(\{block:"start"\}\)/);
  for(const target of ['item.id','files[index-1].id','files[index+1].id'])assert.ok(source.includes(`showListing(${target},event.currentTarget)`));
});
