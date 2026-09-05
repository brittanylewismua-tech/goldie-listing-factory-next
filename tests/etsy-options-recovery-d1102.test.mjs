import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=readFileSync(new URL('../app/etsy-options-request.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source.replace('export async function','async function'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const requestOptions=new Function(`${code};return requestEtsyOptions;`)();
test('taxonomy recovers from a transient HTML resource error',async()=>{
  let calls=0;const pauses=[];
  const result=await requestOptions({},async()=>++calls===1?new Response('<html>resource limit</html>',{status:503}):Response.json({selected:{id:1,path:'T-Shirts'}}),async ms=>{pauses.push(ms)});
  assert.equal(calls,2);assert.equal(result.selected.id,1);assert.deepEqual(pauses,[500]);
});
test('persistent service failure is bounded and human-readable',async()=>{
  let calls=0;
  await assert.rejects(()=>requestOptions({},async()=>{calls++;return new Response('<html>error</html>',{status:503})},async()=>{}),/temporarily unavailable/);
  assert.equal(calls,3);
});
test('authentication failure is not retried',async()=>{
  let calls=0;
  await assert.rejects(()=>requestOptions({},async()=>{calls++;return Response.json({error:'Sign in again'},{status:401})},async()=>{}),/Sign in again/);
  assert.equal(calls,1);
});
