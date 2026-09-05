import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePreviewDetails} from '../app/printify-preview-details.ts';
const img=(name)=>({src:`https://images.printify.com/${name}.jpg`,variantIds:[1],position:'front'});
test('ordinary saves retain folded, lifestyle and back cameras',()=>{
  const previous=['folded','lifestyle','back'].map(img);
  assert.equal(mergePreviewDetails([previous,[img('front')]]).length,4);
});
test('refresh retains a stable artwork revision and deduplicates cache URLs',()=>{
  const first=mergePreviewDetails([[img('front')]],123);
  assert.deepEqual(mergePreviewDetails([first,[img('front')]],123),first);
  const second=mergePreviewDetails([first,[img('front')]],456);
  assert.equal(second.length,1);assert.equal(second[0].src,'https://images.printify.com/front.jpg?goldie_artwork=456');
});
