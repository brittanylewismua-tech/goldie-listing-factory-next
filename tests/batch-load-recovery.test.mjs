import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function restoreBatchById('),end=source.indexOf('  useEffect(()=>{if(activeRecipe',start);
const factory=new Function('env',`with(env){${ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return restoreBatchById;}`);
function fixture(fetcher){const messages=[],loading=[];const env={window:{location:{href:'https://www.thegoldiesuite.com/listing-factory?step=finish&batch=qa'}},batchRestoreFailed:{current:false},batchRestoreRetryUrl:{current:''},setBatchRestoreError:m=>messages.push(m),snapshotReady:{current:false},setRestoringBatch:v=>loading.push(v),batchFetch:fetcher};return{env,messages,loading,restore:factory(env)}}
test('timeout, server failure, and unreadable payload retain a retry destination and end loading without rejection',async()=>{
 for(const fetcher of [async()=>{throw Error('timeout')},async()=>Response.json({error:'busy'},{status:503}),async()=>Response.json({})]){
  const f=fixture(fetcher);assert.equal(await f.restore('qa','finish',null),false);assert.equal(f.env.batchRestoreFailed.current,true);assert.match(f.messages.at(-1),/saved work has not been cleared/);assert.match(f.env.batchRestoreRetryUrl.current,/step=finish&batch=qa/);assert.deepEqual(f.loading,[false]);
 }
});
test('a confirmed missing batch remains distinct from a temporary load failure',async()=>{const f=fixture(async()=>Response.json({},{status:404}));assert.equal(await f.restore('qa','finish',null),false);assert.equal(f.env.batchRestoreFailed.current,false);assert.deepEqual(f.messages,['']);});
test('initial restore does not erase the batch address on a temporary failure',()=>{assert.match(source,/if\(restored\|\|batchRestoreFailed\.current\)return;setRestoreNotice/);assert.match(source,/window\.location\.assign\(batchRestoreRetryUrl\.current\|\|window\.location\.href\)/)});
