import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const component=readFileSync(new URL('../app/uploaded-listing-photos.tsx',import.meta.url),'utf8');
test('a selected size guide can be removed from only its own listing',()=>{
  assert.match(component,/productId=\$\{encodeURIComponent\(productId\)\}&kind=size-guide/);
  assert.match(component,/method:"DELETE"/);assert.match(component,/>Remove<\/button>/);
  assert.match(component,/onSizeGuideSaved\(""\)/);assert.match(component,/const guide=sizeGuideName\?\?batchSizeGuideName/);
  assert.match(app,/design\.sizeGuideName\?\?sizeGuideName/);
});
