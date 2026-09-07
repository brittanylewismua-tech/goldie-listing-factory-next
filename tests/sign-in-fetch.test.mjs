import test from 'node:test';import assert from 'node:assert/strict';import {createSignInFetch} from '../app/sign-in-fetch.ts';
test('stalled email-link request aborts once without automatic resend',async()=>{
 let calls=0;const fetcher=createSignInFetch(async(_,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))},10),keep=setTimeout(()=>{},1000);
 try{await assert.rejects(fetcher('https://auth.example/auth/v1/otp',{method:'POST'}),{name:'TimeoutError'});assert.equal(calls,1)}finally{clearTimeout(keep)}
});
test('session and OAuth requests pass through unchanged',async()=>{
 for(const endpoint of ['token','user','authorize','logout']){const init={method:'POST'},fetcher=createSignInFetch(async(input,options)=>{assert.equal(input,`https://auth.example/auth/v1/${endpoint}`);assert.equal(options,init);return Response.json({ok:true})});await fetcher(`https://auth.example/auth/v1/${endpoint}`,init)}
});
test('caller cancellation is retained and successful email replies are not changed',async()=>{
 const controller=new AbortController();controller.abort();const fetcher=createSignInFetch(async(_,{signal})=>{assert.equal(signal.aborted,true);return Response.json({ok:true})});assert.deepEqual(await (await fetcher('https://auth.example/auth/v1/otp',{signal:controller.signal})).json(),{ok:true});
});
