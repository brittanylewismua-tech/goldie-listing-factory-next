import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {CLAIM_DRAFT_GROUP_SQL,draftCreationSlotReleased} from '../app/api/printify/draft-job-store.ts';
import {restoreBatchDrafts} from '../app/batch-draft-integrity.ts';
import {runBounded} from '../app/bounded-work.ts';

test('creation confirmation uses the admitted exclusion-aware draft count',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const modal=source.slice(source.indexOf('<h2 id="preflight-title">'),source.indexOf('</section></div>}',source.indexOf('<h2 id="preflight-title">')));
  assert.match(modal,/Create \$\{requestedListingCount\} private/);
  assert.match(modal,/\$\{requestedListingCount\} drafts after exclusions/);
  assert.doesNotMatch(modal,/Create \$\{files.length\*bundleRecipes.length\}/);
});

test('creation prevents upload or product mutations and price changes paint in sync',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  for(const name of ['chooseFiles','removeDesign','changeProduct','addArtworkVersion'])assert.match(source,new RegExp('async function '+name+'\\([^\\n{]*\\)\\s*\\{\\s*if\\(draftRunInFlight.current\\)return'));
  assert.match(source,/<article inert=\{running\|\|Boolean\(bundleRun\)\} className=\{`step-card designs-step/);
  assert.match(source,/<div inert=\{running\|\|Boolean\(bundleRun\)\} className="design-upload-review"/);
  assert.match(source,/aria-label="Change saved product" disabled=\{running\|\|Boolean\(bundleRun\)\}/);
  assert.match(source,/useLayoutEffect\(\(\)=>setDraft\(\(value\/100\).toFixed\(2\)\),\[value\]\)/);
});

test('whole-submission completion refreshes sibling counts only after durable final saves',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const queue=source.slice(source.indexOf('async function queueDraftSubmission()'),source.indexOf('function retryFailed()'));
  assert.ok(queue.indexOf('setBundleCompletionRevision(current=>current+1)')>queue.indexOf('for(const member of members)await saveMember(member,true)'));
  assert.match(source,/\[activeBundle,bundleRecipes,activeRecipe,bundleBatchIds,bundleCompletionRevision\]/);
  assert.doesNotMatch(source,/\[activeBundle,bundleRecipes,activeRecipe,bundleBatchIds,[^\]]*savedRevision/);
});

test('submission preparation is bounded and settles copies before reporting an error',async()=>{
  const route=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
  assert.match(route,/await runBounded\(requests,4,async body=>\{try\{/);
  assert.match(route,/catch\(error\)\{preparationError \|\|= error;\}\}\);/);
  assert.ok(route.indexOf('if(preparationError)throw preparationError')<route.indexOf('DB.prepare(claimDraftGroupSql(plan.key))'));
  let active=0,peak=0,error,finished=0;
  await runBounded(Array.from({length:9},(_,i)=>i),4,async i=>{try{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve, i===0?1:5));
    if(i===0)throw Error('copy failed');
  }catch(e){error ||= e;}finally{active--;finished++;}});
  assert.equal(peak,4);assert.equal(active,0);assert.equal(finished,9);assert.equal(error.message,'copy failed');
});

test('background progress and saving a not-yet-created batch make no contradictory promises',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\(running\|\|preparingEtsy\|\|Boolean\(bundleRun\)\).*Keep this page open/);
  assert.match(source,/id="save-draft-title">Save this batch for later\?/);
  assert.doesNotMatch(source,/The products remain unpublished Printify drafts, and every title/);
  assert.match(source,/if\(payload.batch.status==="processing"&&!state.complete&&state.template\)void refreshRestoredTemplate/);
  assert.doesNotMatch(source,/if\(payload.batch.status==="processing"&&state.template\)void loadTemplateUrl/);
  assert.match(source,/!complete&&bundleQualityGroups.length>0&&<section/);
});

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
  assert.match(queue,/bundleMemberDesigns\(files,recipe.id,bundleQualityDecisions/);
  assert.ok(queue.indexOf('setFiles(activeMember.designs)')>queue.indexOf('result.accepted!==requests.length'));
  assert.match(queue,/bundleQualityDecisions:memberPlan.decisions/);
  assert.match(queue,/recoverDraft\(queuedDesignSessions.current.get\(design.id\)/);
  const route=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
  assert.match(route,/claimDraftGroupSql\(plan.key\)/);assert.match(route,/DRAFT_CREATION.createBatch/);
  assert.match(route,/source.customMetadata\?\.owner!==owner/);
});
