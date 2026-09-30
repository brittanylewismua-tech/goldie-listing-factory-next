import type { AttentionMap } from "./shop-map-attention";
import { productFamily } from "./product-type-utils";

export type TrackedMarketListing = {
  listingId:number;
  title:string;
  sold7?:number;
  sold30?:number;
  state?:string;
  etsyUrl?:string;
};

export type TrackedMarketWatch = {
  key:string;
  phrase:string;
  terms?:string[];
  summary?:{moving?:number;repeated?:number;shops?:number};
  listings:TrackedMarketListing[];
};

export type MarketProductEvidence = {
  family:string;
  listings:number;
  sold30:number;
};

export type MarketCorroboration = {
  worldId:string;
  keywordKey:string;
  phrase:string;
  moving:number;
  repeated:number;
  shops:number;
  sellingListings:number;
  observedSold30:number;
  productFamilies:MarketProductEvidence[];
  missingProductFamilies:MarketProductEvidence[];
  listingIds:number[];
};

const STOP=new Set([
  "the","and","for","with","this","that","from","your","you","our","their","a","an","of","to","in","on",
  "shirt","shirts","tee","tees","tshirt","tshirts","sweatshirt","sweatshirts","hoodie","hoodies",
  "crewneck","crewnecks","mug","mugs","sticker","stickers","tote","totes","bag","bags","gift","gifts",
  "women","womens","men","mens","unisex","graphic","design","designs","cute","funny","vintage","retro"
]);

const words=(value:string)=>[...new Set(String(value||"").toLocaleLowerCase()
  .replace(/[^a-z0-9' ]+/g," ").split(/\s+/)
  .filter(word=>word.length>=3&&!STOP.has(word)))];

const overlap=(left:string[],right:string[])=>{
  const held=new Set(right);
  return left.filter(word=>held.has(word)).length;
};

function watchMatchesWorld(
  world:{worldId:string;label:string},
  watch:TrackedMarketWatch,
  listingTitles:string[],
){
  const worldWords=words(world.label);
  const watchWords=words([watch.phrase,...(watch.terms??[])].join(" "));
  const direct=overlap(worldWords,watchWords);
  if(worldWords.length===1&&direct===1)return true;
  if(worldWords.length>=2&&direct>=Math.min(2,worldWords.length))return true;
  return listingTitles.some(title=>overlap(words(title),watchWords)>=2);
}

export function corroborateAttentionWithMarket(
  attention:AttentionMap,
  watches:TrackedMarketWatch[],
  ownFamiliesByWorld:Map<string,string[]>,
):MarketCorroboration[]{
  const titlesByWorld=new Map<string,string[]>();
  for(const listing of attention.listings){
    if(!listing.worldId)continue;
    titlesByWorld.set(listing.worldId,[...(titlesByWorld.get(listing.worldId)??[]),listing.title]);
  }

  const out:MarketCorroboration[]=[];
  for(const world of attention.worlds.filter(row=>row.signal>0)){
    const ownFamilies=new Set(ownFamiliesByWorld.get(world.worldId)??[]);
    const candidates=watches.filter(watch=>
      watchMatchesWorld(world,watch,titlesByWorld.get(world.worldId)??[]));

    const evidence=candidates.map(watch=>{
      const selling=watch.listings.filter(row=>Number(row.sold30??0)>0);
      const byFamily=new Map<string,{listings:number;sold30:number}>();
      for(const listing of selling){
        const family=productFamily(listing.title);
        if(!family)continue;
        const held=byFamily.get(family)??{listings:0,sold30:0};
        held.listings+=1;
        held.sold30+=Math.max(0,Number(listing.sold30??0));
        byFamily.set(family,held);
      }
      const productFamilies=[...byFamily.entries()]
        .map(([family,value])=>({family,...value}))
        .sort((a,b)=>b.sold30-a.sold30||b.listings-a.listings||a.family.localeCompare(b.family));
      return {
        worldId:world.worldId,keywordKey:watch.key,phrase:watch.phrase,
        moving:Math.max(0,Number(watch.summary?.moving??0)),
        repeated:Math.max(0,Number(watch.summary?.repeated??0)),
        shops:Math.max(0,Number(watch.summary?.shops??0)),
        sellingListings:selling.length,
        observedSold30:selling.reduce((sum,row)=>sum+Math.max(0,Number(row.sold30??0)),0),
        productFamilies,
        missingProductFamilies:productFamilies.filter(row=>!ownFamilies.has(row.family)),
        listingIds:selling.slice(0,6).map(row=>row.listingId),
      };
    }).filter(row=>row.sellingListings>0||row.moving>0)
      .sort((a,b)=>b.observedSold30-a.observedSold30||b.moving-a.moving||b.repeated-a.repeated);

    if(evidence[0])out.push(evidence[0]);
  }
  return out;
}
