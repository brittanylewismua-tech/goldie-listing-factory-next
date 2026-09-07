export class DraftTransferReviewRequired extends Error {}
export type TransferState={phase:'ready'|'submitted'|'accepted'|'rejected';submittedAt?:number;error?:string};
export type TransferProduct={id:string;visible?:boolean;is_locked?:boolean;external?:{id?:string|number};title?:string;description?:string;tags?:string[];variants?:unknown[];print_areas?:unknown[]};
export async function transferDraft(io:{read():Promise<TransferProduct>;hide():Promise<void>;backup(p:TransferProduct):Promise<void>;claim(state:TransferState):Promise<boolean>;save(s:TransferState):Promise<void>;inspect?(p:TransferProduct):Promise<void>;wait?(ms:number):Promise<void>;send():Promise<{ok:boolean;status:number;detail?:string}>},productId:string,saved:TransferState){
 const before=await io.read();
 if(before.id!==productId)throw new DraftTransferReviewRequired('Printify returned a different product. Draft creation stopped.');
 if(Number(before.external?.id)>0)return {linked:true};
 // Once submitted, only reconcile. Never repeat an uncertain creation request.
 if(saved.phase==='submitted'||saved.phase==='accepted'){if(Date.now()-Number(saved.submittedAt)>15*60*1000)throw new DraftTransferReviewRequired('Printify has not completed the existing draft request. Verification can be retried; creation will not be repeated.');return {linked:false};}
 if(saved.phase==='rejected')throw new DraftTransferReviewRequired(saved.error||'Printify declined draft creation. Correct the product and try again.');
 if(before.is_locked)return {linked:false};
 await io.backup(before);
 if(before.visible!==false)await io.hide();
 let hidden=await io.read();
 // Visibility updates can be acknowledged before their read model catches up. Only read again; never send until confirmed.
 for(const ms of [500,1000,2000]){
  if(hidden.visible===false&&!hidden.is_locked||hidden.external?.id)break;
  if(io.wait)await io.wait(ms);
  hidden=await io.read();
 }
 if(io.inspect)await io.inspect(hidden);
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
 const fields=['id','title','description','tags','variants','print_areas'] as const;
 const changed=fields.filter(key=>JSON.stringify(canonical(before[key]))!==JSON.stringify(canonical(hidden[key])));
 if(hidden.visible!==false||hidden.is_locked||hidden.external?.id||changed.length)throw new DraftTransferReviewRequired(`Printify did not confirm a safe hidden draft (hidden: ${hidden.visible===false}, locked: ${Boolean(hidden.is_locked)}${changed.length?`, changed: ${changed.join(', ')}`:''}). Nothing was sent to Etsy.`);
 const pending:TransferState={phase:'submitted',submittedAt:Date.now()};
 if(!await io.claim(pending))return {linked:false};
 const response=await io.send();
 if(!response.ok){
  if(response.status>=400&&response.status<500){const error=`Printify declined draft creation (${response.status})${response.detail?`: ${response.detail}`:"."} No retry was sent.`;await io.save({...pending,phase:'rejected',error});throw new DraftTransferReviewRequired(error)}
  throw Error(`Printify has not confirmed draft creation (${response.status}). Checking the existing request without resending.`);
 }
 await io.save({...pending,phase:'accepted'});return {linked:false};
}
