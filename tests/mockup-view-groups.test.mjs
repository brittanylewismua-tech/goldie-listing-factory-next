import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const {mockupViewGroups}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(read('app/mockup-view-groups.ts'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
const entry=(index,variant,camera)=>({index,src:`https://images.printify.com/mockup/product/${variant}/${index}/x.jpg?camera_label=${camera}`});
test('plain front and back views group across colors rather than showing first-color cameras',()=>{
 const groups=mockupViewGroups([entry(0,11,'front'),entry(1,11,'back'),entry(2,11,'lifestyle-1'),entry(3,12,'front'),entry(4,12,'back')],[{id:1,title:'Black'},{id:2,title:'White'}],[{id:11,colorId:1},{id:12,colorId:2}]);
 assert.deepEqual(groups.map(g=>g.key),['front','back','lifestyle-1']);
 assert.deepEqual(groups[0].entries.map(e=>[e.index,e.color]),[[0,'Black'],[3,'White']]);
 assert.equal(groups[2].primary,false);
});
test('unknown, model and alternate cameras never masquerade as plain product views',()=>{
 const groups=mockupViewGroups([entry(2,99,'front-person-1'),entry(4,99,'front-2'),{src:'https://example.com/photo.jpg',index:7}]);
 assert.ok(groups.every(g=>!g.primary));
 assert.deepEqual(groups.flatMap(g=>g.entries).map(e=>e.index).sort(),[2,4,7]);
 assert.ok(groups.every(g=>g.entries.every(e=>e.color==='')));
});
test('color labels require unambiguous product metadata and never array order',()=>{
 const colors=[{id:2,title:'White',variantIds:[12]},{id:1,title:'Black',variantIds:[11]}];
 const input=[entry(0,11,'front'),entry(1,12,'front')];
 assert.deepEqual(mockupViewGroups(input,colors)[0].entries.map(e=>e.color),['Black','White']);
 const details=[{src:input[0].src,position:'front',variantIds:[11,12]}];
 assert.equal(mockupViewGroups(input,colors,[],details)[0].entries[0].color,'Black');
 const unknown=[{src:'https://images.printify.com/photo.jpg',index:0}];
 assert.equal(mockupViewGroups(unknown,colors,[],[{src:unknown[0].src,position:'front',variantIds:[11,12]}])[0].entries[0].color,'');
});
test('manual group and individual prices preserve cents while automatic whole-number pricing stays available',()=>{
 const app=read('app/listing-factory-app.tsx');
 for(const fn of ['changeCostGroupPrice','changeIndividualPrice']){
   const start=app.indexOf('function '+fn),end=app.indexOf('\n  function ',start+1),source=app.slice(start,end);
   assert.doesNotMatch(source,/wholePrice\(cents\)/);
   assert.match(source,/manualPriceEdit\.current=true/);
 }
 let output;
 const functions=['changeCostGroupPrice','changeIndividualPrice'].map(fn=>{const start=app.indexOf('function '+fn);return app.slice(start,app.indexOf('\n  function ',start+1))}).join('\n');
 const js=ts.transpile(functions,{target:ts.ScriptTarget.ES2022});
 const api=new Function('variants','prices','onPrices','manualPriceEdit','setRecommendationMessage','optionNoun','optionNouns',js+';return {changeCostGroupPrice,changeIndividualPrice};')([{id:1,cost:1000,title:'Black'},{id:2,cost:1000,title:'White'}],{'1':2400,'2':2400},value=>output=value,{current:false},()=>{},'color and size combination','color and size combinations');
 api.changeCostGroupPrice(1000,2479);assert.deepEqual(output,{'1':2479,'2':2479});
 api.changeIndividualPrice({id:1,cost:1000,title:'Black'},2355);assert.deepEqual(output,{'1':2355,'2':2400});
 api.changeIndividualPrice({id:1,cost:1000,title:'Black'},900);assert.equal(output['1'],1000);
 assert.match(app,/function toggleWholeNumberPricing[\s\S]{0,500}Math\.ceil\(current\/100\)\*100/);
});
test('external Printify navigation is not disabled by local publishing gates',()=>{
 const app=read('app/listing-factory-app.tsx'),start=app.indexOf('href="https://printify.com/app/store/products"'),link=app.slice(start-45,app.indexOf('</a>',start));
 assert.ok(start>0);assert.doesNotMatch(link,/aria-disabled|handoffBlockers/);
 assert.match(link,/target="_blank"/);assert.match(app,/photoDeliveryRef/);
 assert.doesNotMatch(app,/Add your photo set|Replace previous mockup selection checked/);
 assert.match(app,/Save a copy for social media or your own use/);
});

test('main views show one chosen-color preview while extra sizes and colors remain accessible',()=>{
 const colors=[{id:1,title:'Black',variantIds:[11,12]},{id:2,title:'White',variantIds:[21]},{id:3,title:'Maroon',variantIds:[31]}];
 const input=[entry(0,11,'front'),entry(1,12,'front'),entry(2,21,'front'),entry(3,31,'front')];
 const groups=mockupViewGroups(input,colors,[],[],{selectedIndices:[1],colorIds:[1,3]});
 assert.deepEqual(groups.find(g=>g.key==='front').entries.map(e=>e.index),[1,3]);
 assert.deepEqual(groups.find(g=>g.key==='additional-front').entries.map(e=>e.index),[0,2]);
 assert.deepEqual(groups.flatMap(g=>g.entries).map(e=>e.index).sort(),[0,1,2,3]);
 assert.equal(groups.find(g=>g.key==='additional-front').primary,false);
});
