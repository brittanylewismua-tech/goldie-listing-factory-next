import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/photo-order-state.ts',import.meta.url),'utf8');
const {mergePhotoOrder}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
test('new uploads append without replacing the current cover when order has not been explicitly saved',()=>{
  assert.deepEqual(mergePhotoOrder(['upload','front','back'],[],['front','back']),['front','back','upload']);
});
test('saved order wins, deleted photos disappear and new photos append exactly once',()=>{
  assert.deepEqual(mergePhotoOrder(['front','back','guide'],['back','deleted','front'],['front','back']),['back','front','guide']);
});
