import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function persistRunNow('),end=source.indexOf('  async function persistBatchNow',start);
const compile=new Function('env',`with(env){${ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return persistRunNow;}`);
function run(status){return compile({batchReceipt:null,runIdRef:{current:'run'},activeBundle:{name:'QA'},bundleRecipes:[{id:'one'},{id:'two'}],running:false,workflowStep:'finish',files:[{}],activeRecipe:{id:'one'},runStartedRef:{current:'today'},batchFetch:async()=>Response.json({},{status})})()}
test('a refused parent summary blocks preparation instead of reporting a saved bundle',async()=>{await assert.rejects(run(409),/summary could not be saved/);await assert.rejects(run(503),/summary could not be saved/);await assert.doesNotReject(run(200))});
