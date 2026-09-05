import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {encryptPrintifyToken} from '../app/api/printify/token-crypto.ts';
import {draftCreationKey} from '../app/api/printify/draft-identity.ts';
// Resolve the application's TS aliases without rewriting or weakening the
// production engine under test. Each node:test file has its own process.
registerHooks({resolve(specifier,context,next){
  let url;if(specifier.startsWith('@/'))url=new URL('../'+specifier.slice(2),import.meta.url);
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))url=new URL(specifier,context.parentURL);
  if(url&&!/\.[a-z]+$/i.test(url.pathname)&&existsSync(new URL(url.href+'.ts')))return next(url.href+'.ts',context);
  return next(specifier,context);
}});
const {executeDraftJob}=await import('../app/api/printify/drafts/execute-job.ts');

function adapter(sqlite){return {prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){return sqlite.prepare(sql).run(...args)}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE printify_draft_results(request_key TEXT PRIMARY KEY,user_id TEXT,batch_id TEXT,client_id TEXT,status TEXT,response_json TEXT,updated_at TEXT);CREATE TABLE printify_connections(user_id TEXT,encrypted_token TEXT);CREATE TABLE printify_batch_sessions(id TEXT,user_id TEXT,expires_at INTEGER)');
  const secret='01'.repeat(32);sqlite.prepare('INSERT INTO printify_connections VALUES (?,?)').run('owner',await encryptPrintifyToken('fake-provider-token',secret));
  sqlite.exec("INSERT INTO printify_batch_sessions VALUES ('session','owner',0)");
  const objects=new Map(),bucket={async put(key,value,options){objects.set(key,{bytes:new Uint8Array(value),...options})},async get(key){const v=objects.get(key);return v?{arrayBuffer:async()=>v.bytes.buffer,body:new Blob([v.bytes]).stream(),customMetadata:v.customMetadata}:null}};
  objects.set('artwork',{bytes:new Uint8Array([1,2]),customMetadata:{owner:'owner',expires:String(Date.now()+86400000)}});
  const template={id:'template',blueprint_id:2,print_provider_id:3,shippingTemplateId:'7',variants:[{id:10,price:2000,cost:900,is_enabled:true}],print_areas:[{variant_ids:[10],placeholders:[{position:'front',images:[{id:'old',x:.41,y:.37,scale:.63,angle:0}]}]}]};
  const input={userId:'owner',requestUrl:'https://example.test/api/printify/drafts',session:{shop_id:1,product_id:'template',template_json:JSON.stringify(template)},body:{batchId:'session',clientId:'design',fileName:'design.png',stagedId:'artwork',selectedVariantIds:[10]}};
  const key=await draftCreationKey('owner',1,'template','design'),checkpoint={version:1,inputKey:'unused',workflowId:'workflow',phase:'queued'};
  sqlite.prepare('INSERT INTO printify_draft_results VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(key,'owner','session','design','running',JSON.stringify(checkpoint));
  return {sqlite,objects,bucket,input,key,checkpoint,bindings:{DB:adapter(sqlite),ARTWORK:bucket,PRINTIFY_TOKEN_KEY:secret}};
}
for(const mode of ['response-lost','checkpoint-write-lost','normal'])test(`real draft engine recovers ${mode} without another product and preserves placement`,async()=>{
  const f=await fixture(),previous=globalThis.fetch;let posts=0,uploads=0,product=null,failWrite=mode==='checkpoint-write-lost';
  const put=f.bucket.put.bind(f.bucket);f.bucket.put=async(key,value,options)=>{if(key.endsWith('/product.json')&&failWrite){failWrite=false;throw Error('object storage response lost')}return put(key,value,options)};
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('/uploads/images.json')){uploads++;return Response.json({id:'fresh-artwork',preview_url:'https://example.test/art.png'});}
    if(init?.method==='POST'){posts++;const body=JSON.parse(init.body);product={...body,id:'created-product',shop_id:1,images:[{src:'https://example.test/front.jpg',variant_ids:[10],position:'front',is_default:true}]};if(mode==='response-lost')throw Error('network lost after commit');return Response.json(product);}
    assert.ok(String(url).includes('/products.json?'));return Response.json({data:product?[product]:[],last_page:1});
  };
  try{
    if(mode!=='normal'){
      await assert.rejects(executeDraftJob(f.input,f.key,f.checkpoint,f.bindings));
      const row=f.sqlite.prepare('SELECT status,response_json FROM printify_draft_results').get();
      assert.equal(JSON.parse(row.response_json).phase,'creating');assert.equal(posts,1);
      await executeDraftJob(f.input,f.key,JSON.parse(row.response_json),f.bindings);
    }else await executeDraftJob(f.input,f.key,f.checkpoint,f.bindings);
    const result=f.sqlite.prepare('SELECT status,response_json FROM printify_draft_results').get(),draft=JSON.parse(result.response_json);
    assert.equal(result.status,'succeeded');assert.equal(draft.id,'created-product');assert.equal(posts,1);assert.equal(uploads,1);
    assert.equal(product.print_areas[0].placeholders[0].images[0].x,.41);assert.equal(product.print_areas[0].placeholders[0].images[0].y,.37);assert.equal(product.print_areas[0].placeholders[0].images[0].scale,.63);
    assert.equal(draft.sourceTemplateId,'template');assert.equal(draft.clientId,'design');assert.equal(draft.costReview.approved,false);
  }finally{globalThis.fetch=previous;f.sqlite.close();}
});
