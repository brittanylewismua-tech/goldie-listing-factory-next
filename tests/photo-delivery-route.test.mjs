import {pacingModule} from './etsy-pacing-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace("from '../../etsy/request-pacing'",`from '${pacingModule}'`);
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
const draftEngine=url(read('app/api/listing-photos/delivery/draft-engine.ts'));
const packageUrl=url(read('app/listing-photo-package.ts'));
const db=new DatabaseSync(':memory:');db.exec(read('drizzle/0022_photo_deliveries.sql'));db.exec(read('drizzle/0023_etsy_draft_finishing.sql'));db.exec(read('drizzle/0024_automatic_etsy_drafts.sql'));
db.exec("CREATE TABLE printify_draft_results(user_id TEXT,status TEXT,response_json TEXT,request_key TEXT);CREATE TABLE printify_connections(user_id TEXT,encrypted_token TEXT);CREATE TABLE etsy_connections(user_id TEXT,is_active INTEGER,shop_id INTEGER);");
const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}}};
const stored=new Map();const bucket={async delete(key){stored.delete(key)},async list({prefix}){return {truncated:false,objects:[...stored].filter(([k])=>k.startsWith(prefix)).map(([key])=>({key,etag:key}))}},async get(key){const value=stored.get(key);return value?{size:value.length,httpMetadata:{contentType:'image/png'},async text(){return new TextDecoder().decode(value)},async arrayBuffer(){return new Uint8Array(value).buffer}}:null},async put(key,value){stored.set(key,typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value))}};
let creations=[],failStart=false;
const runtime={DB,ARTWORK:bucket,PHOTO_DELIVERY:{async create(input){creations.push(input);if(failStart)throw Error('start failed')}}};
globalThis.__photoRoute={runtime,user:{userId:'owner'}};
let source=read('app/api/listing-photos/delivery/route.ts')
 .replace("from './draft-engine'",`from '${draftEngine}'`)
 .replace("from './reuse-photos'",`from '${url(read('app/api/listing-photos/delivery/reuse-photos.ts'))}'`)
 .replace(/import \{etsyConnection,etsyFetch\}[^;]+;/,"const etsyConnection=async()=>({shopId:200,token:'test'}),etsyFetch=async()=>({shipping_profile_id:8});")
 .replace(/import \{NextResponse\}[^;]+;/,"const NextResponse={json:(value,init)=>Response.json(value,init)};")
 .replace(/import \{getChatGPTUser\}[^;]+;/,"const getChatGPTUser=async()=>globalThis.__photoRoute.user;")
 .replace(/import \{decryptPrintifyToken\}[^;]+;/,"const decryptPrintifyToken=async()=>'token';")
 .replace(/import \{prepareEtsySkus\}[^;]+;/,"const prepareEtsySkus=async()=>{};")
 .replace(/import \{unpackDraftMedia\}[^;]+;/,"const unpackDraftMedia=async value=>JSON.parse(value);")
 .replace(/from '@\/app\/listing-photo-package'/,`from '${packageUrl}'`)
 .replace(/import \{deliveryEnv[^;]+;/,`const deliveryEnv=()=>globalThis.__photoRoute.runtime;
 const readDelivery=(id,owner)=>deliveryEnv().DB.prepare('SELECT * FROM photo_deliveries WHERE id=? AND user_id=?').bind(id,owner).first();
 const deliveryStatus=(id,owner,status,error)=>deliveryEnv().DB.prepare('UPDATE photo_deliveries SET status=?,error=? WHERE id=? AND user_id=?').bind(status,error,id,owner).run();
 const deliveryMessage=value=>value;
 const prepareEtsyImage=async data=>data;
 const readSourceImage=async()=>({bytes:new Uint8Array([1,2,3]),type:'image/png'});`);
const api=await import(url(source));
const post=(productId='p1',indices=[0],mode)=>api.POST(new Request('https://goldie.test/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,printifyImageIndices:indices,mode,shippingProfileId:8})}));
function reset(){db.exec('DELETE FROM photo_deliveries;DELETE FROM printify_draft_results;DELETE FROM etsy_connections;DELETE FROM printify_connections;');stored.clear();creations=[];failStart=false;globalThis.__photoRoute.user={userId:'owner'};db.prepare('INSERT INTO printify_draft_results VALUES(?,?,?,?)').run('owner','succeeded',JSON.stringify({id:'p1',shopId:100,printifyImages:['https://images.printify.com/front.jpg','https://images.printify.com/back.jpg']}),'a'.repeat(64));db.exec("INSERT INTO etsy_connections VALUES('owner',1,200);INSERT INTO printify_connections VALUES('owner','encrypted')")}
test('route creates an immutable ordered snapshot and duplicate submissions reuse one job',async()=>{
 reset();stored.set('etsy-listing-images/owner/p1/upload/custom.png',new Uint8Array([9,9]));stored.set('etsy-listing-images/owner/p1/order.json',new TextEncoder().encode(JSON.stringify(['printify:0','stored:etsy-listing-images/owner/p1/upload/custom.png'])));
 const response=await post();assert.equal(response.status,200);const {delivery}=await response.json();assert.equal(delivery.photoCount,2);assert.equal(delivery.status,'waiting');
 const row=db.prepare('SELECT * FROM photo_deliveries').get(),photos=JSON.parse(row.photos_json);assert.deepEqual([...stored.get(photos[0].key)],[1,2,3]);assert.deepEqual([...stored.get(photos[1].key)],[9,9]);
 stored.delete('etsy-listing-images/owner/p1/upload/custom.png');assert.deepEqual([...stored.get(photos[1].key)],[9,9],'snapshot survives editor asset removal');
 // The changed editor set is refused while delivery is pending.
 assert.equal((await post()).status,409);stored.set('etsy-listing-images/owner/p1/upload/custom.png',new Uint8Array([9,9]));
 const duplicate=await (await post()).json();assert.equal(duplicate.delivery.id,delivery.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1);
});
test('ownership and invalid selected indices reject before job or asset writes',async()=>{
 reset();assert.equal((await post('someone-elses-product')).status,403);assert.equal((await post('p1',[99])).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,0);assert.equal(creations.length,0);
 globalThis.__photoRoute.user=null;assert.equal((await post()).status,401);
});
test('waiting cancellation is atomic and cannot cancel a delivery that started editing',async()=>{
 reset();const {delivery}=await (await post()).json();let request=new Request(`https://goldie.test/api/listing-photos/delivery?id=${delivery.id}`,{method:'DELETE'});
 db.prepare("UPDATE photo_deliveries SET status='delivering',state_json='{}' WHERE id=?").run(delivery.id);assert.equal((await api.DELETE(request)).status,409);
 db.prepare("UPDATE photo_deliveries SET status='waiting',state_json=NULL WHERE id=?").run(delivery.id);assert.equal((await api.DELETE(request)).status,200);assert.equal(db.prepare('SELECT status FROM photo_deliveries').get().status,'canceled');
});
test('uncertain writes cannot be bypassed by preparing a new delivery',async()=>{
 reset();await post();db.prepare("UPDATE photo_deliveries SET status='needs_attention',state_json=?").run(JSON.stringify({pending:{rank:1}}));assert.equal((await post()).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1);
});
test('failed workflow startup is reported honestly and preparation can be retried',async()=>{
 reset();failStart=true;assert.equal((await post()).status,409);assert.equal(db.prepare('SELECT status FROM photo_deliveries').get().status,'failed');failStart=false;assert.equal((await post()).status,200);
});
test('owner-scoped status cannot expose another sellers delivery',async()=>{
 reset();await post();globalThis.__photoRoute.user={userId:'other'};const response=await api.GET(new Request('https://goldie.test/api/listing-photos/delivery?productId=p1'));assert.deepEqual((await response.json()).deliveries,[]);
});

test('draft mode snapshots server-owned metadata, does not share legacy job identity, and includes metadata in duplicate protection',async()=>{
 reset();const original=JSON.parse(db.prepare('SELECT response_json FROM printify_draft_results').get().response_json);Object.assign(original,{title:'QA',description:'Saved description',tags:['books'],etsyShippingProfileId:8,etsyDetails:{taxonomyId:9,properties:[],personalization:{enabled:false,questions:[]}}});db.prepare('UPDATE printify_draft_results SET response_json=?').run(JSON.stringify(original));
 const response=await post('p1',[0],'draft');assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.delivery.mode,'draft');const row=db.prepare('SELECT * FROM photo_deliveries').get();assert.equal(JSON.parse(row.draft_json).description,'Saved description');assert.equal((await post('p1',[0],'draft')).status,200);
 original.description='Changed after preparation';db.prepare('UPDATE printify_draft_results SET response_json=?').run(JSON.stringify(original));assert.equal((await post('p1',[0],'draft')).status,409);assert.equal(JSON.parse(db.prepare('SELECT draft_json FROM photo_deliveries').get().draft_json).description,'Saved description');
});
test('missing saved metadata blocks draft mode before job or photo writes; legacy mode remains available',async()=>{reset();assert.equal((await post('p1',[0],'draft')).status,409);assert.equal(creations.length,0);assert.equal((await post()).status,200)});
test('explicit draft recheck reuses the saved job and cannot bypass an uncertain photo write',async()=>{reset();await post();const row=db.prepare('SELECT * FROM photo_deliveries').get();db.prepare("UPDATE photo_deliveries SET status='needs_attention',draft_json='{}',draft_state_json=? WHERE id=?").run(JSON.stringify({listingId:123,index:0,pending:{key:'basic'}}),row.id);const request=()=>new Request('https://goldie.test/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:'p1',printifyImageIndices:[0],mode:'draft',recheckId:row.id})});const response=await api.POST(request());assert.equal(response.status,200);assert.equal((await response.json()).delivery.id,row.id);assert.equal(creations.at(-1).params.id,row.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1);assert.equal((await api.POST(request())).status,409);db.prepare("UPDATE photo_deliveries SET status='needs_attention',state_json=? WHERE id=?").run(JSON.stringify({pending:{rank:1}}),row.id);assert.equal((await api.POST(request())).status,409)});

const savedDraft=()=>({id:'p1',shopId:100,printifyImages:['https://images.printify.com/front.jpg','https://images.printify.com/back.jpg'],title:'QA',description:'Saved description',tags:['books'],etsyDetails:{taxonomyId:9,properties:[],personalization:{enabled:false,questions:[]}}});
const saveDraft=draft=>db.prepare('UPDATE printify_draft_results SET response_json=?').run(JSON.stringify(draft));
const status=async(indices=[0],shipping=8)=>{const q=new URLSearchParams({productId:'p1','images.p1':JSON.stringify(indices),'shipping.p1':String(shipping)});return (await (await api.GET(new Request(`https://goldie.test/api/listing-photos/delivery?${q}`))).json()).deliveries[0]};
test('completed draft status compares saved metadata, shipping and photo selection without writes or new jobs',async()=>{
 reset();const draft=savedDraft();saveDraft(draft);const {delivery}=await (await post('p1',[0],'draft')).json();db.prepare("UPDATE photo_deliveries SET status='completed' WHERE id=?").run(delivery.id);
 assert.equal((await status()).choicesChanged,false);assert.equal((await status([1])).choicesChanged,true);assert.equal((await status([0],9)).choicesChanged,true);
 draft.etsyDetails.personalization={enabled:true,questions:[{id:'q',type:'text_input',question:'Name',instructions:'Exact name',required:true,maxCharacters:32,options:[],maxFiles:1}]};saveDraft(draft);assert.equal((await status()).choicesChanged,true);
 saveDraft(savedDraft());assert.equal((await status()).choicesChanged,false);const duplicate=await (await post('p1',[0],'draft')).json();assert.equal(duplicate.delivery.id,delivery.id);assert.equal(creations.length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1);
});
test('saved photo additions and order changes invalidate completion; missing selection fails closed',async()=>{
 reset();saveDraft(savedDraft());await post('p1',[0,1],'draft');db.exec("UPDATE photo_deliveries SET status='completed'");assert.equal((await status([0,1])).choicesChanged,false);
 stored.set('etsy-listing-images/owner/p1/order.json',new TextEncoder().encode(JSON.stringify(['printify:1','printify:0'])));assert.equal((await status([0,1])).choicesChanged,true);
 stored.delete('etsy-listing-images/owner/p1/order.json');assert.equal((await status([0,1])).choicesChanged,false);
 stored.set('etsy-listing-images/owner/p1/upload/custom.png',new Uint8Array([9]));assert.equal((await status([0,1])).choicesChanged,true);
 assert.equal((await status([99])).choicesChanged,true);const missing=await (await api.GET(new Request('https://goldie.test/api/listing-photos/delivery?productId=p1'))).json();assert.equal(missing.deliveries[0].choicesChanged,true);assert.equal(missing.deliveries[0].choiceCheckUnavailable,true);
});
test('in-flight draft status detects later edits while keeping frozen delivery unchanged',async()=>{
 reset();saveDraft(savedDraft());await post('p1',[0],'draft');const before=db.prepare('SELECT draft_json FROM photo_deliveries').get().draft_json;saveDraft({...savedDraft(),title:'Changed title'});const result=await status();assert.equal(result.status,'waiting');assert.equal(result.choicesChanged,true);assert.equal(db.prepare('SELECT draft_json FROM photo_deliveries').get().draft_json,before);
});
test('automatic creation is explicit, requires draft mode, and upgrades an existing waiting draft without duplicate jobs',async()=>{reset();saveDraft(savedDraft());await post('p1',[0],'draft');const request=mode=>new Request('https://goldie.test/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:'p1',printifyImageIndices:[0],shippingProfileId:8,mode,automaticDraft:true})});assert.equal((await api.POST(request())).status,400);assert.equal((await api.POST(request('draft'))).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1);assert.equal(JSON.parse(db.prepare('SELECT transfer_json FROM photo_deliveries').get().transfer_json).phase,'ready')});
test('unconfirmed creation cannot be bypassed with a changed package',async()=>{reset();saveDraft(savedDraft());await post('p1',[0],'draft');db.prepare("UPDATE photo_deliveries SET status='needs_attention',transfer_json=?").run(JSON.stringify({phase:'submitted',submittedAt:Date.now()}));saveDraft({...savedDraft(),title:'Changed'});assert.equal((await post('p1',[0],'draft')).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM photo_deliveries').get().n,1)});

test('route carries verified photo receipts into a metadata-only update but not a changed photo set',async()=>{
 reset();saveDraft(savedDraft());const first=await (await post('p1',[0],'draft')).json();
 const receipt={listingId:123,expected:[{rank:1,listing_image_id:44}],uploaded:[44],startedAt:1};
 db.prepare("UPDATE photo_deliveries SET status='completed',state_json=?,candidate_listing_id=123 WHERE id=?").run(JSON.stringify(receipt),first.delivery.id);
 saveDraft({...savedDraft(),title:'Metadata change'});const second=await (await post('p1',[0],'draft')).json();assert.notEqual(second.delivery.id,first.delivery.id);assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM photo_deliveries WHERE id=?').get(second.delivery.id).state_json),receipt);
 db.prepare("UPDATE photo_deliveries SET status='completed' WHERE id=?").run(second.delivery.id);
 saveDraft({...savedDraft(),title:'New photo'});stored.set('etsy-listing-images/owner/p1/upload/custom.png',new Uint8Array([9]));const third=await (await post('p1',[0],'draft')).json();assert.equal(db.prepare('SELECT state_json FROM photo_deliveries WHERE id=?').get(third.delivery.id).state_json,null);
});
