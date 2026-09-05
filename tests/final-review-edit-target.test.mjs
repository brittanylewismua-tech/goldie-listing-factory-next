import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const review=readFileSync(new URL('../app/final-listing-review.tsx',import.meta.url),'utf8');
test('final review passes the exact draft to both editor shortcuts',()=>{
  assert.match(review,/onEdit\("details",draft\)/);
  assert.match(review,/onEdit\("mockups",draft\)/);
  assert.match(app,/onEdit=\{editReviewedListing\}/);
  assert.doesNotMatch(app,/onEdit=\{setFinishPhase\}/);
});
test('photo shortcut navigates to Drafts and opens the requested photo row',()=>{
  assert.match(app,/setPhotoFocusId\(target.clientId\);setActiveTask\("photos"\);goToStep\("designs",false,true\)/);
  assert.match(app,/focusedKey=\{photoFocusId\}/);
  assert.match(app,/setActiveDesign\(target.clientId\)/);
  assert.match(app,/switchingProduct\|\|restoringBatch\|\|!drafts.some\(draft=>draft.id===reviewEdit.id\)/);
});
test('bundle target is selected by draft ID, not filename or the currently open product',()=>{
  const expression=app.match(/const index=(bundleRecipes.findIndex\(recipe=>bundleMembers\[recipe.id\]\?\.drafts.some\(draft=>draft.id===target.id\)\))/)[1];
  const find=new Function('bundleRecipes','bundleMembers','target',`return ${expression}`);
  assert.equal(find([{id:'tee'},{id:'hoodie'}],{tee:{drafts:[{id:'a',clientId:'same'}]},hoodie:{drafts:[{id:'b',clientId:'same'}]}},{id:'b'}),1);
});
test('single listing shows one expanded product preview, not a duplicate thumbnail',()=>{
  assert.match(review,/!\(handoffOnly&&group.length===1\)&&\(draft.previewUrl/);
});
test('saved quality approvals keep both current and legacy inclusion decisions',()=>{
  const expression=app.match(/const restoredBundleQualityDecisions=(Object.fromEntries\([^\n]+\)) as Record/)[1];
  const restore=new Function('savedQuality',`return ${expression}`);
  assert.deepEqual(restore({a:'include',b:'proceed',c:'exclude',d:'junk'}),{a:'include',b:'include',c:'exclude'});
});
test('reload preserves an explicit empty color or size selection',()=>{
  assert.match(app,/Array.isArray\(state.selectedColorIds\)\?state.selectedColorIds:/);
  assert.match(app,/Array.isArray\(state.selectedSizeIds\)\?state.selectedSizeIds:/);
});
test('old mockups-phase bookmarks recover into the real photos step',()=>{
  assert.match(app,/workflowStep==="finish"&&finishPhase==="mockups"/);
  assert.match(app,/setFinishPhase\("details"\);setActiveTask\("photos"\);goToStep\("designs",true,true\)/);
});
