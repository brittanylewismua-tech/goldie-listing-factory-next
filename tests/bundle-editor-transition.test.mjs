import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
test('switching products never exposes the previous product editor under the new task',()=>{
  assert.match(app,/const rowOpen=Boolean\(!switchingProduct&&open&&row.task&&activeTask===row.task\)/);
  assert.match(app,/open&&!switchingProduct&&<div className="step-product-body"/);
});
test('restoring a batch hides and disables the uninitialized workflow',()=>{
  assert.match(app,/data-restoring=\{restoringBatch\?"true":undefined\} inert=\{restoringBatch\}/);
  const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
  assert.match(css,/\.steps-column\[data-restoring="true"\]\{display:none!important\}/);
});
