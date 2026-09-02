import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {readPrintifyPublishState} from "../app/api/printify/publish-state.ts";

const response=(status,body)=>new Response(body===undefined?null:JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

test("a manually published Printify draft resolves to its existing Etsy listing",async()=>{
  let calls=0;
  const result=await readPrintifyPublishState(async()=>{calls++;return response(200,{external:{id:"4566885576"}})},"token",7,"product");
  assert.deepEqual(result,{state:"published",listingId:4566885576});
  assert.equal(calls,1);
});

test("only a successful readable product with no external id is confirmed unpublished",async()=>{
  assert.deepEqual(await readPrintifyPublishState(async()=>response(200,{external:null}),"token",7,"product"),{state:"unpublished"});
});

test("network, HTTP, and malformed responses are unknown rather than unpublished",async()=>{
  const network=await readPrintifyPublishState(async()=>{throw new Error("timeout")},"token",7,"product");
  const upstream=await readPrintifyPublishState(async()=>response(503,{error:"busy"}),"token",7,"product");
  const malformed=await readPrintifyPublishState(async()=>new Response("not-json",{status:200}),"token",7,"product");
  assert.equal(network.state,"unknown");
  assert.equal(upstream.state,"unknown");
  assert.equal(malformed.state,"unknown");
});

test("the paid publish call is unreachable while Printify state is unknown",async()=>{
  const queue=await readFile(new URL("../app/api/printify/drafts/publish/queue.ts",import.meta.url),"utf8");
  const lookup=queue.indexOf("const publishState=await readPrintifyPublishState");
  const stop=queue.indexOf('if(publishState.state==="unknown")throw new Error',lookup);
  const publish=queue.indexOf("/publish.json`,{method:\"POST\"",lookup);
  assert.ok(lookup>=0&&stop>lookup&&publish>stop,"unknown status must throw before the paid publish endpoint can be called");
  assert.match(queue,/Goldie stopped before publishing so it cannot create a duplicate Etsy listing/);
});
