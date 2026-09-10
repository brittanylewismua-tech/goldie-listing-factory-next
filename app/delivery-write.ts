/** A lost reply is not proof a provider write failed. Never retry it here. */
export async function deliveryWrite(input:string,init:RequestInit,fetcher:typeof fetch=fetch,timeoutMs=45000):Promise<Response>{
 try{return await fetcher(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init.signal?[init.signal]:[])])})}
 catch{throw new Error('The confirmation did not arrive. Work may already be saved. Choose Check saved progress before trying this listing again.')}
}
export function resolvedDeliveryUncertainty(item:{status:string;choicesChanged?:boolean;choiceCheckUnavailable?:boolean}){
 return ['waiting','delivering','completed'].includes(item.status)&&item.choicesChanged===false&&!item.choiceCheckUnavailable;
}
export function deliveryChoiceRecovery(item:{status:string;choiceCheckUnavailable?:boolean}){
 if(item.choiceCheckUnavailable)return 'Current saved choices could not be checked. Check saved progress before publishing.';
 if(item.status==='completed')return 'Your saved changes have not been applied to Etsy yet. Apply them here before publishing.';
 if(['preparing','waiting','delivering'].includes(item.status))return 'This delivery uses your earlier choices. Send the updated choices after it finishes, or cancel while waiting.';
 return 'This attempt has stopped. Review your current choices, then update this Etsy draft.';
}
