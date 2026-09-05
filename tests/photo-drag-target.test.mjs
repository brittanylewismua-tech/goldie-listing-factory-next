import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/photo-drag-target.ts',import.meta.url),'utf8');
const {closestPhotoSlot,movePhotoToSlot}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
const slots=[{left:0,top:0,width:200,height:160},{left:220,top:0,width:200,height:160},{left:0,top:180,width:200,height:160}];
test('upper and lower halves of a horizontal target both move the photo right',()=>{
  for(const y of [10,60,150])assert.deepEqual(movePhotoToSlot(['a','b','c'],'a',closestPhotoSlot(slots,300,y)),['b','a','c']);
});
test('leftward and wrapped-row drops use full stable slots',()=>{
  assert.deepEqual(movePhotoToSlot(['b','a','c'],'a',closestPhotoSlot(slots,40,30)),['a','b','c']);
  assert.deepEqual(movePhotoToSlot(['a','b','c'],'a',closestPhotoSlot(slots,40,210)),['b','c','a']);
});
test('repeated drag-over events do not oscillate after the cards move',()=>{
  let order=['a','b','c'];
  for(let i=0;i<10;i++)order=movePhotoToSlot(order,'a',closestPhotoSlot(slots,300,10));
  assert.deepEqual(order,['b','a','c']);
  assert.deepEqual(movePhotoToSlot(order,'missing',1),order);
});
