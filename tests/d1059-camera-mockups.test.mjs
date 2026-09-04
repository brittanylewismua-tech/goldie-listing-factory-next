import test from "node:test";
import assert from "node:assert/strict";
import {printifyCameraMockups} from "../app/printify-camera-mockups.ts";

test("D1059 builds every compatible Printify camera view for one enabled variant",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.equal(String(url),"https://printify.com/designer-api/api/v2/blueprints/6/39?salesChannel=etsy");
    return new Response(JSON.stringify({render_settings:{cameras:[
      {id:92570,label:"Front",position:"front",option_id:null,variant_id:null},
      {id:92571,label:"Back",position:"back",option_id:null,variant_id:null},
      {id:100,label:"Wrong option",position:"other",option_id:999,variant_id:null},
      {id:101,label:"Right option",position:"other",option_id:521,variant_id:null},
      {id:102,label:"Wrong variant",position:"other",option_id:null,variant_id:77},
    ]}}));
  };
  try{
    const result=await printifyCameraMockups({productId:"draft",blueprintId:6,providerId:39,variants:[{id:12100,is_enabled:true,is_default:true,options:[521,14]}]});
    assert.deepEqual(result.map(item=>item.position),["front","back","other"]);
    assert.match(result[1].src,/\/draft\/12100\/92571\/\?s=800&camera_label=Back$/);
    assert.deepEqual(result[0].variantIds,[12100]);
  }finally{globalThis.fetch=original}
});

test("D1059 fails open when Printify camera metadata is unavailable",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error("offline")};
  try{assert.deepEqual(await printifyCameraMockups({productId:"draft",blueprintId:6,providerId:39,variants:[{id:1,is_enabled:true}]}),[])}
  finally{globalThis.fetch=original}
});
