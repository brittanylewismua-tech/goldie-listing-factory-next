import test from 'node:test';import assert from 'node:assert/strict';
import {deliveryWrite,resolvedDeliveryUncertainty} from '../app/delivery-write.ts';
import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
const bounded=url(readFileSync(new URL('../app/bounded-work.ts',import.meta.url),'utf8'));
const {prepareDraftBatch}=await import(url(readFileSync(new URL('../app/draft-batch-preparation.ts',import.meta.url),'utf8').replace("'./bounded-work'",`'${bounded}'`)));
test('a lost preparation reply times out once without a repeated write',async()=>{
 let calls=0;const keepAlive=setTimeout(()=>{},1000);
 try{await assert.rejects(deliveryWrite('/delivery',{method:'POST'},async(_,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))},10),/Check saved progress/);assert.equal(calls,1)}finally{clearTimeout(keepAlive)}
});
test('mixed preparation preserves successful siblings when one write loses its reply',async()=>{
 const saved=[],progress=[];const errors=await prepareDraftBatch(['one','bad','two'],async id=>{
  const response=await deliveryWrite('/delivery',{method:'POST'},async()=>{if(id==='bad')throw Error('connection lost');saved.push(id);return Response.json({id})});return response.json();
 },done=>progress.push(done));
 assert.equal(errors.length,1);assert.deepEqual(saved.sort(),['one','two']);assert.deepEqual(progress,[1,2,3]);
});
test('only a matching current receipt resolves uncertainty; old, unreadable and failed receipts do not',()=>{
 for(const status of ['waiting','delivering','completed'])assert.equal(resolvedDeliveryUncertainty({status,choicesChanged:false}),true);
 for(const item of [{status:'completed'},{status:'completed',choicesChanged:true},{status:'completed',choicesChanged:false,choiceCheckUnavailable:true},{status:'failed',choicesChanged:false}])assert.equal(resolvedDeliveryUncertainty(item),false);
});
