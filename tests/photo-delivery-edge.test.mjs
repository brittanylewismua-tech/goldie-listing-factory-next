import {prerequisitesModule} from './delivery-prerequisites-module.mjs';
import {pacingModule} from './etsy-pacing-module.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace("from '../../etsy/request-pacing'",`from '${pacingModule}'`),url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
const timing=url(read('app/api/listing-photos/delivery/timing.ts'));
const transferEngine=url(read('app/api/listing-photos/delivery/transfer-engine.ts'));
const engine=url(read('app/api/listing-photos/delivery/engine.ts'));
const draftEngine=url(read('app/api/listing-photos/delivery/draft-engine.ts'));
const draftService=url(read('app/api/listing-photos/delivery/draft-service.ts').replace("from './prerequisites'",`from '${prerequisitesModule}'`).replace("from './draft-engine'",`from '${draftEngine}'`));
globalThis.__photoEdge={};
const source=read('app/api/listing-photos/delivery/service.ts').replace("from './backup'",`from '${url(read('app/api/listing-photos/delivery/backup.ts'))}'`).replace("from './timing'",`from '${timing}'`).replace("from './transfer-engine'",`from '${transferEngine}'`).replace(/import \{verifyShopPairing\}[^;]+;/,'const verifyShopPairing=()=>{};').replace(/import \{etsyFetch\}[^;]+;/,'const etsyFetch=()=>{};').replace(/import \{env\}[^;]+;/,'const env=globalThis.__photoEdge;').replace(/import \{etsyConnection[^;]+;/,'const etsyConnection=()=>{},etsyApiCredential=()=>{},etsyBudget=()=>{},recordEtsyCall=()=>{};').replace(/import \{decryptPrintifyToken\}[^;]+;/,'const decryptPrintifyToken=()=>{};').replace(/import \{readPrintifyPublishState\}[^;]+;/,'const readPrintifyPublishState=()=>{};').replace("from './engine'",`from '${engine}'`).replace("from './draft-engine'",`from '${draftEngine}'`).replace("from './draft-service'",`from '${draftService}'`);
const {readSourceImage,limitedImage,prepareEtsyImage,deliveryMessage,printifyWaitMessage}=await import(url(source));
test('edge fetch uses manual redirect handling and never follows an untrusted destination',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async(input,init)=>{assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.example/x'}})};await assert.rejects(readSourceImage('https://images.printify.com/mockup/test.jpg'),/could not be read/)}finally{globalThis.fetch=original}
});
test('photo source host is checked before making any request',async()=>{const original=globalThis.fetch;let called=false;try{globalThis.fetch=async()=>{called=true;throw Error('unexpected')};await assert.rejects(readSourceImage('https://images.printify.com.evil.example/photo.jpg'),/could not be verified/);assert.equal(called,false)}finally{globalThis.fetch=original}});
test('unsupported content and oversized streams fail before an Etsy write',async()=>{
 await assert.rejects(limitedImage(new Response('html',{headers:{'content-type':'text/html'}})),/unsupported/);
 await assert.rejects(limitedImage(new Response(new Uint8Array(20*1024*1024+1),{headers:{'content-type':'image/png'}})),/20 MB/);
});
test('JPG is preserved; PNG and WebP are flattened onto white in a supported Etsy format',async()=>{
 const calls=[];globalThis.__photoEdge.IMAGES={input(stream){assert.ok(stream);return {async output(options){calls.push(options);return {response:()=>new Response(new Uint8Array([1,2]),{headers:{'content-type':'image/jpeg'}})}}}}};
 const jpg={bytes:new Uint8Array([3]),type:'image/jpeg'};assert.equal(await prepareEtsyImage(jpg),jpg);
 for(const type of ['image/png','image/webp'])assert.equal((await prepareEtsyImage({bytes:new Uint8Array([4]),type})).type,'image/jpeg');
 assert.deepEqual(calls,[{format:'image/jpeg',background:'#ffffff',quality:95},{format:'image/jpeg',background:'#ffffff',quality:95}]);
});

test('runtime details are not exposed as customer recovery instructions',()=>{assert.match(deliveryMessage('Invalid redirect value, must be one of'),/original photos are saved/);assert.equal(deliveryMessage('Choose between 1 and 20 photos.'),'Choose between 1 and 20 photos.')});

test('normal automatic draft processing is a progress state, while genuine connection uncertainty stays visible',()=>{assert.equal(printifyWaitMessage(true,true,'Printify is still publishing.'),null);assert.match(printifyWaitMessage(true,false,'Printify could not respond.'),/could not respond/);assert.match(printifyWaitMessage(false,true,'Printify is still publishing.'),/Automatic checking will retry/)});
