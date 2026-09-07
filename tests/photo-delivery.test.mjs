import {pacingModule} from './etsy-pacing-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace("from '../../etsy/request-pacing'",`from '${pacingModule}'`);
const {deliveryStep}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(read('app/api/listing-photos/delivery/engine.ts'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
function fixture(){
 let images=[1,2,3].map(id=>({listing_image_id:id,rank:id})),saved=null,shop=7,state='active',writes=[],backup=[],counter=10;
 const io={read:async()=>({shopId:shop,state,images:structuredClone(images)}),backup:async value=>{backup=structuredClone(value)},save:async value=>{saved=structuredClone(value)},upload:async(photo,rank)=>{const id=++counter;writes.push(['upload',photo.key,rank]);images=[...images.filter(i=>i.rank!==rank),{listing_image_id:id,rank}];return id},remove:async id=>{writes.push(['delete',id]);images=images.filter(i=>i.listing_image_id!==id)}};
 return {io,get saved(){return saved},get images(){return images},get writes(){return writes},get backup(){return backup},set shop(v){shop=v},set state(v){state=v},set images(v){images=v}};
}
const photos=[{key:'custom',type:'image/png'},{key:'guide',type:'image/png'}];
test('photo delivery backs up originals, preserves chosen order, trims surplus only after upload receipts, and verifies final reads',async()=>{
 const f=fixture();let result;
 for(let i=0;i<10;i++){result=await deliveryStep(f.io,7,123,photos,f.saved);if(result.done)break}
 assert.equal(result.done,true);assert.deepEqual(f.backup.map(i=>i.listing_image_id),[1,2,3]);
 assert.deepEqual(f.writes,[['upload','custom',1],['upload','guide',2],['delete',3]]);
 assert.deepEqual(f.images.map(i=>[i.rank,i.listing_image_id]),[[1,11],[2,12]]);
 await deliveryStep(f.io,7,123,photos,f.saved);assert.equal(f.writes.length,3,'completed replay makes no write');
});
test('different shop and unpublished listing cannot receive photos',async()=>{
 for(const field of ['shop','state']){const f=fixture();f[field]=field==='shop'?8:'draft';await assert.rejects(deliveryStep(f.io,7,123,photos,null));assert.equal(f.writes.length,0);assert.equal(f.backup.length,0)}
});
test('a lost upload response cannot cause an automatic duplicate on restart',async()=>{
 const f=fixture();const upload=f.io.upload;f.io.upload=async(...args)=>{await upload(...args);throw Error('socket lost after acceptance')};
 await assert.rejects(deliveryStep(f.io,7,123,photos,null));assert.equal(f.saved.pending.rank,1);
 await assert.rejects(deliveryStep(f.io,7,123,photos,f.saved),/prevent duplicate/);assert.equal(f.writes.length,1);
});
test('external edits and a changed linked listing stop subsequent writes',async()=>{
 const f=fixture();await deliveryStep(f.io,7,123,photos,null);f.images=[...f.images,{rank:4,listing_image_id:999}];
 await assert.rejects(deliveryStep(f.io,7,123,photos,f.saved),/changed outside/);assert.equal(f.writes.length,1);
 await assert.rejects(deliveryStep(f.io,7,456,photos,f.saved),/different Etsy listing/);
});
test('backup failure never changes Etsy and zero or excessive photos are rejected',async()=>{
 const f=fixture();f.io.backup=async()=>{throw Error('storage failed')};await assert.rejects(deliveryStep(f.io,7,123,photos,null));assert.equal(f.writes.length,0);
 for(const count of [0,21])await assert.rejects(deliveryStep(f.io,7,123,Array(count).fill(photos[0]),null),/between 1 and 20/);
});
test('unconfirmed deletion cannot repeat or prematurely report completion',async()=>{
 const f=fixture();await deliveryStep(f.io,7,123,photos,null);await deliveryStep(f.io,7,123,photos,f.saved);
 const remove=f.io.remove;f.io.remove=async id=>{await remove(id);throw Error('connection lost')};
 await assert.rejects(deliveryStep(f.io,7,123,photos,f.saved));await assert.rejects(deliveryStep(f.io,7,123,photos,f.saved),/prevent duplicate/);
 assert.equal(f.writes.filter(w=>w[0]==='delete').length,1);
});
test('legacy photos remain separate; only explicit automatic draft jobs can transfer hidden products',()=>{
 const service=read('app/api/listing-photos/delivery/service.ts'),worker=read('worker/photo-delivery-workflow.ts'),route=read('app/api/listing-photos/delivery/route.ts');
 assert.doesNotMatch(service,/finishEtsyListing|createDraftListing|method:'PATCH'/);
 assert.match(service,/row\.draft_json&&row\.transfer_json&&published\.state==='unpublished'/);assert.match(service,/body:JSON\.stringify\(\{visible:false\}\)/);
 assert.match(service,/form\.set\('overwrite','true'\)/);assert.match(worker,/operation<240/);assert.match(service,/row\.expires_at/);
 assert.match(route,/status='waiting' AND state_json IS NULL/);assert.match(service,/if\(!claim\.meta\.changes\)return/);
 assert.match(route,/user_id=\? AND status='succeeded'/);assert.match(route,/previous delivery has an unconfirmed Etsy change/);
 assert.match(read('app/api/printify/drafts/publish/route.ts'),/GOLDIE_ETSY_PUBLISHING_ENABLED=false/);
});
