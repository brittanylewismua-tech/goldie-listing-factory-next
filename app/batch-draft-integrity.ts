type DraftIdentity = { id?:string; clientId?:string; batchId?:string; sourceTemplateId?:string; status?:string; costReview?:{required?:boolean;approved?:boolean} };
type BatchIdentity = { designs?:Array<{id?:string}>; drafts?:DraftIdentity[]; templateDetails?:{id?:string;batchId?:string}; pricingApproved?:boolean };

/** A late product response can update matching records, never insert records
 * from the product that was open when the request started. */
export function mergeMatchingDrafts<T extends DraftIdentity>(current:T[], updates:T[]):T[]{
  const byId=new Map(updates.filter(item=>item.id).map(item=>[item.id,item]));
  return current.map(item=>{
    const update=byId.get(item.id);
    return update&&update.clientId===item.clientId?{...item,...update}:item;
  });
}

/** Recover only using the owner's exact design/session identities. A filename,
 * product nickname, array position or another bundle member is never evidence. */
export function restoreBatchDrafts<T extends BatchIdentity>(state:T, authoritative:DraftIdentity[]):T{
  if(!Array.isArray(state.designs)||!state.designs.length)return state;
  const restored:DraftIdentity[]=[];
  for(const design of state.designs){
    if(!design?.id)continue;
    const existing=(Array.isArray(state.drafts)?state.drafts:[]).find(draft=>draft?.clientId===design.id);
    const candidates=authoritative.filter(draft=>draft?.clientId===design.id&&draft.id&&
      (draft.id===existing?.id||Boolean(state.templateDetails?.batchId&&draft.batchId===state.templateDetails.batchId)||Boolean(state.templateDetails?.id&&draft.sourceTemplateId===state.templateDetails.id)));
    const exact=candidates.find(draft=>draft.id===existing?.id);
    const chosen=exact||(candidates.length===1?candidates[0]:undefined);
    if(chosen)restored.push({...existing,...chosen});else if(existing)restored.push(existing);
  }
  const approval=restored.filter(draft=>draft.status==='Created'&&draft.costReview?.required);
  return {...state,drafts:restored,pricingApproved:approval.length?approval.every(draft=>draft.costReview?.approved):state.pricingApproved};
}

export function batchDraftIdentityProblem(state:BatchIdentity):boolean{
  if(!Array.isArray(state.drafts)||!state.drafts.length)return false;
  const ids=new Set((Array.isArray(state.designs)?state.designs:[]).map(design=>design?.id).filter(Boolean));
  const products=new Set<string>();
  return state.drafts.some(draft=>{
    if(!draft?.clientId||!ids.has(draft.clientId))return true;
    if(!draft.id)return false;
    if(products.has(draft.id))return true;
    products.add(draft.id);return false;
  });
}

/** Independent products save independently; writes for one snapshot are ordered. */
export function serializedBatchWrites(){
  const tails=new Map<string,Promise<unknown>>();
  return <T>(key:string,write:()=>Promise<T>):Promise<T>=>{
    const result=(tails.get(key)||Promise.resolve()).catch(()=>undefined).then(write);
    tails.set(key,result);
    void result.finally(()=>{if(tails.get(key)===result)tails.delete(key)}).catch(()=>undefined);
    return result;
  };
}
