import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {CLAIM_DRAFT_GROUP_SQL,draftCreationSlotReleased} from '../app/api/printify/draft-job-store.ts';
import {restoreBatchDrafts} from '../app/batch-draft-integrity.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE printify_draft_results(request_key TEXT PRIMARY KEY,user_id TEXT,batch_id TEXT,client_id TEXT,status TEXT,response_json TEXT,updated_at TEXT,created_at TEXT)');
  const items=(keys)=>keys.map(key=>({key,batchId:'session-'+key,clientId:'design-'+key,job:{version:1,phase:'queued',workflowId:'job-'+key,inputKey:'private-'+key}}));
  return {db,claim:(keys,limit=20,owner='owner')=>db.prepare(CLAIM_DRAFT_GROUP_SQL).all(JSON.stringify(items(keys)),owner,limit)};
}
test('whole submissions reserve quota atomically, not product by product',()=>{
  const {db,claim}=fixture();
  assert.equal(claim(['a','b','c'],4).length,3);
  assert.equal(claim(['d','e'],4).length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM printify_draft_results').get().n,3);
  assert.equal(claim(['d'],4).length,1);db.close();
});
test('creation lanes wait for active writes; read-only reconciliation retains quota but frees the lane',()=>{
  assert.equal(draftCreationSlotReleased('running'),false);
  assert.equal(draftCreationSlotReleased('queued'),false);
  for(const status of ['succeeded','failed','uncertain'])assert.equal(draftCreationSlotReleased(status),true);
  const workflow=readFileSync(new URL('../worker/draft-creation-workflow.ts',import.meta.url),'utf8');
  assert.ok(workflow.indexOf('submission-lane-wait-')<workflow.indexOf('executeDraftJob(input'));
  assert.match(workflow,/bind\(dependency,owner\)/);
});
test('overlapping submissions reuse existing identities without reserving twice',()=>{
  const {db,claim}=fixture();
  claim(['a','b'],3);
  assert.equal(claim(['a','b','c'],3).length,1);
  assert.equal(claim(['a','b','c'],3).length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM printify_draft_results').get().n,3);db.close();
});
test('uncertain jobs never expire; failed jobs can be admitted without touching another owner',()=>{
  const {db,claim}=fixture();claim(['a','b'],2);
  db.exec("UPDATE printify_draft_results SET status='uncertain',updated_at='2020-01-01' WHERE request_key='a'");
  assert.equal(claim(['c'],2).length,0);
  db.exec("UPDATE printify_draft_results SET status='failed' WHERE request_key='b'");
  assert.equal(claim(['b'],2,'intruder').length,0);
  assert.equal(claim(['b'],2).length,1);
  assert.equal(JSON.parse(db.prepare("SELECT response_json FROM printify_draft_results WHERE request_key='a'").get().response_json).workflowId,'job-a');db.close();
});
test('a browser closed before its final autosave resumes completed background drafts',()=>{
  const before={complete:false,designs:[{id:'a'},{id:'b'}],drafts:[],templateDetails:{id:'template',batchId:'session'}};
  const result=id=>({clientId:id,id:'product-'+id,batchId:'session',status:'Created'});
  assert.equal(restoreBatchDrafts(before,[result('a')]).complete,false);
  assert.equal(restoreBatchDrafts(before,[result('a'),result('b')]).complete,true);
  assert.equal(restoreBatchDrafts(before,[{...result('a'),batchId:'other'},result('b')]).complete,false);
});
test('the fresh submission path stages and saves every member before one bulk admission',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const queue=source.slice(source.indexOf('async function queueDraftSubmission()'),source.indexOf('function retryFailed()'));
  assert.match(queue,/recipes=activeBundle&&bundleRecipes.length>1\?bundleRecipes/);
  assert.ok(queue.indexOf('for(const member of members)await saveMember(member)')<queue.indexOf('JSON.stringify({requests})'));
  assert.ok(queue.indexOf('result.accepted!==requests.length')<queue.indexOf('You can close this tab'));
  assert.match(queue,/recipe.id.*file.id.*exclude/);
  assert.match(queue,/recoverDraft\(queuedDesignSessions.current.get\(design.id\)/);
  const route=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
  assert.match(route,/CLAIM_DRAFT_GROUP_SQL/);assert.match(route,/DRAFT_CREATION.createBatch/);
  assert.match(route,/source.customMetadata\?\.owner!==owner/);
});
