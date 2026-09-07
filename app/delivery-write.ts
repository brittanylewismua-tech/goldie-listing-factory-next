/** A lost reply is not proof a provider write failed. Never retry it here. */
export async function deliveryWrite(input:string,init:RequestInit,fetcher:typeof fetch=fetch,timeoutMs=45000):Promise<Response>{
 try{return await fetcher(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init.signal?[init.signal]:[])])})}
 catch{throw new Error('The confirmation did not arrive. Work may already be saved. Choose Check saved progress before trying this listing again.')}
}
export function resolvedDeliveryUncertainty(item:{status:string;choicesChanged?:boolean;choiceCheckUnavailable?:boolean}){
 return ['waiting','delivering','completed'].includes(item.status)&&item.choicesChanged===false&&!item.choiceCheckUnavailable;
}
