import test from 'node:test';
import assert from 'node:assert/strict';
import {latestWriteQueue} from '../app/latest-write-queue.ts';
test('rapid reorder writes are serialized and obsolete queued positions coalesce',async()=>{
  const queue=latestWriteQueue();const writes=[];let release;
  const first=queue(async()=>{writes.push('first');await new Promise(resolve=>release=resolve);return 1});
  await Promise.resolve();
  const second=queue(async()=>{writes.push('obsolete');return 2});
  const third=queue(async()=>{writes.push('latest');return 3});
  release();
  assert.equal((await first).current,false);assert.equal((await second).current,false);
  assert.deepEqual(await third,{current:true,value:3});assert.deepEqual(writes,['first','latest']);
});
test('a stale failure does not replace a newer save and does not poison the queue',async()=>{
  const queue=latestWriteQueue();let reject;
  const first=queue(()=>new Promise((_,no)=>reject=no));await Promise.resolve();
  const next=queue(async()=>42);reject(new Error('old failure'));
  assert.deepEqual(await first,{current:false});assert.deepEqual(await next,{current:true,value:42});
  await assert.rejects(queue(async()=>{throw new Error('current failure')}),/current failure/);
  assert.equal((await queue(async()=>7)).value,7);
});
