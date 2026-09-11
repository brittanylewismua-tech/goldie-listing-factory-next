import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const handoff=readFileSync(new URL('../app/photo-delivery-handoff.tsx',import.meta.url),'utf8');

test('D1338: confirmed Etsy preflight failures are not presented as running jobs',()=>{
 assert.match(handoff,/let confirmedFailure=false/);
 assert.match(handoff,/confirmedFailure=true;throw Error\(payload\.error/);
 assert.match(handoff,/if\(confirmedFailure\)uncertainProducts\.current\.delete\(target\.id\);else uncertainProducts\.current\.add/);
 assert.match(handoff,/hasPreparationProblems&&!deliveries\.length\?'Etsy drafts not started'/);
 assert.match(handoff,/preparationProblemCount===1\?'listing needs':'listings need'/);
 assert.match(handoff,/Nothing was sent\. Fix the items above, then choose Save to Etsy Drafts again\./);
});

test('D1338: exact blockers open automatically and refresh is reserved for uncertain writes',()=>{
 assert.match(handoff,/open=\{Boolean\(problems\.length\|\|hasPreparationProblems\|\|error\)\}/);
 assert.match(handoff,/error&&\(hasUncertainPreparation\|\|!hasPreparationProblems\)&&<button/);
 assert.match(handoff,/loading\?'Checking saved progress…':'Check saved progress'/);
});
