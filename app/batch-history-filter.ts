type SearchableBatch={display_name?:string;product_title?:string;members?:Array<{productName?:string}>};
export function filterBatchHistory<T extends SearchableBatch>(batches:T[],query:string){
  const needle=query.trim().toLocaleLowerCase();
  if(!needle)return batches;
  return batches.filter(batch=>[batch.display_name,batch.product_title,...(batch.members||[]).map(member=>member.productName)].some(value=>String(value||'').toLocaleLowerCase().includes(needle)));
}
