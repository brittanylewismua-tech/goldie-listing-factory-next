import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/factory-tools.tsx',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function chooseBundle('),source.indexOf('  const selectedBundleRecipes='));
const code=ts.transpile(`export async function exercise(outcome,throws=false){
 let state={active:'bundle:current',message:'',open:true,pending:'',editing:true,form:true};
 const actionLock={current:false};
 const props={selectedProductId:'bundle:current',onUseBundle:async()=>{if(throws)throw Error('Network failed');return outcome}};
 const setPendingAction=value=>state.pending=value,setActiveId=value=>state.active=value,setMessage=value=>state.message=value,setEditing=value=>state.editing=value,setBundleForm=value=>state.form=value,setShowLibrary=value=>state.open=value;
 const console={error(){}};
 ${handler}
 await chooseBundle({id:'next',recipeIds:['a','b']});return {...state,locked:actionLock.current};
}`,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {exercise}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('canceling bundle replacement preserves selected batch and shows no failure',async()=>{
 const actual=await exercise('canceled');assert.equal(actual.active,'bundle:current');assert.equal(actual.message,'');assert.equal(actual.open,true);assert.equal(actual.locked,false);assert.equal(actual.pending,'');
});
test('actual unavailable bundle and network failures remain visible while preserving prior selection',async()=>{
 for(const args of [[false],[false,true]]){const actual=await exercise(...args);assert.equal(actual.active,'bundle:current');assert.match(actual.message,/could not be loaded/);assert.equal(actual.open,true);assert.equal(actual.locked,false);}
});
test('successful bundle selection adopts the selected bundle and leaves the library',async()=>{
 const actual=await exercise(true);assert.equal(actual.active,'bundle:next');assert.equal(actual.open,false);assert.equal(actual.message,'');assert.equal(actual.editing,false);assert.equal(actual.form,false);
});
