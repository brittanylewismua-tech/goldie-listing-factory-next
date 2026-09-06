import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=readFileSync(new URL('../app/draft-price-edits.ts',import.meta.url),'utf8');
const {finalPriceApproval}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64'));
const saved={status:'Created',costReview:{required:true,verified:true,approved:true}};
test('verified saved receipts repair stale batch approval',()=>{assert.equal(finalPriceApproval([saved,saved]),true)});
test('one unsaved or unverified finished price blocks the batch',()=>{for(const costReview of [{required:true,verified:true,approved:false},{required:true,verified:false,approved:true}])assert.equal(finalPriceApproval([saved,{status:'Created',costReview}]),false)});
test('created drafts alone and legacy drafts never manufacture approval',()=>{for(const drafts of [[],[{status:'Created'}],[saved,{status:'Created'}]])assert.equal(finalPriceApproval(drafts),null)});
