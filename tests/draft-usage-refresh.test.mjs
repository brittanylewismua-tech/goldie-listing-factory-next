import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('a successful draft run refreshes account usage before listing details',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const run=source.slice(source.indexOf('async function runDrafts('),source.indexOf('async function updateDraftColorArtwork('));
  assert.match(run,/if\(createdNow>0\)\{\s*setComplete\(true\);[\s\S]*?setUsageRevision\(current=>current\+1\);/);
});
