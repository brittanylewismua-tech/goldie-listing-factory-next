import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const source=read('app/api/listing-photos/delivery/progress.ts');
const {deliveryProgress}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));

test('Etsy progress advances only from durable transfer, metadata, photo, and verification milestones',()=>{
 const base={status:'waiting',transfer_json:JSON.stringify({phase:'ready'}),draft_json:JSON.stringify({properties:[{},{}]}),draft_state_json:null,state_json:null,candidate_listing_id:null,candidate_seen_at:null,photos_json:JSON.stringify([{},{}])};
 const points=[deliveryProgress(base).progress,deliveryProgress({...base,transfer_json:JSON.stringify({phase:'submitted'})}).progress,deliveryProgress({...base,transfer_json:JSON.stringify({phase:'accepted'}),candidate_listing_id:44,candidate_seen_at:1}).progress,deliveryProgress({...base,status:'delivering',candidate_listing_id:44,candidate_seen_at:1,draft_state_json:JSON.stringify({index:2})}).progress,deliveryProgress({...base,status:'delivering',candidate_listing_id:44,candidate_seen_at:1,draft_state_json:JSON.stringify({index:4,verified:true}),state_json:JSON.stringify({uploaded:[1]})}).progress,deliveryProgress({...base,status:'completed'}).progress];
 assert.deepEqual(points,[10,20,42,59,87,100]);
 assert.equal(deliveryProgress({...base,status:'completed'}).stage,'Verified on Etsy');
});

test('the Etsy transfer status lives in the right review rail and owns one visible progress surface',()=>{
 const app=read('app/listing-factory-app.tsx'),ui=read('app/photo-delivery-handoff.tsx'),css=read('app/interface-v2.css');
 const left=app.indexOf('<div className="factory-review-list">'),right=app.indexOf('<div className="factory-publish-box">'),handoff=app.indexOf('<PhotoDeliveryHandoff',right);
 assert.ok(left>=0&&right>left&&handoff>right);
 assert.match(ui,/role="progressbar"/);assert.match(ui,/aria-valuenow=\{progress\}/);assert.match(ui,/Saving your draft request/);assert.match(ui,/Every draft was checked on Etsy/);assert.match(ui,/done\?'Complete':elapsed/);assert.match(ui,/completed===targets.length\?'Open Etsy drafts'/);
 assert.doesNotMatch(ui,/WaitProgress|WaitCard/);assert.match(app,/etsyDraftTransferState!==\'complete\'/);
 assert.match(css,/\.factory-publish-box \.photo-delivery-handoff/);assert.match(css,/@keyframes etsy-transfer-spin/);
});
