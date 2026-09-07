import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createBatchSaveTransport} from '../app/batch-save-transport.ts';
import {RENAME_BATCH} from '../app/batch-display-name.ts';
const source=readFileSync(new URL('../app/api/batches/route.ts',import.meta.url),'utf8');
const sql=source.match(/const saved=await database\.prepare\("([^"]+)"\)/)[1];
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE listing_batches(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,step TEXT,setup_name TEXT,product_title TEXT,design_count INTEGER,state_json TEXT,parent_batch_id TEXT,updated_at TEXT)');
 db.exec(readFileSync(new URL('../drizzle/0027_batch_save_revision.sql',import.meta.url),'utf8'));
 const calls=[];
 const fetcher=async(input,init={})=>{
  const method=init.method||'GET';calls.push(method);
  if(method==='GET'){
   const id=new URL(input,'https://test').searchParams.get('id');
   const row=db.prepare('SELECT * FROM listing_batches WHERE id=?').get(id);
   return Response.json(row?{batch:{...row,state:JSON.parse(row.state_json)}}:{},{status:row?200:404});
  }
  const body=JSON.parse(init.body);
  if(method==='PATCH')return Response.json({saved:true,revisions:db.prepare(RENAME_BATCH).all(body.displayName,'owner',body.id)});
  const revision=Number(new Headers(init.headers).get('x-batch-revision')??-1);
  const rows=db.prepare(sql).all(body.id,'owner','draft','review','','',1,JSON.stringify(body.state),null,revision);
  return Response.json(rows.length?{id:body.id,saved:true,revision:rows[0].revision}:{code:'BATCH_SAVE_CONFLICT'},{status:rows.length?200:409});
 };
 return {db,fetcher,calls,read:()=>JSON.parse(db.prepare('SELECT state_json FROM listing_batches WHERE id=?').get('batch').state_json)};
}
const save=(client,price,id='batch')=>client('/api/batches',{method:'POST',body:JSON.stringify({id,state:{price,photos:['front','back']}})});
const open=client=>client('/api/batches?id=batch');
test('two independent browsers cannot overwrite a newer price or photo set; stale retries never reach server',async()=>{
 const f=fixture(),warnings=[];
 const a=createBatchSaveTransport(f.fetcher,()=>{}),b=createBatchSaveTransport(f.fetcher,m=>warnings.push(m));
 await save(a,20);await open(b);await save(a,21.99);
 assert.equal((await save(b,18)).status,409);assert.equal(f.read().price,21.99);assert.deepEqual(f.read().photos,['front','back']);
 const count=f.calls.length;await save(b,19);assert.equal(f.calls.length,count);assert.ok(warnings.length);f.db.close();
});
test('queued snapshots use the preceding committed revision, and return exact inserted revision',async()=>{
 const f=fixture(),client=createBatchSaveTransport(f.fetcher,()=>assert.fail('unexpected conflict'));
 const responses=await Promise.all([save(client,20),save(client,21),save(client,22)]);
 assert.deepEqual(await Promise.all(responses.map(r=>r.json().then(p=>p.revision))),[1,2,3]);assert.equal(f.read().price,22);f.db.close();
});
test('background reads cannot authorize stale local state to overwrite remote edits',async()=>{
 const f=fixture(),a=createBatchSaveTransport(f.fetcher,()=>{}),b=createBatchSaveTransport(f.fetcher,()=>{});
 await save(a,20);await open(b);await save(a,25);await open(b);
 assert.equal((await save(b,10)).status,409);assert.equal(f.read().price,25);f.db.close();
});
test('bundle-wide edits advance known revisions without losing prices; remote interference pauses stale client',async()=>{
 const f=fixture(),a=createBatchSaveTransport(f.fetcher,()=>{}),b=createBatchSaveTransport(f.fetcher,()=>{});
 await save(a,20);await open(b);
 const rename=c=>c('/api/batches',{method:'PATCH',body:JSON.stringify({id:'batch',displayName:'Summer'})});
 assert.equal((await rename(a)).status,200);assert.equal((await save(a,21)).status,200);
 assert.equal(f.read().batchDisplayName,'Summer');assert.equal((await rename(b)).status,409);
 assert.equal((await save(b,1)).status,409);assert.equal(f.read().price,21);f.db.close();
});
test('an interrupted write is bounded and stops queued writes without a blind retry',async()=>{
 let calls=0;
 const client=createBatchSaveTransport(async(_input,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))},()=>{},10);
 const keepAlive=setTimeout(()=>{},1000);
 try{const results=await Promise.all([save(client,20),save(client,21)]);assert.deepEqual(results.map(r=>r.status),[409,409]);assert.equal(calls,1)}finally{clearTimeout(keepAlive)}
});
test('different products remain independent while a bundle PATCH waits for prior saves',async()=>{
 let release;const held=new Promise(r=>release=r),events=[];
 const client=createBatchSaveTransport(async(_input,init)=>{const body=JSON.parse(init.body);events.push(body.id);if(body.id==='slow')await held;return Response.json(init.method==='PATCH'?{revisions:[]}:{id:body.id,revision:1})},()=>{});
 const slow=save(client,1,'slow');await save(client,2,'fast');assert.deepEqual(events,['slow','fast']);
 const patch=client('/api/batches',{method:'PATCH',body:JSON.stringify({id:'rename'})});await Promise.resolve();assert.deepEqual(events,['slow','fast']);release();await Promise.all([slow,patch]);assert.deepEqual(events,['slow','fast','rename']);
});
test('legacy clients without a revision cannot change an existing migrated snapshot',()=>{
 const f=fixture();f.db.prepare('INSERT INTO listing_batches(id,user_id,state_json) VALUES (?,?,?)').run('batch','owner','{"price":20}');
 const rows=f.db.prepare(sql).all('batch','owner','draft','review','','',1,'{"price":1}',null,-1);
 assert.equal(rows.length,0);assert.equal(f.read().price,20);f.db.close();
});

test('an interrupted batch read is bounded and does not poison later reads',async()=>{
 let calls=0;const keepAlive=setTimeout(()=>{},1000);
 const client=createBatchSaveTransport(async(_input,{signal})=>{if(++calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));return Response.json({batch:{id:'batch',revision:3}})},()=>assert.fail('read failures are not write conflicts'),10);
 try{await assert.rejects(open(client));assert.equal((await open(client)).status,200);assert.equal(calls,2)}finally{clearTimeout(keepAlive)}
});
