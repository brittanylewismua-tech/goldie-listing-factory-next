import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
test('D1094: explicit preview refresh failures retain edit mode and offer retry',async()=>{
  const body=source.match(/async function openPreview\(\)\{([\s\S]*?)\n  \}/)[1];
  let visible=false,loading=false,message='';
  const run=new Function('draft','showRealPreview','onPreviewRequest','setShowRealPreview','setPreviewLoading','setPreviewError',`const previewRequestRevision={current:0};return (async()=>{${body}})()`);
  await run({id:'draft'},false,async()=>{throw new Error('offline')},v=>visible=v,v=>loading=v,v=>message=v);
  assert.equal(visible,false);assert.equal(loading,false);assert.match(message,/Try Preview again/);
  await run({id:'draft'},false,async()=>{},v=>visible=v,v=>loading=v,v=>message=v);
  assert.equal(visible,true);assert.equal(loading,false);assert.equal(message,'');
});
test('D1094: color preview requests strict refresh rather than silent background mode',()=>{
  assert.match(source,/onPreviewRequest=\{id=>refreshDraftPhotos\(id,true\)\}/);
  assert.match(source,/if\(!response.ok\|\|!payload.draft\)throw new Error\("Printify preview refresh failed"\)/);
  assert.match(source,/if\(requireFresh\)throw error/);
});
