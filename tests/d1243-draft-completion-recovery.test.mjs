import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {batchHasEveryCreatedDraft} from '../app/batch-draft-integrity.ts';

test('D1243: exact finished products prove completion without a browser flag',()=>{
  const state={complete:false,designs:[{id:'a'},{id:'b'}],drafts:[{clientId:'a',id:'pa',status:'Created'},{clientId:'b',id:'pb',status:'Created'}]};
  assert.equal(batchHasEveryCreatedDraft(state),true);
  assert.equal(batchHasEveryCreatedDraft({...state,drafts:state.drafts.slice(0,1)}),false);
  assert.equal(batchHasEveryCreatedDraft({...state,drafts:[...state.drafts,{clientId:'a',id:'other',status:'Created'}]}),false);
  assert.equal(batchHasEveryCreatedDraft({...state,drafts:[state.drafts[0],{clientId:'b',id:'pa',status:'Created'}]}),false);
});

test('D1243: server normalizes stale completion and support repair is owner scoped',()=>{
  const batches=readFileSync(new URL('../app/api/batches/route.ts',import.meta.url),'utf8');
  const support=readFileSync(new URL('../app/api/mastermind/member-diagnostic/route.ts',import.meta.url),'utf8');
  assert.match(batches,/if\(batchHasEveryCreatedDraft\(incoming\)\)\{incoming=\{\.\.\.incoming,complete:true,keptAsDrafts:false\};status="complete";\}/);
  const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(app,/status:running\?"processing":complete\?drafts\.some\(draft=>draft\.status!=="Created"\)\?"needs_attention":"complete":keptAsDrafts\?"draft":"draft"/);
  assert.match(support,/if \(!owner \|\| !isOwner\(owner\)\)/);
  assert.match(support,/WHERE id=\? AND user_id=\?/);
  assert.match(support,/batchHasEveryCreatedDraft\(state\)/);
  assert.doesNotMatch(support,/printify\.com\/v1.*POST/);
});
