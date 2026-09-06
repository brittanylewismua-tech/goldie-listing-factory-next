import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps){const src=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const out={};new Function('exports',...Object.keys(deps),code)(out,...Object.values(deps));return out;}
const secret='local-test-secret';
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');let failOnce=false;
  const db={prepare(sql){let args=[];return {sql,bind(...values){args=values;return this;},async run(){if(failOnce&&sql.startsWith('INSERT INTO account_plans')){failOnce=false;throw Error('injected storage failure');}return {meta:sqlite.prepare(sql).run(...args)};},async first(){return sqlite.prepare(sql).get(...args)||null;}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const billing=load('../app/billing.ts',{env:{DB:db,STRIPE_WEBHOOK_SECRET:secret}});await billing.ensureBillingTables();
  const {POST}=load('../app/api/billing/webhook/route.ts',{...billing,NextResponse:{json:(body,options)=>({body,status:options?.status??200})},scheduleTrialReminder:async()=>null,cancelTrialReminder:async()=>{}});
  return {sqlite,post:POST,failNextPlanWrite:()=>failOnce=true,billing};
}
async function request(event){const payload=JSON.stringify(event),t=String(Math.floor(Date.now()/1000));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${payload}`)))].map(v=>v.toString(16).padStart(2,'0')).join('');return new Request('https://goldie.test/api/billing/webhook',{method:'POST',body:payload,headers:{'stripe-signature':`t=${t},v1=${sig}`}});}
const subscription={id:'evt-subscription',type:'customer.subscription.created',data:{object:{id:'sub-local',customer:'cus-local',status:'trialing',metadata:{user_id:'local-user',plan_key:'pro'}}}};
const checkout={id:'evt-checkout',type:'checkout.session.completed',data:{object:{id:'cs-local',customer:'cus-local',subscription:'sub-local',client_reference_id:'local-user',metadata:{plan_key:'pro'}}}};
test('temporary storage failure does not acknowledge an unapplied subscription event',async()=>{
  const h=await fixture();try{h.failNextPlanWrite();await assert.rejects(h.post(await request(subscription)),/injected storage failure/);assert.equal(h.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) n FROM billing_subscriptions').get().n,0);assert.equal((await h.post(await request(subscription))).status,200);assert.equal((await h.billing.billingState({userId:'local-user'})).active,true);}finally{h.sqlite.close();}
});
test('checkout notification arriving after trial activation cannot replace trial allowance',async()=>{
  const h=await fixture();try{await h.post(await request(subscription));await h.post(await request(checkout));assert.equal(h.sqlite.prepare('SELECT plan_key FROM account_plans').get().plan_key,'trial');assert.equal((await h.billing.billingState({userId:'local-user'})).subscription.planKey,'pro');}finally{h.sqlite.close();}
});
test('successful duplicate delivery is acknowledged without applying the event again',async()=>{
  const h=await fixture();try{await h.post(await request(subscription));h.failNextPlanWrite();const duplicate=await h.post(await request(subscription));assert.equal(duplicate.body.duplicate,true);assert.equal(h.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,1);}finally{h.sqlite.close();}
});
test('unsigned requests cannot grant access or record events',async()=>{
  const h=await fixture();try{const result=await h.post(new Request('https://goldie.test/api/billing/webhook',{method:'POST',body:JSON.stringify(subscription)}));assert.equal(result.status,400);assert.equal(h.sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,0);}finally{h.sqlite.close();}
});
test('checkout before subscription waits for verified activation, then grants the trial',async()=>{
  const h=await fixture();try{await h.post(await request(checkout));assert.equal((await h.billing.billingState({userId:'local-user'})).active,false);await h.post(await request(subscription));assert.equal((await h.billing.billingState({userId:'local-user'})).active,true);assert.equal(h.sqlite.prepare('SELECT plan_key FROM account_plans').get().plan_key,'trial');}finally{h.sqlite.close();}
});
test('active subscription grants its plan and cancellation removes access',async()=>{
  const h=await fixture();try{const active=structuredClone(subscription);active.id='evt-active';active.data.object.status='active';await h.post(await request(active));assert.equal((await h.billing.billingState({userId:'local-user'})).active,true);assert.equal(h.sqlite.prepare('SELECT plan_key FROM account_plans').get().plan_key,'pro');const canceled=structuredClone(active);canceled.id='evt-canceled';canceled.type='customer.subscription.deleted';canceled.data.object.status='canceled';await h.post(await request(canceled));assert.equal((await h.billing.billingState({userId:'local-user'})).active,false);}finally{h.sqlite.close();}
});
