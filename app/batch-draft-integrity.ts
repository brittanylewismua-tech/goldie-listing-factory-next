type DraftIdentity = { id?:string; clientId?:string; batchId?:string; sourceTemplateId?:string; status?:string; priceEdits?:Record<string,number>; costReview?:{required?:boolean;approved?:boolean;variants?:Array<{id:number;price:number;isEnabled?:boolean}>} };
type BatchIdentity = { designs?:Array<{id?:string}>; drafts?:DraftIdentity[]; templateDetails?:{id?:string;batchId?:string}; complete?:boolean;pricingApproved?:boolean;variantPrices?:Record<string,number> };

export function pricesMatchSavedDrafts(drafts:DraftIdentity[],prices:Record<string,number>={}){
  return drafts.every(draft=>{
    const expected=draft.priceEdits??prices;
    return (draft.costReview?.variants||[]).every(variant=>variant.isEnabled===false||!Object.prototype.hasOwnProperty.call(expected,String(variant.id))||Number(expected[String(variant.id)])===Number(variant.price));
  });
}

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
export function restoreBatchDrafts<T extends BatchIdentity>(state:T, authoritative:DraftIdentity[]):T&{complete?:boolean}{
  if(!Array.isArray(state.designs)||!state.designs.length)return state;
  const restored:DraftIdentity[]=[];
  for(const design of state.designs){
    if(!design?.id)continue;
    const existing=(Array.isArray(state.drafts)?state.drafts:[]).find(draft=>draft?.clientId===design.id);
    const candidates=authoritative.filter(draft=>draft?.clientId===design.id&&draft.id&&
      (draft.id===existing?.id||Boolean(state.templateDetails?.batchId&&draft.batchId===state.templateDetails.batchId)||Boolean(state.templateDetails?.id&&draft.sourceTemplateId===state.templateDetails.id)));
    const exact=candidates.find(draft=>draft.id===existing?.id);
    const chosen=exact||(candidates.length===1?candidates[0]:undefined);
    if(chosen){
      const merged={...existing,...chosen};
      // A local edit is not a saved Printify price just because an older server
      // result was approved. Keep the card and continuation gate in agreement.
      if(merged.costReview?.approved&&!pricesMatchSavedDrafts([merged],state.variantPrices))merged.costReview={...merged.costReview,approved:false};
      restored.push(merged);
    }else if(existing)restored.push(existing);
  }
  const approval=restored.filter(draft=>draft.status==='Created'&&draft.costReview?.required);
  const allCreated=state.designs.every(design=>restored.some(draft=>draft.clientId===design.id&&draft.id&&draft.status==='Created'));
  return {...state,drafts:restored,complete:allCreated||state.complete,pricingApproved:approval.length?approval.every(draft=>draft.costReview?.approved)&&pricesMatchSavedDrafts(approval,state.variantPrices):state.pricingApproved};
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
