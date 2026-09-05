import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function openPreview(){');
const end=source.indexOf('\n  return <section ref={selectorRef}',start);
const body=source.slice(start,end);
function harness(){
  let finish,reject;
  const pending=new Promise((a,b)=>{finish=a;reject=b});
  const revision={current:0},state={shown:false,loading:false,error:''};
  const open=Function('previewRequestRevision','onPreviewRequest','setShowRealPreview','setPreviewLoading','setPreviewError',`const draft={id:'natural-draft'},showRealPreview=false;${body};return openPreview`)(revision,()=>pending,v=>state.shown=v,v=>state.loading=v,v=>state.error=v);
  return {open,revision,state,finish,reject};
}
test('a completed preview request cannot open the newly hovered color',async()=>{
  const h=harness(),running=h.open();h.revision.current++;h.state.loading=false;h.finish();await running;assert.equal(h.state.shown,false);assert.equal(h.state.loading,false);
});
test('a stale preview failure cannot replace the current color with an error',async()=>{
  const h=harness(),running=h.open();h.revision.current++;h.state.loading=false;h.reject(new Error('old request'));await running;assert.equal(h.state.error,'');assert.equal(h.state.shown,false);
});
test('the current color preview still opens on success',async()=>{
  const h=harness(),running=h.open();h.finish();await running;assert.equal(h.state.shown,true);assert.equal(h.state.loading,false);
});
test('color and listing changes invalidate in-flight previews',()=>{
  assert.match(source,/function focusColor\(id:number\)\{[^\n]*previewRequestRevision\.current\+\+/);
  assert.match(source,/function showDraft\(id:string\)\{[^\n]*previewRequestRevision\.current\+\+/);
});
test('switching a bundle product retains the current editor phase, not its older saved phase',()=>{
  const block=source.slice(source.indexOf('function openBundleProduct('),source.indexOf('async function continueBundle('));
  assert.match(block,/restoreBatchById\(existing,workflowStep,finishPhase,true\)/);
});
