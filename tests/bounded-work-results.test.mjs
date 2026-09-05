import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync(new URL('../app/bounded-work.ts',import.meta.url),'utf8'));
const {runBounded}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('variant saves receive every returned draft in input order despite out-of-order completion',async()=>{
  const finish=[];let active=0,peak=0;
  const results=await runBounded([0,1,2,3],2,async id=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,id===0?30:1));
    active--;return {id:`draft-${id}`};
  },draft=>finish.push(draft.id));
  assert.deepEqual(results.map(draft=>draft.id),['draft-0','draft-1','draft-2','draft-3']);
  assert.equal(peak,2);assert.equal(finish.length,4);assert.equal(finish[0],'draft-1');
});
test('single-product saves and empty batches return arrays without requiring a callback',async()=>{
  assert.deepEqual(await runBounded([1],4,async id=>({id})),[{id:1}]);
  assert.deepEqual(await runBounded([],4,async id=>id),[]);
});
test('invalid limits and failed tasks remain rejected rather than reporting success',async()=>{
  await assert.rejects(runBounded([1],0,async id=>id),/positive integer/);
  await assert.rejects(runBounded([1],1,async()=>{throw new Error('save failed')}),/save failed/);
});
