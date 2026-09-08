import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('D1236: the owner dashboard describes the retired queue without a false heartbeat alarm',()=>{
  const page=read('app/operations/page.tsx');
  assert.match(page,/Etsy draft transfer history/);
  assert.match(page,/old scheduled publisher is intentionally off/);
  assert.match(page,/Current Etsy Drafts transfers run through each batch’s final step/);
  assert.doesNotMatch(page,/Worker heartbeat needs attention|Publishing worker is healthy|OperationsControl/);
});

test('D1236: retired queue actions point to the current draft workflow',()=>{
  const route=read('app/api/operations/route.ts');
  assert.match(route,/legacy Etsy publishing queue is retired/);
  assert.match(route,/Save to Etsy Drafts in the batch’s final step/);
  assert.doesNotMatch(route,/drainGlobalPublishQueue|UPDATE etsy_queue_state|UPDATE etsy_publish_items/);
});

test('D1236: owner diagnostics never call the product Goldie',()=>{
  const admin=read('app/mastermind-admin/admin-control.tsx');
  assert.match(admin,/Needs owner/);
  assert.doesNotMatch(admin,/Needs Goldie/);
});
