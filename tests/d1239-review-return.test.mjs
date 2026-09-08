import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');

test('D1239: the active Review rail returns from a focused editor without running completion gates',()=>{
  const openProgress=app.slice(app.indexOf('async function openProgressStep'),app.indexOf('async function goBackOneStep'));
  const returnToReview='if(index===8&&workflowStep==="finish")return openFinishedReview(false);';
  assert.match(openProgress,new RegExp(returnToReview.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(openProgress.indexOf(returnToReview)<openProgress.indexOf('const targetStage='));
  assert.ok(openProgress.indexOf(returnToReview)<openProgress.indexOf('requiredForProgress(index)'));
});
