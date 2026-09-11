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
test('D1332: batch size-guide feedback names Etsy drafts clearly and never describes the app as publishing',()=>{
  assert.match(app,/Size guide removed from this batch\. Existing Etsy drafts keep the size guide already sent to them\./);
  assert.match(app,/is ready for all \$\{ids\.length\} Etsy drafts/);
  assert.doesNotMatch(app,/Listings this batch has already published/);
  assert.doesNotMatch(app,/will be added to all \$\{ids\.length\} Etsy listings when you publish/);
});
