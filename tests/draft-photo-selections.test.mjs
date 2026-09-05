import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftPhotoSelections} from '../app/draft-photo-selections.ts';

test('two bundle products retain their own default photos in the final report',()=>{
  const selections={...draftPhotoSelections([{id:'hoodie'}],{},[0,3]),...draftPhotoSelections([{id:'tee'}],{},[0,2,4])};
  assert.deepEqual(selections,{hoodie:[0,3],tee:[0,2,4]});
  assert.equal(Object.values(selections).reduce((sum,ids)=>sum+ids.length,0),5);
});
test('cleared and customized photo choices override product defaults without mutating them',()=>{
  const defaults=[0,3],choices={cleared:[],custom:[5],stale:[9]};
  const result=draftPhotoSelections([{id:'cleared'},{id:'custom'},{id:'untouched'},{}],choices,defaults);
  assert.deepEqual(result,{cleared:[],custom:[5],untouched:[0,3]});
  result.untouched.push(7);result.custom.push(8);
  assert.deepEqual(defaults,[0,3]);assert.deepEqual(choices.custom,[5]);
});
test('every draft receives defaults, including multiple listings of one product',()=>{
  assert.deepEqual(draftPhotoSelections([{id:'one'},{id:'two'}],{},[1]),{one:[1],two:[1]});
});
test('the shared final-review selection map resolves active and sibling defaults separately',()=>{
  const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const fn=app.slice(app.indexOf('function bundlePublishSelections()'),app.indexOf('function bundlePublishMockupCounts()'));
  assert.match(fn,/draftPhotoSelections\(drafts,printifyImageSelections,printifyImageIndices\)/);
  assert.match(fn,/draftPhotoSelections\(member.drafts,member.selections,member.indices\)/);
});
