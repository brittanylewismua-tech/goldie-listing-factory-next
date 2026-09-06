import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedVisionFetch} from '../app/paid-vision.ts';
const url='https://fal.run/openrouter/router/vision',init={method:'POST',body:'{"prompt":"local-only"}'};
test('twenty concurrent callers recover from rejected busy responses without losing bodies',async()=>{
  let accepted=0;
  await Promise.all(Array.from({length:20},async()=>{let calls=0;const delays=[];const response=await boundedVisionFetch(url,init,async(u,i)=>{assert.equal(JSON.parse(i.body).prompt,'local-only');calls++;if(calls===1)return new Response('busy',{status:429,headers:{'Retry-After':'2'}});accepted++;return Response.json({output:'ok'});},async(ms)=>delays.push(ms));assert.equal(response.status,200);assert.equal(calls,2);assert.deepEqual(delays,[2000]);}));assert.equal(accepted,20);
});
test('persistent busy service is bounded to three attempts',async()=>{let calls=0;const r=await boundedVisionFetch(url,init,async()=>{calls++;return new Response('busy',{status:429});},async()=>{});assert.equal(r.status,429);assert.equal(calls,3);});
test('long Retry-After is respected without retrying early',async()=>{let calls=0;await boundedVisionFetch(url,init,async()=>{calls++;return new Response('busy',{status:429,headers:{'Retry-After':'60'}});},async()=>assert.fail());assert.equal(calls,1);});
test('server failure is never automatically retried as a potentially paid call',async()=>{let calls=0;const r=await boundedVisionFetch(url,init,async()=>{calls++;return new Response('failed',{status:500});});assert.equal(r.status,500);assert.equal(calls,1);});
test('cancelled caller does not send another provider request',async()=>{const abort=new AbortController();let calls=0;await assert.rejects(boundedVisionFetch(url,{...init,signal:abort.signal},async()=>{calls++;return new Response('busy',{status:429});},async()=>{abort.abort();}));assert.equal(calls,1);});
