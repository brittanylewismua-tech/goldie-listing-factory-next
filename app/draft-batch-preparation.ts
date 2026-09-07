import {runBounded} from './bounded-work';
/** Bound image preparation and let every started request settle before unlocking the UI. */
export async function prepareDraftBatch<T>(items:T[],prepare:(item:T)=>Promise<void>,onSettled?:(finished:number,total:number)=>void){
 let finished=0;
 const results=await runBounded(items,3,async item=>{
  let error:Error|null=null;
  try{await prepare(item)}catch(value){error=value instanceof Error?value:new Error(String(value))}
  onSettled?.(++finished,items.length);
  return error;
 });
 return results.filter((error):error is Error=>error!==null);
}
