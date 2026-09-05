import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { boundedVisionFetch, MAX_VISION_OUTPUT_TOKENS } from '../app/paid-vision.ts';

test('vision output is bounded and paid web search cannot be enabled',async()=>{
  let calls=0;
  const response=await boundedVisionFetch('https://fal.run/openrouter/router/vision',{method:'POST',body:JSON.stringify({prompt:'test',max_tokens:999999,enable_web_search:true})},async(_url,init)=>{
    calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,MAX_VISION_OUTPUT_TOKENS);assert.equal(body.enable_web_search,false);
    return Response.json({output:'{"ok":true}'});
  });
  assert.equal(calls,1);assert.equal((await response.json()).output,'{"ok":true}');
});

test('paid model telemetry contains only usage, not private request/response content',async()=>{
  const logs=[];const previous=console.info;console.info=value=>logs.push(value);
  try {
    const result=await boundedVisionFetch('https://fal.run/openrouter/router/vision',{body:JSON.stringify({prompt:'PRIVATE PROMPT',image_urls:['PRIVATE IMAGE']})},async()=>Response.json({output:'PRIVATE OUTPUT',usage:{cost:0.001,prompt_tokens:10,completion_tokens:20}}));
    assert.equal((await result.json()).output,'PRIVATE OUTPUT');
    assert.equal(JSON.parse(logs[0]).cost_usd,0.001);assert.doesNotMatch(logs.join(''),/PRIVATE/);
  } finally { console.info=previous; }
});

// Execute the actual route, replacing only its infrastructure imports.
// An unauthenticated call must stop BEFORE parsing images or spending money.
async function analyzeRoute(user, block) {
  const source=readFileSync(new URL('../app/api/mockups/analyze/route.ts',import.meta.url),'utf8');
  const stripped=source.replace(/^import .*;\n/gm,'');
  const compiled=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const preamble=`const NextResponse={json:(body,init)=>Response.json(body,init)}; const getChatGPTUser=async()=>(${JSON.stringify(user)}); const customerLaunchBlock=async()=>(${JSON.stringify(block)});`;
  return import('data:text/javascript;base64,'+Buffer.from(preamble+compiled).toString('base64'));
}
test('anonymous scene analysis cannot consume paid inference',async()=>{
  const route=await analyzeRoute(null,null);
  const response=await route.POST({json(){throw new Error('must not parse request');}});
  assert.equal(response.status,401);
});
test('unentitled scene analysis cannot consume paid inference',async()=>{
  const route=await analyzeRoute({userId:'test'},'Choose a plan');
  const response=await route.POST({json(){throw new Error('must not parse request');}});
  assert.equal(response.status,403);
});
test('all customer vision endpoints check entitlement before contacting fal',()=>{
  for(const file of ['listing-intelligence','mockups/print-area']){
    const source=readFileSync(new URL(`../app/api/${file}/route.ts`,import.meta.url),'utf8');
    assert.ok(source.indexOf('await customerLaunchBlock(user)')<source.indexOf('await fetch('));
    assert.match(source,/boundedVisionFetch as fetch/);
  }
});
