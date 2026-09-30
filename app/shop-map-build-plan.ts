import type { AttentionMap } from "./shop-map-attention";

export type BuildAllocation = {
  worldId:string;
  label:string;
  rank:number;
  currentActiveListings:number;
  attentionPercent:number;
  catalogPercent:number;
  recommendedListings:number;
};

export type BuildPlan = {
  requestedListings:number;
  allocatedListings:number;
  heldBackListings:number;
  rows:BuildAllocation[];
  note:string;
};

/**
 * NEXT-BUILD ALLOCATION
 *
 * This is deliberately NOT "10 x attention share".
 *
 * The Attention Map answers where customer attention belongs.
 * The build plan answers where NEW catalog should go to close the mismatch
 * between customer response and the catalog the seller already has.
 *
 * A world that is already overbuilt receives no new slots. Underbuilt worlds
 * receive slots in proportion to their measurable catalog deficit after the
 * proposed build cycle. If some customer response belongs to unclassified
 * listings, that share is held back instead of pretending Goldie knows where
 * to put it.
 */
export function buildPlan(attention:AttentionMap,requestedListings=10):BuildPlan{
  const count=Math.max(0,Math.floor(requestedListings));
  if(!count||attention.basis==="none"||attention.totalSignal<=0)
    return {requestedListings:count,allocatedListings:0,heldBackListings:count,rows:[],
      note:"There is not enough customer response yet to allocate a build cycle."};

  const activeTotal=Math.max(0,attention.activeListingsTotal);
  const futureTotal=activeTotal+count;
  const candidates=attention.worlds
    .filter(world=>world.signal>0&&world.state!=="overbuilt")
    .map(world=>{
      const desired=world.attentionShare*futureTotal;
      const deficit=Math.max(0,desired-world.activeListings);
      return {world,deficit};
    })
    .filter(row=>row.deficit>0);

  const classifiedShare=Math.max(0,1-attention.unclassifiedAttentionShare);
  const allocatable=Math.min(count,Math.round(count*classifiedShare));

  if(!candidates.length||allocatable<=0)
    return {requestedListings:count,allocatedListings:0,heldBackListings:count,rows:[],
      note:attention.unclassifiedSignal>0
        ?"Customer response exists, but it is not classified well enough to place new listings confidently."
        :"Your proven worlds are already at or above their current share of customer attention."};

  const totalDeficit=candidates.reduce((sum,row)=>sum+row.deficit,0);
  const exact=candidates.map(row=>({
    ...row,
    exact:allocatable*(row.deficit/totalDeficit),
  }));
  const initial=exact.map(row=>({...row,recommendedListings:Math.floor(row.exact)}));
  let used=initial.reduce((sum,row)=>sum+row.recommendedListings,0);
  const byRemainder=[...initial].sort((a,b)=>(b.exact-b.recommendedListings)-(a.exact-a.recommendedListings)
    || a.world.rank-b.world.rank);
  for(const row of byRemainder){
    if(used>=allocatable)break;
    row.recommendedListings+=1;
    used+=1;
  }

  const rows=initial.filter(row=>row.recommendedListings>0)
    .sort((a,b)=>a.world.rank-b.world.rank)
    .map(row=>({
      worldId:row.world.worldId,label:row.world.label,rank:row.world.rank,
      currentActiveListings:row.world.activeListings,
      attentionPercent:row.world.attentionPercent,
      catalogPercent:row.world.catalogPercent,
      recommendedListings:row.recommendedListings,
    }));

  return {
    requestedListings:count,
    allocatedListings:used,
    heldBackListings:count-used,
    rows,
    note:used<count
      ? \`\${count-used} build \${count-used===1?"slot is":"slots are"} held back because part of the shop's customer response is not classified into a customer world yet.\`
      :"This plan puts new catalog where customer response is ahead of current catalog coverage.",
  };
}
