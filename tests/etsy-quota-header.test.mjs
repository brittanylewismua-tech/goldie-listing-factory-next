import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
function client(){
 const writes=[];
 const DB={prepare(sql){return {bind(...values){writes.push({sql,values});return this;},async first(){if(sql.includes('SUM(calls)'))return {calls:100,rate_limited:0};return null;},async all(){return {results:[]};}};},async batch(){}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/etsy/client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require(name){if(name==='cloudflare:workers')return {env:{DB,ETSY_QPD_LIMIT:'5000'}};if(name.includes('request-pacing')||name.includes('token-crypto'))return {};throw Error(name);},Date,Math,Number,Response,Promise,Map,Set,Error});return {exports,writes};
}
test('a missing quota header cannot overwrite remaining capacity with zero',async()=>{
 const c=client();await c.exports.recordEtsyCall(new Response('{}'),'niche-research');assert.equal(c.writes.some(w=>w.sql.includes('remaining_today')),false);
 await c.exports.recordEtsyCall(new Response('{}',{headers:{'x-remaining-today':'0'}}),'niche-research');assert(c.writes.some(w=>w.sql.includes('remaining_today')&&w.values[0]===0));
});
test('a missing live quota observation uses counted usage rather than treating the limit as spent',async()=>{
 const c=client();const b=await c.exports.etsyBudget();assert.equal(b.used,100);assert.equal(b.remaining,3900);
});
