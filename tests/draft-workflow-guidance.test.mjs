import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const {unfinishedDraftTask,draftTaskSummary,focusedDraftTask}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(read('app/draft-workflow-guidance.ts'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
const task=(label,done=false,extra={})=>({label,task:label,done,...extra});
test('guidance opens the first unfinished saved product and correct section',()=>{
 const products=[{index:0,name:'Hoodie',reachable:true,rows:[task('colors',true),task('prices')]},{index:1,name:'Tee',reachable:true,rows:[task('photos')]}];
 assert.deepEqual(unfinishedDraftTask(products),{index:0,name:'Hoodie',task:'prices',label:'prices'});
 products[0].rows[1].done=true;
 assert.deepEqual(unfinishedDraftTask(products),{index:1,name:'Tee',task:'photos',label:'photos'});
});
test('guidance never starts an uncreated sibling or sends users to pending and optional work',()=>{
 const products=[{index:0,name:'Not created',reachable:false,rows:[task('prices')]},{index:1,name:'Mug',reachable:true,rows:[task('waiting',false,{pending:true}),task('extra',false,{optional:true}),task('report',false,{report:true}),task('shipping')]}];
 assert.equal(unfinishedDraftTask(products).task,'shipping');
 products[1].rows.at(-1).done=true;
 assert.equal(unfinishedDraftTask(products),null);
});
test('compact product summary distinguishes reading, unfinished, and ready work',()=>{
 assert.equal(draftTaskSummary([task('photos',true),task('prices')]),'1 section to finish');
 assert.equal(draftTaskSummary([task('photos'),task('prices')]),'2 sections to finish');
 assert.equal(draftTaskSummary([task('photos',false,{pending:true})]),'Checking saved work…');
 assert.equal(draftTaskSummary([task('photos',true),task('extra',false,{optional:true})]),'Ready to continue');
 assert.equal(draftTaskSummary([]),'Open product');
});
test('one focused work surface follows the seller or the next actual requirement',()=>{
 const rows=[task('artwork',true),task('colors',true),task('prices'),task('photos')];
 assert.equal(focusedDraftTask(rows),'prices');
 assert.equal(focusedDraftTask(rows,'artwork'),'artwork');
 assert.equal(focusedDraftTask(rows,'missing'),'prices');
 assert.equal(focusedDraftTask(rows.map(row=>({...row,done:true}))),'');
 assert.equal(focusedDraftTask([task('checking',false,{pending:true}),task('extra',false,{optional:true})]),'');
});
test('guidance preserves continuation gate and focuses only after saved product restoration',()=>{
 const app=read('app/listing-factory-app.tsx');
 assert.match(app,/disabled=\{imagesStepIssues\(\)\.length>0\}/);
 assert.match(app,/if\(index!==bundleIndex&&!bundleBatchIds\[bundleRecipes\[index\]\?\.id\]\)return/);
 assert.match(app,/if\(!guidedTaskFocus\.current\|\|switchingProduct\|\|restoringBatch\)return/);
 assert.match(app,/head\.scrollIntoView\(\{block:"start"\}\);head\.focus\(\{preventScroll:true\}\)/);
 const guided=app.slice(app.indexOf('function openGuidedDraftTask'),app.indexOf('function unfinishedDraftGuidance'));
 assert.doesNotMatch(guided,/fetch\(|setPricingApproved|createDrafts|continueBundle\(/);
});
test('only inactive draft sections are folded; section navigation retains the close control',()=>{
 const app=read('app/listing-factory-app.tsx'),panel=read('app/factory-panel.tsx');
 assert.match(app,/if\(many&&!open&&workflowStep==="designs"\)return null;const rows=productRows/);
 assert.match(app,/footerActions=\{rowOpen&&workflowStep==="designs"&&rows\[rowIndex\+1\]\?\.task/);
 assert.match(panel,/\{footerActions\}[\s\S]*className="panel-collapse-foot"/);
});
