import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {checkoutRequestIdentity} from '../app/checkout-request-identity.ts';
import {PLANS, planAmount} from '../app/plan-limits.ts';
const original=new URLSearchParams({customer:'customer-private',mode:'subscription','line_items[0][price]':'price-one','subscription_data[trial_period_days]':'3'});
test('identical checkout retries have the same identifier and key',async()=>{
  const a=await checkoutRequestIdentity(original,'2026-09-06');const b=await checkoutRequestIdentity(original,'2026-09-06');assert.deepEqual(a,b);assert.match(a.integrationIdentifier,/^goldie_[a-z]{8}$/);assert.doesNotMatch(a.idempotencyKey,/customer-private/);
  const reordered=new URLSearchParams([...original.entries()].reverse());assert.deepEqual(await checkoutRequestIdentity(reordered,'2026-09-06'),a);
});
test('customer, price, trial and date changes cannot reuse an incompatible key',async()=>{
  const before=await checkoutRequestIdentity(original,'2026-09-06');for(const [key,value]of [['customer','another'],['line_items[0][price]','price-two'],['subscription_data[trial_period_days]','0']]){const params=new URLSearchParams(original);params.set(key,value);assert.notEqual((await checkoutRequestIdentity(params,'2026-09-06')).idempotencyKey,before.idempotencyKey);}
  assert.notEqual((await checkoutRequestIdentity(original,'2026-09-07')).idempotencyKey,before.idempotencyKey);
});
const src=readFileSync(new URL('../app/api/billing/checkout/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(overrides={}){
  const requests=[],seen=new Map(),env={NextResponse:{json:(body,options)=>({body,status:options?.status??200})},getChatGPTUser:async()=>({userId:'member-one'}),billingState:async()=>({active:false}),customerFor:async()=> 'customer-one',priceForPlan:()=> 'price-one',siteOrigin:()=> 'https://www.thegoldiesuite.com',trialAvailable:async()=>true,PLANS,planAmount,checkoutRequestIdentity,stripeRequest:async(path,input)=>{if(path.startsWith('prices/'))return {active:true,currency:'usd',unit_amount:1499,recurring:{interval:'month',interval_count:1}};const body=input.body.toString();if(seen.has(input.idempotencyKey))assert.equal(body,seen.get(input.idempotencyKey),'Stripe rejects different parameters with the same key');seen.set(input.idempotencyKey,body);requests.push(input);return {url:'https://checkout.stripe.com/example'};}};
  Object.assign(env,overrides);
  const out={};new Function('exports',...Object.keys(env),compiled)(out,...Object.values(env));return {post:out.POST,requests,seen};
}
test('actual checkout endpoint can be opened twice without the live idempotency conflict',async()=>{
  const h=route();for(let i=0;i<2;i++){const result=await h.post(new Request('https://www.thegoldiesuite.com/api/billing/checkout',{method:'POST',body:JSON.stringify({plan:'goldie'})}));assert.equal(result.status,200);assert.equal(result.body.url,'https://checkout.stripe.com/example');}
  assert.equal(h.requests.length,2);assert.equal(h.seen.size,1);assert.equal(h.requests[0].body.get('subscription_data[trial_period_days]'),'3');
});
const billing=readFileSync(new URL('../app/billing.ts',import.meta.url),'utf8');
const priceFunctions=billing.slice(billing.indexOf('export function priceForPlan'),billing.indexOf('export function siteOrigin')).replaceAll('export function','function');
const makePrices=new Function('billingRuntime',`${ts.transpileModule(priceFunctions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return {priceForPlan,planForPrice};`);
test('new Pro checkout does not reuse the old Scale label, while old subscribers keep Pro mapping',()=>{
  const prices=makePrices(()=>({STRIPE_SCALE_PRICE_ID:'legacy-scale-59',STRIPE_GOLDIE_PRICE_ID:'starter-29'}));
  assert.equal(prices.priceForPlan('pro'),null);assert.equal(prices.planForPrice('legacy-scale-59'),'pro');assert.equal(prices.priceForPlan('goldie'),null);assert.equal(prices.planForPrice('starter-29'),'goldie');
  assert.equal(makePrices(()=>({STRIPE_PRO_MONTHLY_PRICE_ID:'dedicated-pro'})).priceForPlan('pro'),'dedicated-pro');
});

test('checkout does not invent duplicate inline prices when a fixed price is missing',async()=>{
  const h=route({PLANS,priceForPlan:()=>null});const result=await h.post(new Request('https://www.thegoldiesuite.com/api/billing/checkout',{method:'POST',body:JSON.stringify({plan:'pro'})}));
  assert.equal(result.status,503);assert.equal(h.requests.length,0);
});
