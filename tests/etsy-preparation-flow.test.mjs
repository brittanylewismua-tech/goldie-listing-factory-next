import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {etsyPreparationCoordinator} from '../app/etsy-preparation-coordinator.ts';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  function prepareOne('),source.indexOf('  async function retryOneEtsyListing'));
const compiled=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const instantiate=new Function('env',`with(env){${compiled};return prepareOne}`);
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}};
function harness(){
  const shared={etsyPreparation:{current:etsyPreparationCoordinator()},preparationDesigns:{current:new Map()},batchIdRef:{current:''},templateDetailsRef:{current:null}},requests=[],updates=[];
  function product(id){
    const templateDetails={id,blueprintTitle:id},design={id:'same-art',title:'Original',tags:['test']},scope=JSON.stringify([id,id]);
    shared.preparationDesigns.current.set(scope,[design]);
    const env={...shared,preparationScope:scope,templateDetails,activeRecipe:null,description:'Product facts',drafts:[{id:`draft-${id}`,clientId:design.id}],
      refreshEtsyPreparation(){},updateDesign(designId,change){updates.push({product:id,designId,change})},designPreviewDataUrl:async()=> 'local-test-image',productEtsyDefaults:()=>({}),PHYSICAL_ETSY_FIELDS:/material/i,
      resolveEtsyOptions:async details=>({...details,taxonomyId:id==='tee'?1:2,category:id,properties:[{label:'Material',value:id}]}),
      fetch:async(url,options)=>{const body=JSON.parse(options.body);if(url==='/api/listing-intelligence'){const gate=deferred();requests.push({id,body,gate});return gate.promise}requests.push({id,body,url});return {ok:true,json:async()=>({ok:true})}}};
    return {design,scope,prepare:instantiate(env),activate(){shared.batchIdRef.current=id;shared.templateDetailsRef.current=templateDetails}};
  }
  return {shared,requests,updates,product};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const respond=request=>request.gate.resolve({ok:true,json:async()=>({details:{category:request.id,attributes:{},blurb:'Prepared'}})});

test('actual preparation function deduplicates rapid edits and never sends the captured old title',async()=>{
  const h=harness(),tee=h.product('tee');tee.activate();
  const one=tee.prepare(tee.design);await settle();
  h.shared.preparationDesigns.current.set(tee.scope,[{...tee.design,title:'Latest seller title',tags:['latest']}]);
  const two=tee.prepare({...tee.design,title:'Latest seller title'});
  assert.equal(one,two);assert.equal(h.requests.length,1);
  respond(h.requests[0]);await one;
  const save=h.requests.find(item=>item.url);assert.deepEqual(Object.keys(save.body).sort(),['etsyDetails','productId']);
  assert.equal(h.shared.preparationDesigns.current.get(tee.scope)[0].title,'Latest seller title');
  await tee.prepare(tee.design);assert.equal(h.requests.filter(item=>item.gate).length,1);
});

test('actual overlapping tee and hoodie preparation saves exact drafts and only updates the active product',async()=>{
  const h=harness(),tee=h.product('tee'),hoodie=h.product('hoodie');tee.activate();
  const first=tee.prepare(tee.design);await settle();hoodie.activate();
  const second=hoodie.prepare(hoodie.design);await settle();
  respond(h.requests.find(item=>item.id==='hoodie'));await second;
  const updatesBefore=h.updates.length;
  respond(h.requests.find(item=>item.id==='tee'));await first;
  assert.equal(h.updates.length,updatesBefore,'inactive completion does not mutate the visible product');
  const saves=h.requests.filter(item=>item.url);
  assert.deepEqual(saves.map(item=>[item.body.productId,item.body.etsyDetails.category]),[['draft-hoodie','hoodie'],['draft-tee','tee']]);
});

test('actual preparation retains seller Etsy settings supplied while AI was loading',async()=>{
  const h=harness(),tee=h.product('tee');tee.activate();const task=tee.prepare(tee.design);await settle();
  const seller={category:'Seller category',blurb:'Seller text',personalization:{enabled:false}};
  h.shared.preparationDesigns.current.set(tee.scope,[{...tee.design,etsy:seller,blurb:'Seller text'}]);
  respond(h.requests[0]);assert.equal(await task,seller);
  assert.deepEqual(h.requests.find(item=>item.url).body.etsyDetails,seller);
});

test('manual preparation checks its source product again after every defaults-save await',()=>{
  const manual=source.slice(source.indexOf('  async function continueToEtsyDetails'),source.indexOf('  async function saveAllEtsyDetails'));
  assert.match(manual,/const sourceScope=preparationScope/);
  assert.equal((manual.match(/if\(!stillCurrent\(\)\)return/g)||[]).length,2);
  assert.match(source,/setActiveRecipe\(current=>current\?\.id===updated.id\?/);
});
