import type {PurchasePriorityMap} from "./shop-map-purchase-priorities";

export type DiscoveryListing={
  listingId:number; title:string; imageUrl:string; productFamily:string;
  state:string; artworkHash:string|null; createdAt:number|null; views:number|null;
};
export type DiscoverySale={listingId:number;quantity:number;soldAt:number;refunded:boolean};
export type ShopFinding={
  id:string; kind:"compare"|"emerging"|"restore"|"catalog-review";
  listingIds:number[]; title:string; imageUrl:string; label:string;
  evidence:string; direction:string; detail:string;
};

const normalize=(value:string)=>String(value||"").toLowerCase().trim().replace(/[\s_-]+/g," ");
const familyLabel=(value:string)=>normalize(value)||"unknown";
const units=(sales:DiscoverySale[],from:number,to:number)=> {
  const byId=new Map<number,number>();
  for(const sale of sales)if(!sale.refunded&&sale.soldAt>=from&&sale.soldAt<to&&sale.quantity>0)
    byId.set(sale.listingId,(byId.get(sale.listingId)??0)+sale.quantity);
  return byId;
};

/**
 * Find decisions supported by the seller's complete stored catalog and dated
 * purchases. This function never treats public competitor signals as sales.
 * Missing artwork identities stay unknown; they cannot establish a gap.
 */
export function discoverShopFindings(
  purchase:PurchasePriorityMap,listings:DiscoveryListing[],sales:DiscoverySale[],now:number,
):ShopFinding[]{
  const out:ShopFinding[]=[];
  const end=now+1;
  const recent=units(sales,now-30*86400,end);
  const prior=units(sales,now-60*86400,now-30*86400);
  const period=units(sales,now-purchase.days*86400,end);
  const byId=new Map(listings.map(row=>[row.listingId,row]));
  const priorityIds=new Set(purchase.priorities.map(row=>row.listingId));
  const groups=new Map<string,DiscoveryListing[]>();
  for(const row of listings)if(row.artworkHash){
    const held=groups.get(row.artworkHash)??[];
    held.push(row);groups.set(row.artworkHash,held);
  }

  for(const [hash,group] of groups){
    if(group.length<2)continue;
    const ordered=[...group].sort((a,b)=>(period.get(b.listingId)??0)-(period.get(a.listingId)??0));
    const source=ordered[0],sourceUnits=period.get(source.listingId)??0;
    if(sourceUnits<2)continue;
    const peer=ordered.find(row=>row.listingId!==source.listingId&&row.state==="active");
    if(!peer)continue;
    const peerUnits=period.get(peer.listingId)??0;
    const differentFormat=familyLabel(source.productFamily)!==familyLabel(peer.productFamily);
    out.push({
      id:`existing-${hash}`,kind:"compare",listingIds:[source.listingId,peer.listingId],
      title:source.title,imageUrl:source.imageUrl,label:differentFormat?"EXISTING FORMAT":"RELATED LISTING",
      evidence:`${sourceUnits} purchased on ${familyLabel(source.productFamily)}; ${peerUnits} on the existing ${familyLabel(peer.productFamily)} in the last ${purchase.days} days.`,
      direction:peerUnits===0?"Review the existing version before creating another.":"Compare the two versions before expanding.",
      detail:"The artwork identity is linked in the shop catalog. Compare active dates, visits, availability, imagery, price and options before interpreting the purchase difference.",
    });
  }

  for(const winner of purchase.listings){
    const row=byId.get(winner.listingId);
    if(!row||row.state==="active")continue;
    out.push({
      id:`restore-${row.listingId}`,kind:"restore",listingIds:[row.listingId],
      title:row.title,imageUrl:row.imageUrl,label:"AVAILABILITY",
      evidence:`${winner.unitsPurchased} purchased in the last ${purchase.days} days; listing is ${row.state||"unavailable"}.`,
      direction:"Check whether this product can be restored.",
      detail:"Confirm current stock, sourcing or production. For a unique item, look for a repeatable characteristic or a feasible related piece instead of promising an identical restock.",
    });
  }

  for(const [listingId,count] of recent){
    const row=byId.get(listingId);
    if(!row||priorityIds.has(listingId)||count<3)continue;
    const before=prior.get(listingId)??0;
    if(count<before+3)continue;
    out.push({
      id:`emerging-${listingId}`,kind:"emerging",listingIds:[listingId],
      title:row.title,imageUrl:row.imageUrl,label:"EMERGING",
      evidence:`${count} purchased in the last 30 days; ${before} in the prior 30.`,
      direction:"Inspect what changed before building on it.",
      detail:"Check listing age, visits, availability and related products. This is a dated purchase change, not proof that the product will keep growing.",
    });
  }

  const active=listings.filter(row=>row.state==="active");
  const shopUnits=[...period.values()].reduce((sum,value)=>sum+value,0);
  const familyGroups=new Map<string,DiscoveryListing[]>();
  for(const row of active){
    const key=familyLabel(row.productFamily);
    if(!key||key==="unknown")continue;
    const held=familyGroups.get(key)??[];
    held.push(row);familyGroups.set(key,held);
  }
  for(const [name,group] of familyGroups){
    if(group.length<4||active.length<8||shopUnits<5)continue;
    const familyUnits=group.reduce((sum,row)=>sum+(period.get(row.listingId)??0),0);
    const catalogShare=group.length/active.length,salesShare=familyUnits/shopUnits;
    if(salesShare>=catalogShare*.4)continue;
    const representative=[...group].sort((a,b)=>(period.get(b.listingId)??0)-(period.get(a.listingId)??0))[0];
    out.push({
      id:`coverage-${name}`,kind:"catalog-review",listingIds:group.map(row=>row.listingId),
      title:name.charAt(0).toUpperCase()+name.slice(1),imageUrl:representative.imageUrl,label:"CATALOG BALANCE",
      evidence:`${group.length} of ${active.length} active listings; ${familyUnits} of ${shopUnits} purchased units in the last ${purchase.days} days.`,
      direction:"Compare exposure before adding more.",
      detail:"The catalog share exceeds the purchase share. Check listing ages, visits, stock and which individual products drove the response before deciding whether this area is weak.",
    });
  }
  const rank={compare:0,restore:1,emerging:2,"catalog-review":3};
  return out.sort((a,b)=>rank[a.kind]-rank[b.kind]||a.title.localeCompare(b.title));
}
