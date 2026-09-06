import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/etsy-details-disclosure.ts',import.meta.url),'utf8');
const {shouldOpenEtsyDetails}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
test('complete Etsy details start compact even when optional fields are blank',()=>{
 assert.equal(shouldOpenEtsyDetails({category:'Hoodies',properties:[{required:true,value:'Pullover'},{required:false,value:''}]}),false);
 assert.equal(shouldOpenEtsyDetails({category:'Mugs',properties:[]}),false);
});
test('missing category or required value starts open for correction',()=>{
 assert.equal(shouldOpenEtsyDetails({category:' ',properties:[]}),true);
 assert.equal(shouldOpenEtsyDetails({category:'Hoodies',properties:[{required:true,value:' '}]}),true);
});
