import test from "node:test";
import assert from "node:assert/strict";
import {printifyCameraMockups,printifyMockupSet} from "../app/printify-camera-mockups.ts";
import fs from "node:fs";

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

test("D1061 derives one instant color thumbnail per blueprint color without widening the draft",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    print_provider:{options:[{type:"color",items:[{id:10},{id:20}]}]},
    render_settings:{cameras:[{id:92570,label:"Front",position:"front",is_default:1}]},
  }));
  try{
    const result=await printifyMockupSet({productId:"draft",blueprintId:6,providerId:39,variants:[
      {id:101,is_enabled:true,is_default:true,options:[10,1]},
      {id:102,is_enabled:true,options:[10,2]},
      {id:201,is_enabled:false,options:[20,1]},
    ]});
    assert.deepEqual(result.colorDetails.map(item=>item.variantIds),[[101],[201]]);
    assert.match(result.colorDetails[1].src,/\/draft\/201\/92570\//);
  }finally{globalThis.fetch=original}
});

test("D1059 fails open when Printify camera metadata is unavailable",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error("offline")};
  try{assert.deepEqual(await printifyCameraMockups({productId:"draft",blueprintId:6,providerId:39,variants:[{id:1,is_enabled:true}]}),[])}
  finally{globalThis.fetch=original}
});

test("D1060 disables late browser scroll restoration for every workflow transition",()=>{
  const page=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/window\.history\.scrollRestoration="manual"/);
  assert.match(page,/window\.setTimeout\(reset,80\).*window\.setTimeout\(reset,240\)/s);
  assert.match(page,/document\.querySelector<HTMLElement>\("\.factory-main"\)/);
});
