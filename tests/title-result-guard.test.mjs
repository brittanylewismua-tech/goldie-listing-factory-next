import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {titleResultGuard} from '../app/title-result-guard.ts';
import {runBounded} from '../app/bounded-work.ts';
const original={id:'art',title:'Original',tags:['original']};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const result={title:'Generated',tags:['generated'],titleWarning:''};
test('seller edits invalidate a pending title even if changed back',()=>{
  const guard=titleResultGuard();guard.update('tee',[original]);const ticket=guard.begin('art');
  guard.update('tee',[{...original,title:'New'}]);guard.update('tee',[original]);assert.equal(guard.current(ticket),false);
});
test('product switching, removal and newer requests invalidate older tickets',()=>{
  const guard=titleResultGuard();guard.update('tee',[original]);const first=guard.begin('art');const second=guard.begin('art');
  assert.equal(guard.current(first),false);assert.equal(guard.current(second),true);
  guard.update('hoodie',[original]);guard.update('tee',[original]);assert.equal(guard.current(second),false);
  const third=guard.begin('art');guard.update('tee',[]);guard.update('tee',[original]);assert.equal(guard.current(third),false);
});
test('unrelated description/preparation updates do not cancel a valid title',()=>{
  const guard=titleResultGuard();guard.update('tee',[original]);const ticket=guard.begin('art');
  guard.update('tee',[{...original,blurb:'Prepared description'}]);assert.equal(guard.current(ticket),true);
});
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
function compile(start,end,name){const code=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));return new Function('env',`with(env){${ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return ${name};}`);}
const individualStart=source.indexOf('  async function build(){',source.indexOf('function IndividualAutoTitle'));
const individualBody=source.slice(individualStart,source.indexOf('return <>{design.titleWarning',individualStart));
const individualFactory=new Function('env',`with(env){${ts.transpileModule(individualBody,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return build;}`);
function individual(){
  const guard=titleResultGuard();guard.update('tee',[original]);const gate=deferred(),applied=[],messages=[];let calls=0;
  const env={bank:{keywords:['original']},design:original,template:{id:'tee'},useCommas:true,paused:false,resultGuard:{current:guard},buildingRef:{current:false},setBuilding(){},setMessage:m=>messages.push(m),autoTitleForDesign:()=>{calls++;return gate.promise;},onApply:(...args)=>applied.push(args)};
  return {guard,gate,applied,messages,env,build:individualFactory(env),calls:()=>calls};
}
test('actual individual generator discards a response after manual editing',async()=>{
  const h=individual(),work=h.build();h.guard.update('tee',[{...original,title:'Seller edit'}]);h.gate.resolve(result);await work;
  assert.equal(h.applied.length,0);assert.match(h.messages.at(-1),/newer edits were kept/);assert.equal(h.env.buildingRef.current,false);
});
test('actual individual generator applies normal results and rejects double submission',async()=>{
  const h=individual(),work=h.build();await h.build();assert.equal(h.calls(),1);h.gate.resolve(result);await work;assert.deepEqual(h.applied,[['Generated',['generated'],'']]);
});
test('actual individual generator never applies a result after unmount',async()=>{
  const h=individual(),work=h.build();h.guard.clear();h.gate.resolve(result);await work;assert.equal(h.applied.length,0);
});
const batchFactory=compile('  async function buildBatchTitle(){','\n  /* D546','buildBatchTitle');
function batch(){
  const files=[original,{...original,id:'second'}],guard=titleResultGuard();guard.update('tee',files);
  const gates=[deferred(),deferred()],updates=[],messages=[];let calls=0;
  const env={files,autoTitleBank:{keywords:['original']},batchHeldByAnotherTab:false,batchSaveConflict:"",batchTitleBuilding:{current:false},batchTitleGuard:{current:guard},batchTitleScope:'tee',titleJoiner:', ',templateDetails:{id:'tee'},setTitleBuilding(){},setTitleBuildMessage:m=>messages.push(m),runBounded,autoTitleForDesign:()=>gates[calls++].promise,updateDesign:(id,value)=>updates.push({id,value}),pulseTitle(){},styledTitle:v=>v};
  return {files,guard,gates,updates,messages,env,build:batchFactory(env),calls:()=>calls};
}
test('actual batch generator protects one edited listing while applying its untouched sibling',async()=>{
  const h=batch(),work=h.build();h.guard.update('tee',[{...original,title:'Seller edit'},h.files[1]]);h.gates.forEach(g=>g.resolve(result));await work;
  assert.deepEqual(h.updates.map(v=>v.id),['second']);assert.match(h.messages.at(-1),/1 listing kept its newer edits/);
});
test('actual batch generator discards all results after switching product',async()=>{
  const h=batch(),work=h.build();h.guard.update('hoodie',h.files);h.gates.forEach(g=>g.resolve(result));await work;
  assert.equal(h.updates.length,0);assert.equal(h.env.batchTitleBuilding.current,false);
});
test('actual batch generator ignores a second click while the first request is active',async()=>{
  const h=batch(),work=h.build();await h.build();assert.equal(h.calls(),2);h.gates.forEach(g=>g.resolve(result));await work;assert.equal(h.updates.length,2);
});
