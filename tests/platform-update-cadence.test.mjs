import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const sourceText=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
const body=ts.transpileModule(sourceText.slice(sourceText.indexOf('export async function collectPlatformUpdates')).replace('export async function','async function'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const make=new Function('deps',`with(deps){${body};return collectPlatformUpdates;}`);
function collector(attemptAge){
 const now=Math.floor(Date.now()/1000),writes=[],requests=[];
 const stored={content:'Existing source evidence',checked_at:now-86400,last_error:'Update evidence needs review',attempted_at:now-attemptAge};
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sql.includes('LEFT JOIN')?stored:null},async all(){return {results:[]}},async run(){writes.push({sql,args});return {meta:{changes:1}}}}}};
 const run=make({crypto:webcrypto,ensureUpdateTables:async()=>{},updateDb:()=>db,UPDATE_SOURCES:[{id:'test-source',name:'Official source',fetchUrl:'https://example.com'}],fetch:async(url)=>{requests.push(url);return new Response('Unavailable',{status:503})}});
 return {run,writes,requests,stored};
}
test('a failed source waits twenty minutes from its most recent attempt instead of retrying every scheduled tick',async()=>{const c=collector(60);const result=await c.run();assert.equal(c.requests.length,0);assert.equal(result.failed,0);assert.equal(c.writes.some(x=>x.sql.includes('source_attempts')),false);});
test('a failed source retries after its cooldown and keeps failed evidence separate from successful freshness',async()=>{const c=collector(1201);const result=await c.run();assert.equal(c.requests.length,1);assert.equal(result.failed,1);const attempt=c.writes.find(x=>x.sql.includes('source_attempts'));assert.equal(attempt.args[0],'test-source');assert.ok(attempt.args[1]>c.stored.checked_at);const failure=c.writes.find(x=>x.sql.includes('platform_update_sources'));assert.match(failure.sql,/UPDATE SET last_error=/);assert.doesNotMatch(failure.sql,/UPDATE SET checked_at=/);});
