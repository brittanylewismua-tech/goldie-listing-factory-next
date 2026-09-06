import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const panel=readFileSync(new URL('../app/factory-panel.tsx',import.meta.url),'utf8');
test('pending edits are reported before debounce and old saves cannot acknowledge newer edits',()=>{
  assert.match(app,/batchEditRevision\.current\+=1;setBatchSaveStatus\("saving"\);const targetId=batchIdRef\.current;const timer=/);
  assert.match(app,/batchIdRef\.current===id&&batchEditRevision\.current===editRevision/);
  assert.match(app,/if \(!running && batchSaveStatus!=="saving" && batchSaveStatus!=="failed"\) return/);
});
test('panel keyboard activation excludes nested controls and empty labels have action fallback',()=>{
  assert.match(panel,/toggleLabel\?\.trim\(\) \|\| \(open \? "Close" : "Open"\)/);
  assert.match(panel,/toggleDisabled \|\| event.target !== event.currentTarget/);
});
test('lazy Etsy property controls have explicit names and photos count the effective guide',()=>{
  assert.match(app,/<select aria-label=\{property.label\}/);
  assert.match(app,/<input aria-label=\{property.label\}/);
  assert.match(app,/const count=selectedImages.length\+\(preparedMockupCounts\[draft.id\|\|""\]\|\|0\)\+\(design\?\.sizeGuideName\?\?sizeGuideName\?1:0\)/);
});

test('editing or selecting a bundle member cannot silently detach the active bundle',()=>{
  assert.match(app,/const changingProduct=Boolean\(activeBundle\|\|/);
  assert.match(app,/if\(changingProduct&&\(files.length>0\|\|drafts.length>0\|\|complete\)\)/);
});
