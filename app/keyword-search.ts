export type KeywordOrder = 'newest' | 'relevance' | 'price' | 'price-desc';
export function keywordSearchParams(phrase:string, order:KeywordOrder, offset:number, query='') {
  return new URLSearchParams({keywords:[phrase.trim(),query.trim()].filter(Boolean).join(' '),
    limit:'24',offset:String(offset),sort_on:order==='newest'?'created':order==='relevance'?'score':'price',
    sort_order:order==='price'?'asc':'desc'});
}
export function keywordNextOffset(offset:number, returned:number, total:number|null) {
  const next=offset+returned;
  return returned>0&&(total===null?returned===24:next<total)?next:null;
}
/** Preserve Etsy search order: the batch hydration response is not ordered. */
export function orderedSearchDetails<T extends {listing_id?:number}>(rows:T[],details:Map<number,T>):T[] {
  return rows.map(row=>({...row,...details.get(Number(row.listing_id))}));
}
