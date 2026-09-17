import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const fallback=source.indexOf('const fallback=!connected||!etsyConnected'),start=source.lastIndexOf('useEffect(()=>{',fallback),end=source.indexOf('},[',fallback);
const body=source.slice(start+'useEffect(()=>{'.length,end);
const invoke=new Function('state','goToStep',`const {localPreview,checkingConnection,checkingEtsyConnection,restoringBatch,runInProgress,canOpenStep,workflowStep,connected,etsyConnected,connectionCheckFailed,etsyCheckFailed,templateLoaded,files,complete}=state;${body}`);
const base={localPreview:false,checkingConnection:false,checkingEtsyConnection:false,connectionCheckFailed:false,etsyCheckFailed:false,restoringBatch:false,runInProgress:{current:false},canOpenStep:()=>false,workflowStep:'finish',connected:true,etsyConnected:false,templateLoaded:true,files:[{}],complete:true};
test('a restored finish step waits for both connection checks, whichever finishes first',()=>{
 for(const pending of [{checkingEtsyConnection:true},{checkingConnection:true,connected:false,etsyConnected:true}]){const calls=[];invoke({...base,...pending},(...args)=>calls.push(args));assert.deepEqual(calls,[])}
});
test('a genuine disconnected account still returns to connection recovery after checks settle',()=>{
 const calls=[];invoke(base,(...args)=>calls.push(args));assert.deepEqual(calls,[['connect',true,true]]);
 const connected=[];invoke({...base,etsyConnected:true,canOpenStep:()=>true},(...args)=>connected.push(args));assert.deepEqual(connected,[]);
});
test('settling Etsy status reruns the navigation guard',()=>{assert.match(source.slice(end,source.indexOf(']);',end)),/checkingEtsyConnection/)});

test('a check that could not be made never relocates the member',()=>{
 /*
   D1650 · checkPrintifyConnection and checkEtsyConnection set connected=false
   when the CHECK failed, so a 500 or a timeout made this guard believe the
   member had no accounts and moved them back to the connect step — away from
   the batch they were in the middle of. An unanswered question is not a no.
 */
 for(const failure of [{connectionCheckFailed:true},{etsyCheckFailed:true}]){
  const calls=[];
  invoke({...base,etsyConnected:false,...failure},(...args)=>calls.push(args));
  assert.deepEqual(calls,[],'a failed check must not navigate');
 }
 /* And a check that succeeded and found nothing still recovers. */
 const settled=[];
 invoke({...base,etsyConnected:false},(...args)=>settled.push(args));
 assert.deepEqual(settled,[['connect',true,true]]);
});
