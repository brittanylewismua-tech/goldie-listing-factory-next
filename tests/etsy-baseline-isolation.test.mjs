import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {etsyPreparationCoordinator} from '../app/etsy-preparation-coordinator.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};

test('interleaved products retain separate baselines after a late completion',async()=>{
  const coordinator=etsyPreparationCoordinator(),tee=deferred(),hoodie=deferred();
  const first=coordinator.baseline('batch-tee',()=>tee.promise);
  const second=coordinator.baseline('batch-hoodie',()=>hoodie.promise);
  hoodie.resolve({category:'Hoodies'});assert.equal((await second).category,'Hoodies');
  tee.resolve({category:'T-shirts'});await first;
  assert.equal((await coordinator.baseline('batch-hoodie',()=>assert.fail('already established'))).category,'Hoodies');
});
test('simultaneous first designs establish exactly one shared product baseline',async()=>{
  const coordinator=etsyPreparationCoordinator(),gate=deferred();let calls=0;
  const first=coordinator.baseline('tee',()=>{calls++;return gate.promise});
  const second=coordinator.baseline('tee',()=>{calls++;return Promise.resolve({category:'Wrong'})});
  assert.equal(first,second);gate.resolve({category:'T-shirts'});
  assert.equal((await second).category,'T-shirts');assert.equal(calls,1);
});
test('rapid title edits and manual retry share one paid preparation until it settles',async()=>{
  const coordinator=etsyPreparationCoordinator(),gate=deferred();let calls=0;
  const run=()=>coordinator.run('batch-tee','draft-1',()=>{calls++;return gate.promise});
  const first=run();assert.equal(first,run());assert.equal(first,run());assert.equal(coordinator.pending('batch-tee'),true);
  gate.resolve('ready');assert.equal(await first,'ready');assert.equal(calls,1);assert.equal(coordinator.pending('batch-tee'),false);
});
test('same design IDs in different products run independently and one finishing does not clear the other',async()=>{
  const coordinator=etsyPreparationCoordinator(),tee=deferred(),hoodie=deferred();
  const first=coordinator.run('tee','art',()=>tee.promise),second=coordinator.run('hoodie','art',()=>hoodie.promise);
  tee.resolve('tee');await first;assert.equal(coordinator.pending('hoodie'),true);
  hoodie.resolve('hoodie');assert.equal(await second,'hoodie');assert.equal(coordinator.pending('hoodie'),false);
});
test('failed request and failed baseline release locks for a real retry',async()=>{
  const coordinator=etsyPreparationCoordinator();
  await assert.rejects(coordinator.run('tee','art',async()=>{throw Error('network')}));
  assert.equal(await coordinator.run('tee','art',async()=>'retried'),'retried');
  await assert.rejects(coordinator.baseline('tee',async()=>{throw Error('options')}));
  assert.equal(await coordinator.baseline('tee',async()=>'retried'),'retried');
});
test('production keys preparation by product batch and writes no stale title from the AI response',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/preparationScope=JSON.stringify\(\[batchIdRef.current,templateDetails\?\.id\]\)/);
  assert.match(source,/etsyPreparation.current.run\(scope,draftId/);
  assert.match(source,/etsyPreparation.current.baseline\(scope/);
  const prepare=source.slice(source.indexOf('  function prepareOne('),source.indexOf('  async function retryOneEtsyListing'));
  assert.match(prepare,/JSON.stringify\(\{productId:draftId,etsyDetails:details\}\)/);
  assert.match(prepare,/if\(isCurrent\(\)\)updateDesign/);
  assert.match(prepare,/current.etsy\|\|/);
});
