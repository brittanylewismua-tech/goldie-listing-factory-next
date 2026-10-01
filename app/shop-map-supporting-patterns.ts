import type {WinningPatternMap} from "./shop-map-patterns";
import type {PurchasePriorityMap,PurchasePriority} from "./shop-map-purchase-priorities";

export type PurchasedPatternSupport={
  pattern:WinningPatternMap["patterns"][number];
  source:PurchasePriority|null;
};

/** Visual observations are ordered by their strongest linked purchased product. */
export function purchasedPatternSupport(
  map:WinningPatternMap,purchases:PurchasePriorityMap|null,
  limit=4,
):PurchasedPatternSupport[]{
  const byId=new Map((purchases?.listings??[]).map(row=>[row.listingId,row]));
  return map.patterns.map((pattern,index)=>{
    const linked=pattern.listingIds.map(id=>byId.get(id)).filter((row):row is PurchasePriority=>Boolean(row))
      .sort((a,b)=>b.unitsPurchased-a.unitsPurchased||a.rank-b.rank||a.listingId-b.listingId);
    return {pattern,source:linked[0]??null,index};
  }).sort((a,b)=>(b.source?.unitsPurchased??0)-(a.source?.unitsPurchased??0)
    ||a.index-b.index)
    .slice(0,limit)
    .map(({pattern,source})=>({pattern,source}));
}
