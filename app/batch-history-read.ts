import type {PublishedDay} from './listing-goal';
export type HistoryData<T>={batches:T[];prepared?:PublishedDay[];preparedAvailable?:boolean};
export async function readBatchHistory<T>(fetcher:typeof fetch=fetch,timeoutMs=25000):Promise<HistoryData<T>>{
 const response=await fetcher('/api/batches',{signal:AbortSignal.timeout(timeoutMs)});
 if(response.status===401)throw Error('Sign in to Goldie, then reload your saved history.');
 const payload=await response.json() as HistoryData<T>&{error?:string};
 if(!response.ok)throw Error(response.status===401?'Sign in to Goldie, then reload your saved history.':payload.error||'Saved history could not be loaded. Try again.');
 if(!Array.isArray(payload.batches))throw Error('Saved history could not be read. Try again.');
 return payload;
}
export function preparedDaysFromHistory(history:{prepared?:PublishedDay[];preparedAvailable?:boolean}){
 if(history.preparedAvailable===false||!Array.isArray(history.prepared))throw Error('Your listing count is temporarily unavailable. Try loading it again.');
 return history.prepared;
}
export async function removeHistoryRows(ids:string[],fetcher:typeof fetch=fetch,timeoutMs=25000){
 const confirmed:string[]=[];
 for(const id of ids){try{const response=await fetcher(`/api/batches?id=${encodeURIComponent(id)}`,{method:'DELETE',signal:AbortSignal.timeout(timeoutMs)});if(!response.ok)return{confirmed,uncertain:true};confirmed.push(id)}catch{return{confirmed,uncertain:true}}}
 return{confirmed,uncertain:false};
}
