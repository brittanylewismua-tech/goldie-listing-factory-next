import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/photo-order-focus.ts',import.meta.url),'utf8');
const {focusPhotoMoveControl}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
function fixture(disabled){
 const focused=[];
 const buttons=disabled.map((value,index)=>({disabled:value,focus:options=>focused.push({index,options})}));
 const other={dataset:{photoId:'other'},querySelectorAll:()=>[{disabled:false,focus:()=>assert.fail('Focus must stay on the moved photo')}]};
 const card={dataset:{photoId:'printify:3'},querySelectorAll:()=>buttons};
 return {strip:{querySelectorAll:()=>[other,card]},focused};
}
test('keyboard move to either boundary focuses the remaining enabled arrow on that photo',()=>{
 for(const [disabled,direction,index] of [[[true,false],-1,1],[[false,true],1,0]]){
  const {strip,focused}=fixture(disabled);focusPhotoMoveControl(strip,'printify:3',direction);
  assert.deepEqual(focused,[{index,options:{preventScroll:true}}]);
 }
});
test('keyboard move within the strip preserves the requested direction',()=>{
 for(const direction of [-1,1]){const {strip,focused}=fixture([false,false]);focusPhotoMoveControl(strip,'printify:3',direction);assert.equal(focused[0].index,direction===-1?0:1);}
});
test('removed photos and unavailable controls never move focus to a different photo',()=>{
 const {strip,focused}=fixture([true,true]);focusPhotoMoveControl(strip,'missing',1);focusPhotoMoveControl(strip,'printify:3',-1);assert.deepEqual(focused,[]);
});
