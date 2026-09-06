import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/launch-check/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(owner=true){let sent;const out={};const deps={NextResponse:{json:(body,o)=>({body,status:o?.status??200})},getChatGPTUser:async()=>({userId:'one',email:'owner@example.test'}),isOwner:()=>owner,scheduleTrialReminder:async input=>{sent=input;return 'test-id';},cancelTrialReminder:async()=>{},billingRuntime:()=>({DB:{prepare:()=>({bind:()=>({run:async()=>{}})})}}),inspectLaunchListing:async(owner,productId)=>({readOnly:true,owner,productId}),logError:async()=>{}};new Function('exports',...Object.keys(deps),code)(out,...Object.values(deps));return {get:out.GET,post:out.POST,sent:()=>sent};}
const req=(origin='https://www.thegoldiesuite.com')=>new Request('https://www.thegoldiesuite.com/api/launch-check',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'send',email:'someone-else@example.test'})});
test('nonowner cannot trigger an email',async()=>{const h=fixture(false);assert.equal((await h.post(req())).status,403);assert.equal(h.sent(),undefined);});
test('cross-origin calls cannot trigger an email',async()=>{const h=fixture();assert.equal((await h.post(req('https://other.test'))).status,403);assert.equal(h.sent(),undefined);});
test('owner test is labelled and always addressed to the authenticated owner',async()=>{const h=fixture();assert.equal((await h.post(req())).status,200);assert.equal(h.sent().email,'owner@example.test');assert.equal(h.sent().test,true);});

test('listing diagnostics are owner-only and validate the product ID before reading',async()=>{
 const request=new Request('https://www.thegoldiesuite.com/api/launch-check?productId='+'a'.repeat(24));
 assert.equal((await fixture(false).get(request)).status,403);
 assert.equal((await fixture().get(new Request('https://www.thegoldiesuite.com/api/launch-check?productId=bad'))).status,400);
 const result=await fixture().get(request);assert.equal(result.status,200);assert.equal(result.body.readOnly,true);assert.equal(result.body.owner,'one');
});
