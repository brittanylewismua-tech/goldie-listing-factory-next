import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PLANS,planAmount,planFor,monthKey,nextReset} from '../app/plan-limits.ts';
import {checkoutRequestIdentity} from '../app/checkout-request-identity.ts';
const require=createRequire(import.meta.url);
function load(path,deps={}){
  const src=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const out={};new Function('exports','require',...Object.keys(deps),code)(out,require,...Object.values(deps));return out;
}
const runtime={STRIPE_STARTER_MONTHLY_PRICE_ID:'starter-month',STRIPE_STARTER_YEARLY_PRICE_ID:'starter-year',STRIPE_PRO_MONTHLY_PRICE_ID:'pro-month',STRIPE_PRO_YEARLY_PRICE_ID:'pro-year',STRIPE_SCALE_MONTHLY_PRICE_ID:'scale-month',STRIPE_SCALE_YEARLY_PRICE_ID:'scale-year',STRIPE_GOLDIE_PRICE_ID:'legacy-29',STRIPE_SCALE_PRICE_ID:'legacy-59'};
const billing=load('../app/billing.ts',{env:runtime});
function checkout(plan,interval,override={}){
  const sessions=[];let customers=0;
  const deps={...billing,PLANS,planAmount,checkoutRequestIdentity,NextResponse:{json:(body,options)=>({body,status:options?.status??200})},getChatGPTUser:async()=>({userId:'test-user'}),billingState:async()=>({active:false}),customerFor:async()=>{customers++;return 'test-customer';},siteOrigin:()=> 'https://thegoldiesuite.com',trialAvailable:async()=>true,stripeRequest:async(path,input)=>{
    if(path.startsWith('prices/'))return {active:true,currency:'usd',unit_amount:planAmount(plan,interval),recurring:{interval,interval_count:1}};
    assert.equal(path,'checkout/sessions');sessions.push(input);return {url:'https://checkout.stripe.com/test'};
  },...override};
  const post=load('../app/api/billing/checkout/route.ts',deps).POST;
  return {run:(body={plan,interval})=>post(new Request('https://thegoldiesuite.com/api/billing/checkout',{method:'POST',body:JSON.stringify(body)})),sessions,customers:()=>customers};
}
for(const [plan,monthly,annual,allowance] of [['goldie',1499,14900,100],['pro',2499,24900,250],['scale',3999,39900,500]]){
  test(`${plan} has exact monthly/yearly cents and one monthly allowance`,()=>{
    assert.equal(planAmount(plan,'month'),monthly);assert.equal(planAmount(plan,'year'),annual);assert.equal(planFor(`${plan}_2026_09`).drafts,allowance);
  });
  for(const interval of ['month','year'])test(`${plan} ${interval} checkout uses the fixed matching Stripe price`,async()=>{
    const h=checkout(plan,interval);assert.equal((await h.run()).status,200);
    const p=h.sessions[0].body;assert.equal(p.get('line_items[0][price]'),billing.priceForPlan(plan,interval));
    assert.equal(p.get('subscription_data[metadata][plan_key]'),plan);assert.equal(p.get('subscription_data[metadata][billing_interval]'),interval);
    assert.equal(p.get('subscription_data[metadata][pricing_version]'),'2026-09');assert.equal(p.get('subscription_data[trial_period_days]'),'3');
    assert.match(p.get('cancel_url'),new RegExp(`interval=${interval}`));assert.match(p.get('success_url'),new RegExp(`interval=${interval}`));
    assert.ok(![...p.keys()].some(key=>key.includes('price_data')));
  });
}
test('missing and mismatched fixed prices cannot open checkout or create a customer',async()=>{
  for(const overrides of [{priceForPlan:()=>null},{stripeRequest:async()=>({active:true,currency:'usd',unit_amount:2900,recurring:{interval:'month',interval_count:1}})}]){
    const h=checkout('goldie','month',overrides);assert.equal((await h.run()).status,503);assert.equal(h.sessions.length,0);assert.equal(h.customers(),0);
  }
});
test('invalid plans and intervals are rejected; annual is part of checkout identity',async()=>{
  for(const body of [{plan:'toString'},{plan:'__proto__'},{plan:'goldie',interval:'week'}])assert.equal((await checkout('goldie','month').run(body)).status,400);
  const m=checkout('goldie','month'),y=checkout('goldie','year');await m.run();await y.run();assert.notEqual(m.sessions[0].idempotencyKey,y.sessions[0].idempotencyKey);
});
test('active subscribers cannot accidentally create a second subscription',async()=>{
  const h=checkout('pro','year',{billingState:async()=>({active:true})});assert.equal((await h.run()).status,409);assert.equal(h.customers(),0);assert.equal(h.sessions.length,0);
});
test('legacy subscribers keep their price mapping and allowance',()=>{
  assert.equal(billing.planForPrice('legacy-29'),'goldie');assert.equal(billing.planForPrice('legacy-59'),'pro');
  assert.equal(planFor('pro').drafts,300);assert.equal(planFor('scale').drafts,750);assert.equal(planFor('goldie').price,29);
  assert.equal(billing.isCurrentPrice('legacy-29'),false);assert.equal(billing.isCurrentPrice('pro-year'),true);
});
test('annual entitlement uses monthly buckets with no rollover',()=>{
  const date=new Date('2026-09-30T23:59:59Z');assert.equal(monthKey(date),'2026-09');assert.equal(nextReset(date),'2026-10-01T00:00:00.000Z');
  const usage=readFileSync(new URL('../app/api/usage/route.ts',import.meta.url),'utf8');assert.match(usage,/const month = monthKey\(\)/);assert.match(usage,/substr\(COALESCE\(created_at,updated_at\),1,7\)=\?/);
});
test('trial reminder uses actual annual or legacy price and the correct period',()=>{
  const {trialReminderHtml}=load('../app/trial-reminder.ts',{planAmount,billingRuntime:()=>({})});
  const annual=trialReminderHtml({plan:'pro',chargeAt:1800000000,interval:'year',amount:24900});assert.match(annual,/\$249\.00/);assert.match(annual,/first year/);assert.doesNotMatch(annual,/first month/);
  const legacy=trialReminderHtml({plan:'goldie',chargeAt:1800000000,amount:2900});assert.match(legacy,/\$29\.00/);
});
const Signup=load('../app/signup/signup-client.tsx',{useEffect:React.useEffect,useRef:React.useRef,useState:React.useState,PLANS,GoldieWordmark:()=>React.createElement('span',null,'Goldie')}).default;
test('homepage renders clear navigation, existing copy, and correct monthly prices',()=>{
  const html=renderToStaticMarkup(React.createElement(Signup,{signedIn:false}));
  for(const text of ['Pricing','Login','Start for free','never seen before','automated listing assistant','14.99','24.99','39.99','Best for most shops','Card required'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/MOST POPULAR|What counts as a listing creation/);assert.equal((html.match(/<article /g)||[]).length,3);
});
test('yearly display uses full billed prices and preserves interval through sign-in',()=>{
  const html=renderToStaticMarkup(React.createElement(Signup,{signedIn:false,initialInterval:'year'}));
  for(const price of [149,249,399])assert.ok(html.includes(`${price} billed yearly`));
  for(const plan of ['goldie','pro','scale'])assert.ok(html.includes(encodeURIComponent(`/signup?offer=${plan}&interval=year`)));
  assert.ok(html.includes(encodeURIComponent('/signup?offer=trial&interval=month')));
});
test('workflow entry points do not import the new marketing homepage as the editor',()=>{
  for(const file of ['../app/listing-factory/client-factory.tsx','../app/mastermind/page.tsx','../app/design-lab/page.tsx'])assert.match(readFileSync(new URL(file,import.meta.url),'utf8'),/from "@\/app\/listing-factory-app"/);
});
