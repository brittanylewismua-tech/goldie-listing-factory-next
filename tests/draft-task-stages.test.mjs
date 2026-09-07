import test from 'node:test';
import assert from 'node:assert/strict';
import {DRAFT_TASK_STAGES,draftTaskStage,visibleDraftStage} from '../app/draft-task-stages.ts';
const rows=[{task:'placement',done:true},{task:'draft-colors',done:true},{task:'draft-sizes',done:true},{task:'draft-pricing',done:false},{task:'draft-shipping',done:true},{task:'photos',done:false}];
test('each of the six setup tasks belongs to exactly one reachable stage',()=>{
 assert.deepEqual(DRAFT_TASK_STAGES.flatMap(stage=>stage.tasks),rows.map(row=>row.task));
 assert.equal(new Set(DRAFT_TASK_STAGES.flatMap(stage=>stage.tasks)).size,6);
});
test('guided next and recovery actions reveal their target stage; closing retains the chosen stage',()=>{
 assert.equal(visibleDraftStage(rows,'photos','design'),'photos');
 assert.equal(visibleDraftStage(rows,'draft-pricing','design'),'details');
 assert.equal(visibleDraftStage(rows,'','photos'),'photos');
 assert.equal(visibleDraftStage(rows,'','invalid'),'details');
});
test('product-aware stages support non-apparel rows and fully saved work',()=>{
 const mug=rows.filter(row=>row.task!=='draft-colors');
 assert.equal(visibleDraftStage(mug,'draft-sizes'),'design');
 assert.equal(visibleDraftStage(rows.map(row=>({...row,done:true})),''),'design');
 assert.equal(draftTaskStage('unknown'),undefined);
});
