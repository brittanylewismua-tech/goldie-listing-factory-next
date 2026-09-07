type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
type RevisionRow={id:string;revision:number};
/** Revisions belong to the snapshot opened in this browser, never a history
 * refresh. An uncertain write closes the lane until a full page reload. */
export function createBatchSaveTransport(fetcher:Fetcher,onConflict:(message:string)=>void,timeoutMs=30000){
 const revisions=new Map<string,number>(),pending=new Map<string,Promise<Response>>();
 let barrier:Promise<unknown>=Promise.resolve(),blocked=false;
 const message='Saving is paused because newer saved work or an interrupted save needs checking. Reload the saved batch before continuing. Your unsaved changes are still visible here.';
 function conflict(){blocked=true;onConflict(message);return Response.json({code:'BATCH_SAVE_CONFLICT',error:message},{status:409})}
 async function read(input:string,init?:RequestInit){
  const response=await fetcher(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init?.signal?[init.signal]:[])])});
  if(response.ok){
   const payload=await response.clone().json().catch(()=>null) as {batch?:RevisionRow}|null;
   const row=payload?.batch;
   if(row&&Number.isSafeInteger(row.revision)&&!revisions.has(row.id)&&!pending.has(row.id))revisions.set(row.id,row.revision);
  }
  return response;
 }
 async function mutate(input:string,init:RequestInit,id:string,method:string){
  if(blocked)return conflict();
  const headers=new Headers(init.headers);
  if(method==='POST')headers.set('x-batch-revision',String(revisions.get(id)??0));
  try{
   const response=await fetcher(input,{...init,headers,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init.signal?[init.signal]:[])])});
   const payload=await response.clone().json().catch(()=>null) as {id?:string;revision?:number;revisions?:RevisionRow[]}|null;
   if(response.status===409)return conflict();
   // A server failure can follow a committed write. Do not guess or retry it.
   if(response.status>=500)return conflict();
   if(response.ok&&method==='POST'){
    if(payload?.id!==id||!Number.isSafeInteger(payload.revision))return conflict();
    revisions.set(id,payload.revision!);
   }
   if(response.ok&&method==='PATCH'){
    if(!Array.isArray(payload?.revisions))return conflict();
    for(const row of payload.revisions){
     const known=revisions.get(row.id);
     if(known!==undefined){if(known!==row.revision-1)return conflict();revisions.set(row.id,row.revision)}
    }
   }
   return response;
  }catch{return conflict()}
 }
 return (input:string,init:RequestInit={}):Promise<Response>=>{
  const method=(init.method||'GET').toUpperCase();
  if(method==='GET')return read(input,init);
  let id='';try{id=JSON.parse(String(init.body||'{}')).id||new URL(input,'https://goldie.invalid').searchParams.get('id')||''}catch{/* validation stays on the server */}
  // PATCH may update every child: drain earlier writes and hold later writes.
  const before=method==='POST'?Promise.all([barrier,pending.get(id)?.catch(()=>undefined)]):Promise.all([barrier,...[...pending.values()].map(p=>p.catch(()=>undefined))]);
  const task=before.then(()=>mutate(input,init,id,method));
  if(method!=='POST')barrier=task.catch(()=>undefined);
  pending.set(id,task);
  void task.finally(()=>{if(pending.get(id)===task)pending.delete(id)}).catch(()=>undefined);
  return task;
 };
}
