import test from 'node:test';
import assert from 'node:assert/strict';
import {packDraftMedia,unpackDraftMedia,mergeDraftChanges,saveDraftChanges} from '../app/draft-media-storage.ts';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
function bucket(){const objects=new Map();return {objects,async put(key,bytes,opts){objects.set(key,{bytes:bytes.slice(),customMetadata:opts.customMetadata});},async get(key){const obj=objects.get(key);return obj?{customMetadata:obj.customMetadata,arrayBuffer:async()=>obj.bytes.slice().buffer}:null;}}}
const large={id:'product-a',clientId:'design-a',shopId:123,title:'My title',printifyImages:Array.from({length:300},(_,i)=>`https://images.printify.com/mockup/product-a/variant-${i}/front.jpg?${'x'.repeat(120)}`),printifyImageDetails:[{src:'https://images.printify.com/front.jpg',variantIds:[1,2]}],colorPreviewImageDetails:[]};
test('large arrays round trip with exact order, indices and ownership fields',async()=>{
  const b=bucket(),packed=await packDraftMedia(large,'owner',b);
  assert.ok(JSON.stringify(packed).length<600);assert.equal(packed.id,large.id);assert.equal(packed.shopId,123);assert.equal(packed.printifyImages,undefined);
  assert.deepEqual(await unpackDraftMedia(JSON.stringify(packed),'owner',b),large);
  assert.ok([...b.objects.values()][0].bytes.length<JSON.stringify(large).length/5);
});
test('small and historical inline records do not need object storage',async()=>{
  const b={put(){throw Error('unexpected put')},get(){throw Error('unexpected get')}};
  const small={id:'p',clientId:'d',printifyImages:['one']};
  assert.deepEqual(await packDraftMedia(small,'owner',b),small);assert.deepEqual(await unpackDraftMedia(JSON.stringify(small),'owner',b),small);
});
test('pointers cannot cross owners/products or replace metadata fields',async()=>{
  const b=bucket(),packed=await packDraftMedia(large,'owner',b);
  await assert.rejects(unpackDraftMedia(packed,'other-owner',b),/ownership/);
  await assert.rejects(unpackDraftMedia({...packed,id:'other-product'},'owner',b),/ownership/);
  const obj=[...b.objects.values()][0];obj.customMetadata.owner='other';
  await assert.rejects(unpackDraftMedia(packed,'owner',b),/could not be loaded/);
});
test('missing or corrupted media never silently becomes an empty gallery',async()=>{
  const b=bucket(),packed=await packDraftMedia(large,'owner',b),key=packed._draftMedia.key;
  b.objects.get(key).bytes[0]=0;await assert.rejects(unpackDraftMedia(packed,'owner',b));
  b.objects.delete(key);await assert.rejects(unpackDraftMedia(packed,'owner',b),/could not be loaded/);
});
test('storage failure leaves the SQL record unchanged',async()=>{
  let writes=0;await assert.rejects(saveDraftChanges({before:large,after:{...large,title:'new'},owner:'owner',bucket:{get(){},put(){throw Error('storage down')}},read:async()=>JSON.stringify(large),compareAndSwap:async()=>{writes++;return true}}),/storage down/);assert.equal(writes,0);
});
test('concurrent title and artwork metadata edits retain both updates',()=>{
  const before={id:'p',clientId:'d',title:'old',artworkOverrides:{natural:{position:'front'}},costReview:{approved:false}};
  const current={...before,title:'new',artworkOverrides:{...before.artworkOverrides,black:{position:'front'}}};
  const after={...before,artworkOverrides:{},costReview:{approved:true}};
  assert.deepEqual(mergeDraftChanges(before,after,current),{...current,artworkOverrides:{black:{position:'front'}},costReview:{approved:true}});
});
test('compare-and-swap retries merge without dropping a concurrent title or gallery order',async()=>{
  const b=bucket(),before={id:'p',clientId:'d',title:'old',printifyImages:['a','b']};let row=JSON.stringify(before),calls=0;
  const saved=await saveDraftChanges({before,after:{...before,printifyImages:['b','a']},owner:'owner',bucket:b,read:async()=>row,compareAndSwap:async(previous,next)=>{if(!calls++){row=JSON.stringify({...before,title:'new'});return false;}assert.equal(previous,row);row=next;return true;}});
  assert.equal(calls,2);assert.deepEqual(saved,{...before,title:'new',printifyImages:['b','a']});
});
test('identity changes are refused before writing',async()=>{
  await assert.rejects(saveDraftChanges({before:large,after:{...large,clientId:'foreign'},owner:'owner',bucket:bucket(),read:async()=>'',compareAndSwap:async()=>true}),/identity/);
});
test('owned-product and design lookups use indexes rather than scanning accumulated drafts',()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE printify_draft_results(user_id TEXT,client_id TEXT,status TEXT,response_json TEXT)');
  db.exec(readFileSync(new URL('../drizzle/0020_draft_lookup_indexes.sql',import.meta.url),'utf8'));
  const product=db.prepare("EXPLAIN QUERY PLAN SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=?").all('owner','product');
  const design=db.prepare("EXPLAIN QUERY PLAN SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND client_id IN (?,?)").all('owner','a','b');
  assert.ok(product.some(row=>row.detail.includes('idx_printify_draft_owned_product')));assert.ok(design.some(row=>row.detail.includes('idx_printify_draft_user_client_status')));db.close();
});
test('all active full-media readers hydrate private storage, while creation has an inline fallback',()=>{
  for(const path of ['app/api/printify/drafts/route.ts','app/api/printify/drafts/update/route.ts','app/api/listing-photos/download/route.ts','app/api/batches/route.ts'])assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'),/await unpackDraftMedia/);
  const route=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');assert.match(route,/packDraftMedia\(draft,user.userId,runtimeEnv\(\).ARTWORK!\)\.catch\(\(\)=>draft\)/);
});
