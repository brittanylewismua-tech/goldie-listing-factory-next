import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePreviewDetails,uniqueMockupEntries,correspondingMockupIndices} from '../app/printify-preview-details.ts';
const url=(product,variant,camera,name='old')=>`https://images.printify.com/mockup/${product}/${variant}/${camera}/${name}.jpg?camera_label=front`;
const image=src=>({src,variantIds:[12],position:'front'});
test('renaming a title updates the same mockup slot rather than growing the gallery',()=>{
  const old=[image(url('a',12,3)),image(url('a',12,4))];
  const next=mergePreviewDetails([old,[image(url('a',12,3,'new'))]]);
  assert.equal(next.length,2);assert.equal(next[0].src,url('a',12,3,'new'));assert.deepEqual(next[1],old[1]);
});
test('old duplicate slots remain addressable while the picker shows one selected representative',()=>{
  const old=[image(url('a',12,3)),image(url('a',12,3,'renamed')),image(url('a',12,4))];
  const next=mergePreviewDetails([old,[image(url('a',12,3,'latest'))]],123);
  assert.equal(next.length,3);assert.match(next[1].src,/latest/);assert.match(next[2].src,/\/4\//);
  assert.deepEqual(uniqueMockupEntries(next.map(x=>x.src),[1,2]).map(x=>x.index),[1,2]);
});
test('copying views across design drafts follows camera and variant, not array position',()=>{
  const source=[url('a',12,3),url('a',12,4)],target=[url('b',12,4),url('b',12,3),url('b',12,3,'renamed')];
  assert.deepEqual(correspondingMockupIndices(source,[0],target),[1]);
  assert.deepEqual(correspondingMockupIndices(source,[1],target),[0]);
  assert.deepEqual(correspondingMockupIndices(source,[0],[url('b',13,3)]),[]);
});
test('different variants, cameras and unknown URL formats are not collapsed',()=>{
  const sources=[url('a',12,3),url('a',13,3),url('a',12,4),'https://example.com/a.jpg','https://example.com/b.jpg'];
  assert.equal(uniqueMockupEntries(sources).length,5);
});
