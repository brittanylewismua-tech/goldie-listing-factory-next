import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {UPDATE_SOURCES,validateCandidate} from '../app/platform-update-model.ts';
const source=UPDATE_SOURCES[0],quote='The transaction fee will increase on October 1 for affected sellers.';
const good={priority:'ACTION REQUIRED',evidence:'Confirmed platform change',title:'Transaction fee changes October 1',impact:'Affected sellers pay the updated rate.',action:'Review the updated fee for your region.',topic:'transaction-fee',quote,sourceUrl:source.url,urgent:false};
const text=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
const body=text.slice(text.indexOf('export async function hashText'),text.indexOf('export async function collectPlatformUpdates')).replace('export async function hashText','async function hashText');
const make=new Function('deps',`with(deps){${ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return summarize;}`);
function editor(outputs){const prompts=[],billed=[];const run=make({MODEL:'test',crypto:webcrypto,TextEncoder,process:{env:{FAL_KEY:'test'}},validateCandidate,reserveSpend:async()=>({allowed:true,id:'reservation'}),settleSpend:async()=>billed.push('settled'),failSpend:async()=>billed.push('failed'),recordFalUsage:async()=>{},fetch:async(_url,options)=>{prompts.push(JSON.parse(options.body).prompt);return new Response(JSON.stringify({output:JSON.stringify({items:outputs[prompts.length-1]})}));},AbortSignal});return {run:()=>run(source,'Before',quote,quote,[]),prompts,billed};}
test('an invalid generated update gets one evidence-constrained retry and only the validated result survives',async()=>{const e=editor([[{...good,quote:'This invented quote is not in the source document.'}],[good]]);const items=await e.run();assert.equal(items.length,1);assert.equal(items[0].title,good.title);assert.equal(e.prompts.length,2);assert.match(JSON.parse(e.prompts[1]).validationFeedback,/failed validation/);assert.deepEqual(e.billed,['failed','settled']);});
test('two invalid summaries remain a failure rather than publishing invented facts or claiming no changes',async()=>{const bad={...good,sourceUrl:'https://example.com/fake'};const e=editor([[bad],[bad]]);await assert.rejects(e.run,/Update evidence needs review/);assert.equal(e.prompts.length,2);assert.deepEqual(e.billed,['failed','failed']);});
test('valid summaries never incur an unnecessary repair call',async()=>{const e=editor([[good]]);assert.equal((await e.run()).length,1);assert.equal(e.prompts.length,1);});
