import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
test('a selected size guide can be removed from only its own listing',()=>{
  const component=app.slice(app.indexOf('function IndividualSizeGuide'),app.indexOf('function IndividualSizeGuide')+3200);
  assert.match(component,/productId=\$\{encodeURIComponent\(productId\)\}&kind=size-guide/);
  assert.match(component,/method:"DELETE"/);assert.match(component,/Remove size guide/);
  assert.match(component,/onSaved\(""\)/);assert.match(component,/const guide=name\?\?batchName/);
  assert.match(app,/design\.sizeGuideName\?\?sizeGuideName/);
});
