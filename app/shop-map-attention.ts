/**
 * THE ATTENTION ENGINE.
 *
 * Goldie's core operating rule is simple: seller attention should follow
 * customer attention. We do not blend weak signals into strong ones.
 *
 * Evidence ladder:
 *   1. Units sold in the last 90 days.
 *   2. Lifetime units sold when the recent window is empty.
 *   3. Etsy favorites only when the shop has never recorded a sale.
 *
 * Once a stronger signal exists, weaker signals may explain a result later,
 * but they never dilute the allocation itself.
 */

export type AttentionBasis = "sales-90" | "sales-lifetime" | "favorites" | "none";

export type AttentionListing = {
  listingId: number;
  title: string;
  imageUrl?: string;
  state: string;
  favorites: number | null;
  sales90: number;
  lifetimeSales: number;
  worldId?: string | null;
};

export type AttentionRank = {
  rank: number;
  listingId: number;
  title: string;
  imageUrl?: string;
  signal: number;
  attentionShare: number;
  attentionPercent: number;
  worldId: string | null;
};

export type AttentionWorld = {
  rank: number;
  worldId: string;
  label: string;
  signal: number;
  attentionShare: number;
  attentionPercent: number;
  activeListings: number;
  catalogShare: number;
  catalogPercent: number;
  buildGap: number;
  buildGapPoints: number;
  state: "underbuilt" | "aligned" | "overbuilt";
  recommendedNext10: number;
};

export type AttentionMap = {
  basis: AttentionBasis;
  basisLabel: string;
  totalSignal: number;
  listings: AttentionRank[];
  worlds: AttentionWorld[];
};

const share=(value:number,total:number)=>total>0?value/total:0;
const pct=(value:number)=>Math.round(value*100);
const gapState=(gap:number):AttentionWorld["state"]=>
  gap>=0.08?"underbuilt":gap<=-0.08?"overbuilt":"aligned";

export function buildAttentionMap(
  listings: AttentionListing[],
  worlds: Array<{worldId:string;label:string;activeListings:number}>,
  options:{activeListingsTotal?:number}={},
): AttentionMap {
  const recentSales=listings.reduce((sum,row)=>sum+Math.max(0,row.sales90||0),0);
  const lifetimeSales=listings.reduce((sum,row)=>sum+Math.max(0,row.lifetimeSales||0),0);
  const favorites=listings.reduce((sum,row)=>sum+Math.max(0,row.favorites??0),0);

  const basis:AttentionBasis=recentSales>0?"sales-90"
    :lifetimeSales>0?"sales-lifetime"
    :favorites>0?"favorites":"none";
  const signalOf=(row:AttentionListing)=>basis==="sales-90"?Math.max(0,row.sales90||0)
    :basis==="sales-lifetime"?Math.max(0,row.lifetimeSales||0)
    :basis==="favorites"?Math.max(0,row.favorites??0):0;
  const totalSignal=listings.reduce((sum,row)=>sum+signalOf(row),0);

  const rankedListings=listings
    .map(row=>({row,signal:signalOf(row)}))
    .filter(item=>item.signal>0)
    .sort((a,b)=>b.signal-a.signal
      || Math.max(0,b.row.favorites??0)-Math.max(0,a.row.favorites??0)
      || a.row.listingId-b.row.listingId)
    .map((item,index)=>{
      const attentionShare=share(item.signal,totalSignal);
      return {
        rank:index+1,listingId:item.row.listingId,title:item.row.title,
        imageUrl:item.row.imageUrl,signal:item.signal,attentionShare,
        attentionPercent:pct(attentionShare),worldId:item.row.worldId??null,
      };
    });

  const classifiedActiveTotal=worlds.reduce((sum,world)=>sum+Math.max(0,world.activeListings),0);
  const activeTotal=Math.max(classifiedActiveTotal,options.activeListingsTotal??0);
  const signalByWorld=new Map<string,number>();
  for(const row of listings){
    if(!row.worldId)continue;
    signalByWorld.set(row.worldId,(signalByWorld.get(row.worldId)??0)+signalOf(row));
  }

  const worldDrafts=worlds.map(world=>{
    const signal=signalByWorld.get(world.worldId)??0;
    const attentionShare=share(signal,totalSignal);
    const catalogShare=share(world.activeListings,activeTotal);
    const buildGap=attentionShare-catalogShare;
    return {
      worldId:world.worldId,label:world.label,signal,attentionShare,
      attentionPercent:pct(attentionShare),activeListings:world.activeListings,
      catalogShare,catalogPercent:pct(catalogShare),buildGap,
      buildGapPoints:Math.round(buildGap*100),state:gapState(buildGap),
    };
  }).sort((a,b)=>b.attentionShare-a.attentionShare
    || b.buildGap-a.buildGap
    || a.label.localeCompare(b.label));

  /*
    TURN THE ATTENTION SHARE INTO A REAL BUILD CYCLE.

    Independent rounding can tell a seller to build 11 things in a ten-listing
    plan. Largest-remainder allocation keeps the advice proportional while
    guaranteeing that a ten-listing cycle still contains exactly ten slots.
    Signal that belongs to unclassified listings is deliberately left
    unallocated rather than invented into a named world.
  */
  const classifiedShare=worldDrafts.reduce((sum,world)=>sum+world.attentionShare,0);
  const availableSlots=Math.max(0,Math.min(10,Math.round(classifiedShare*10)));
  const slotDrafts=worldDrafts.map((world,index)=>{
    const raw=world.attentionShare*10;
    const base=Math.floor(raw);
    return {index,base,remainder:raw-base};
  });
  let assigned=slotDrafts.reduce((sum,row)=>sum+row.base,0);
  for(const row of [...slotDrafts].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){
    if(assigned>=availableSlots)break;
    row.base+=1;assigned+=1;
  }
  const slotsByIndex=new Map(slotDrafts.map(row=>[row.index,row.base]));
  const rankedWorlds=worldDrafts
    .map((world,index)=>({...world,rank:index+1,recommendedNext10:slotsByIndex.get(index)??0}));

  return {
    basis,
    basisLabel:basis==="sales-90"?"units sold in the last 90 days"
      :basis==="sales-lifetime"?"lifetime units sold"
      :basis==="favorites"?"favorites (used because this shop has no recorded sales yet)"
      :"not enough customer response yet",
    totalSignal,
    listings:rankedListings,
    worlds:rankedWorlds,
  };
}
