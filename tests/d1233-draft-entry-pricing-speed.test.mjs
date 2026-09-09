import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app/listing-factory-app.tsx');
const css=read('app/interface-v2.css');

test('D1233: Drafts starts with stage one and has no competing status command',()=>{
  assert.match(app,/focusedDraftTask\(rows,activeTask\)/);
  assert.doesNotMatch(app,/draft-product-guidance/);
  assert.doesNotMatch(app,/Still needed/);
  assert.doesNotMatch(app,/showingNextRequired/);
});

test('D1233: item pricing is one outer card with line-separated groups',()=>{
  assert.match(css,/\.post-draft-pricing-panel \.editable-draft-pricing>\.variant-pricing\{[^}]*border:0!important[^}]*background:transparent!important[^}]*box-shadow:none!important/);
  assert.match(css,/\.post-draft-pricing-panel \.item-pricing-section\{[^}]*border:0!important[^}]*background:transparent!important[^}]*box-shadow:none!important/);
  assert.match(css,/\.post-draft-pricing-panel \.price-group\{[^}]*border:0[^}]*background:transparent/);
  assert.match(css,/\.post-draft-pricing-panel \.price-group\+\.price-group\{[^}]*border-top:1px solid/);
  assert.match(app,/Create whole-number pricing/);
  assert.match(app,/changeIndividualPrice\(variant,cents\)/);
});

test('D1233: local cache work never delays a finished provider result and polling checks immediately',()=>{
  assert.match(app,/const delay=attempt===0\?0:attempt<20\?500:5000/);
  assert.match(app,/cacheWrites\.push\(saveBatchFiles[\s\S]*\.then\(\(\)=>saveBatchArtworkAssets/);
  assert.match(app,/Promise\.all\(\[persistRunNow\(\),runBounded\(members,4,member=>saveMember\(member\)\)\]\)/);
  assert.match(app,/void Promise\.allSettled\(cacheWrites\);\s*await providerCompletion/);
  assert.doesNotMatch(app,/Promise\.all\(\[providerCompletion,Promise\.all\(cacheWrites\)\]\)/);
});
