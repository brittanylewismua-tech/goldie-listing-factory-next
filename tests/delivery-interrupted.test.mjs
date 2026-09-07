import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const source=readFileSync('app/api/listing-photos/delivery/interrupted.ts','utf8');
const {markDeliveryInterrupted}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
function fixture(status='delivering'){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE photo_deliveries(id TEXT,user_id TEXT,status TEXT,error TEXT,updated_at INTEGER,state_json TEXT,transfer_json TEXT,draft_state_json TEXT)');
 sql.prepare('INSERT INTO photo_deliveries VALUES(?,?,?,?,?,?,?,?)').run('job','owner',status,null,1,'{"pending":{"rank":2},"uploaded":[10]}','{"phase":"accepted"}','{"pending":"property:1"}');
 const db={prepare:query=>({bind:(...args)=>({run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})})})};return {sql,db};
}
test('exhausted workflow becomes recoverable and visible to support without losing any receipts',async()=>{const {sql,db}=fixture(),events=[];try{const before=sql.prepare('SELECT * FROM photo_deliveries').get();assert.equal(await markDeliveryInterrupted(db,'job','owner',async e=>events.push(e)),true);const row=sql.prepare('SELECT * FROM photo_deliveries').get();assert.equal(row.status,'needs_attention');for(const key of ['state_json','transfer_json','draft_state_json'])assert.equal(row[key],before[key]);assert.match(row.error,/Verify last change/);assert.equal(events[0].context.deliveryId,'job');assert.equal(events[0].userId,'owner');assert.equal(await markDeliveryInterrupted(db,'job','owner',async e=>events.push(e)),false);assert.equal(events.length,1)}finally{sql.close()}});
test('interruption cannot overwrite completed/canceled work or another seller’s job',async()=>{for(const status of ['completed','canceled','needs_attention','delivering']){const {sql,db}=fixture(status);try{assert.equal(await markDeliveryInterrupted(db,'job',status==='delivering'?'different-owner':'owner',async()=>assert.fail('unexpected report')),false);assert.equal(sql.prepare('SELECT status FROM photo_deliveries').get().status,status)}finally{sql.close()}}});
test('workflow catches exhausted steps and records failure in a separately retried step',async()=>{
 let marks=0,ticks=0;const shim=`export class WorkflowEntrypoint{}; export const runDeliveryTick=()=>{globalThis.__tick();return {done:true,progress:true}};export const deliveryStatus=()=>{};export const deliveryEnv=()=>({DB:{}});export const logError=()=>{};export const markDeliveryInterrupted=()=>globalThis.__mark();`;
 const url='data:text/javascript;base64,'+Buffer.from(shim).toString('base64');let worker=readFileSync('worker/photo-delivery-workflow.ts','utf8');worker=worker.replace(/from '[^']+'/g,`from '${url}'`);const {PhotoDeliveryWorkflow}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(worker,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
 globalThis.__tick=()=>ticks++;globalThis.__mark=()=>marks++;try{const calls=[];await new PhotoDeliveryWorkflow().run({payload:{id:'job',owner:'owner'}},{do:async(name,options,callback)=>{calls.push(name);if(name.startsWith('photos-'))throw Error('provider retries exhausted');return callback()},sleep:async()=>assert.fail('failed job must not sleep')});assert.deepEqual(calls,['photos-0','record-interrupted-delivery']);assert.equal(marks,1);assert.equal(ticks,0);marks=0;await new PhotoDeliveryWorkflow().run({payload:{id:'job',owner:'owner'}},{do:async(name,options,callback)=>callback(),sleep:async()=>assert.fail('completed job must not sleep')});assert.equal(ticks,1);assert.equal(marks,0)}finally{delete globalThis.__tick;delete globalThis.__mark}
});

test('Etsy connection refresh and API calls cannot wait forever',()=>{const s=readFileSync('app/api/etsy/client.ts','utf8');assert.match(s,/refresh_token:refreshToken\}\),signal:AbortSignal.timeout\(20000\)/);assert.match(s,/signal:init\?\.signal\?\?AbortSignal.timeout\(30000\)/)});
