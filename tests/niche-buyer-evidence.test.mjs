import test from 'node:test';
import assert from 'node:assert/strict';
import {buyerEvidence,validateBuyerFindings} from '../app/niche-buyer-evidence.ts';
const at=1800000000;
const review=(id,text,listingId=10)=>({transactionId:id,text,listingId,at,rating:5});
const project=(reviews)=>({name:'feminist shirts',selected:[1],shops:[{id:1,name:'Shop A',listings:[{id:10,title:'Feminist shirt'}],reviews},{id:2,name:'Unselected',listings:[{id:20,title:'Other'}],reviews:[review(90000,'I bought this for all my family members.',20)]}]});
const one='I bought this to wear to the march with my sister.';
const two='We wore these shirts at the protest last weekend.';
test('buyer sources exclude unrelated, future, old, duplicated and unselected reviews',()=>{
 const p=project([review(1,one),review(2,one),review(1,two),review(3,two,99),{...review(4,two),at:at+1},{...review(5,two),at:at-366*86400},review(6,'Great shirt')]);
 const input=buyerEvidence(p,at);assert.equal(input.sources.length,1);assert.equal(input.sources[0].listingId,10);
});
test('source version changes with meaningful evidence, not refreshed image metadata',()=>{
 const p=project([review(1,one)]),first=buyerEvidence(p,at).sourceKey;p.shops[0].listings[0].image='new-image';assert.equal(buyerEvidence(p,at).sourceKey,first);p.shops[0].reviews[0].text=two;assert.notEqual(buyerEvidence(p,at).sourceKey,first);p.selected=[];assert.equal(buyerEvidence(p,at).sources.length,0);
});
test('findings require exact real quotes and independently counted sources',()=>{
 const input=buyerEvidence(project([review(1,one),review(2,two)]),at);
 const f={title:'Wearing the message to protests',explanation:'These reviews describe wearing the shirts to a march and a protest.',kind:'pattern',evidence:[{id:1,quote:one},{id:2,quote:two}]};
 const valid=validateBuyerFindings({findings:[f]},input.sources);assert.equal(valid.length,1);assert.equal(valid[0].evidence[0].shop,'Shop A');
 assert.throws(()=>validateBuyerFindings({findings:[{...f,evidence:[{id:1,quote:one},{id:999,quote:two}]}]},input.sources));
 assert.throws(()=>validateBuyerFindings({findings:[{...f,evidence:[{id:1,quote:'An invented reason to buy this product.'},{id:2,quote:two}]}]},input.sources));
 assert.throws(()=>validateBuyerFindings({findings:[{...f,evidence:[{id:1,quote:one},{id:1,quote:one}]}]},input.sources));
});
test('generic categories are rejected; a specific request can be explicitly supported by one review',()=>{
 const text='I wish this exact design came on a tote bag for my books.',input=buyerEvidence(project([review(1,text)]),at);
 const f={title:'A tote version of the same design',explanation:'One review asks for this design on a tote bag to carry books.',kind:'request',evidence:[{id:1,quote:text}]};
 assert.equal(validateBuyerFindings({findings:[f]},input.sources)[0].kind,'request');
 assert.throws(()=>validateBuyerFindings({findings:[{...f,title:'Family recipients'}]},input.sources));
 assert.deepEqual(validateBuyerFindings({findings:[]},input.sources),[]);
});
test('balanced selection does not let one large shop consume the whole input',()=>{
 const p=project(Array.from({length:1100},(_,i)=>review(i+1,`${one} This review includes order ${i}.`)));
 p.selected=[1,2];const input=buyerEvidence(p,at);assert(input.sources.some(r=>r.shopId===2));assert(input.sources.length<=1000);
});
