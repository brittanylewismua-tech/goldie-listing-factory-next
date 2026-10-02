/**
 * Purchase-led My Shop priorities. This module deliberately has no favorites,
 * keyword, or visual score input: only recorded Etsy transaction quantities
 * can set the order. The UI can layer product analysis onto these rows later.
 */
export type PurchaseSale = {
  listingId:number; quantity:number; priceMinor:number; currency:string; soldAt:number; refunded:boolean;
};
export type PurchaseListing = {
  listingId:number; title:string; imageUrl:string; state:string;
};
export type PurchasePriority = PurchaseListing & {
  rank:number; unitsPurchased:number; orders:number; productRevenueMinor:number|null;currency:string|null;
  share:number; lastPurchasedAt:number;
};
export type PurchasePriorityMap = {
  days:30|90; totalUnits:number; totalOrders:number; unmatchedUnits:number;
  excludedRefundUnits:number; receiptsComplete:boolean; refreshedAt:number|null;
  shareLabel:string; remainingUnits:number; priorities:PurchasePriority[];
  listings:PurchasePriority[];
};

export type PurchasedProductMix = {
  label:string;units:number;share:number;listingCount:number;
};

/* Use only recognized catalog product types. The denominator still includes
   every matched purchased unit, including products whose type is unknown. */
export function buildPurchasedProductMix(
  map:PurchasePriorityMap,
  categories:Array<{listingId:number;label:string}>,
):PurchasedProductMix[] {
  if(map.totalUnits<=0)return [];
  const labels=new Map(categories.map(row=>[row.listingId,row.label.trim()]));
  const grouped=new Map<string,{units:number;ids:Set<number>}>();
  for(const listing of map.listings){
    const label=labels.get(listing.listingId);
    if(!label)continue;
    const held=grouped.get(label)??{units:0,ids:new Set<number>()};
    held.units+=listing.unitsPurchased;
    held.ids.add(listing.listingId);
    grouped.set(label,held);
  }
  return [...grouped.entries()].map(([label,row])=>({
    label,units:row.units,share:row.units/map.totalUnits,listingCount:row.ids.size,
  })).sort((a,b)=>b.units-a.units||a.label.localeCompare(b.label));
}

export function buildPurchasePriorities(
  sales:PurchaseSale[], listings:PurchaseListing[],
  options:{days:30|90;now:number;receiptsComplete:boolean;refreshedAt?:number|null},
):PurchasePriorityMap {
  const cutoff=options.now-options.days*86400;
  const byId=new Map<number,{units:number;orders:number;revenue:number;latest:number;currency:string|null;mixedCurrency:boolean}>();
  let unmatchedUnits=0;
  let excludedRefundUnits=0;
  for(const sale of sales){
    const quantity=Number(sale.quantity),soldAt=Number(sale.soldAt);
    if(!Number.isInteger(quantity)||quantity<=0||!Number.isFinite(soldAt)
      ||soldAt<cutoff||soldAt>options.now)continue;
    if(sale.refunded){excludedRefundUnits+=quantity;continue}
    const id=Number(sale.listingId);
    if(!Number.isSafeInteger(id)||id<=0){unmatchedUnits+=quantity;continue}
    const held=byId.get(id)??{units:0,orders:0,revenue:0,latest:0,currency:null,mixedCurrency:false};
    const currency=String(sale.currency||"").toUpperCase();
    if(!currency||(held.currency&&held.currency!==currency))held.mixedCurrency=true;
    if(!held.currency&&currency)held.currency=currency;
    held.units+=quantity;
    held.orders+=1;
    held.revenue+=quantity*Math.max(0,Number(sale.priceMinor)||0);
    held.latest=Math.max(held.latest,soldAt);
    byId.set(id,held);
  }
  const totalUnits=[...byId.values()].reduce((sum,row)=>sum+row.units,0);
  const totalOrders=[...byId.values()].reduce((sum,row)=>sum+row.orders,0);
  const listingById=new Map(listings.map(row=>[row.listingId,row]));
  const ranked=[...byId.entries()].sort((a,b)=>
    b[1].units-a[1].units||b[1].latest-a[1].latest||a[0]-b[0]);
  let previousUnits=-1;
  let previousRank=0;
  const all=ranked.map(([id,row],index):PurchasePriority=>{
    const found=listingById.get(id);
    const rank=row.units===previousUnits?previousRank:index+1;
    previousUnits=row.units;previousRank=rank;
    return {
      listingId:id,title:found?.title||"Listing details unavailable",
      imageUrl:found?.imageUrl||"",state:found?.state||"unknown",
      rank,unitsPurchased:row.units,orders:row.orders,
      productRevenueMinor:row.mixedCurrency?null:row.revenue,currency:row.mixedCurrency?null:row.currency,
      share:totalUnits?row.units/totalUnits:0,
      lastPurchasedAt:row.latest,
    };
  });
  const priorities=all.slice(0,3);
  return {
    days:options.days,totalUnits,totalOrders,unmatchedUnits,excludedRefundUnits,
    receiptsComplete:options.receiptsComplete,refreshedAt:options.refreshedAt??null,
    shareLabel:options.receiptsComplete&&unmatchedUnits===0&&excludedRefundUnits===0
      ?"Share of shop purchases":"Share of matched purchases",
    remainingUnits:Math.max(0,totalUnits-priorities.reduce((sum,row)=>sum+row.unitsPurchased,0)),
    priorities,listings:all,
  };
}
