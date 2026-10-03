"use client";
import {shopMapSection,navigateShopMap,ENGINE_SECTIONS,SHOP_MAP_NAVIGATE,type ShopMapSection,type ShopMapNavigateDetail} from "./shop-map-navigation";
import {browseOwnListings} from "@/app/market-listing-browser";
import {designsOnOneProduct,familyLabel,shortLabel,type Reach,type ReachListing} from "@/app/design-reach";
import type {CatalogAction} from "@/app/shop-map-actions";
import type {MarketCorroboration} from "@/app/shop-map-market-corroboration";
import type {WinningPatternMap} from "@/app/shop-map-patterns";
import {ArtworkRecommendations,type ArtworkMarketProof} from "@/app/shop-map-artwork-actions";
import {ReviewThese} from "@/app/shop-map-evidence-review";
import type {WinnerDna} from "@/app/shop-map-winner-dna";
import type {PurchasePriorityMap} from "@/app/shop-map-purchase-priorities";
import type {ProductDirection} from "@/app/shop-map-product-expansion";
import type {ShopFinding} from "@/app/shop-map-opportunity-discovery";
import {OpportunityWorkspace,type OwnReviewInsight} from "./opportunity-workspace";
import OpportunityEngine,{type EngineSection} from "./opportunity-engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshShopFinances } from "@/app/refresh-shop-finances";

type Niche = {
  worldId: string; label: string; listings: number; activeListings: number;
  period: string; orders: number; units?:number;lifetimeUnits?:number;revenueMinor: number;
  lifetimeOrders: number; lifetimeRevenueMinor: number; evidence: string;
  productFamilies: Array<{ family: string; listings: number }>;
  memberListings?:Array<{listingId:number;title:string;imageUrl:string;favorites:number|null;sales:number;state:string}>;
  reviews: { recent: number; lifetimeHeld: number };
};
type Focus = { nicheId: string; label: string; headline: string; advice: string; reason: string };
export type ShopOpportunity = {
  worldId:string;label:string;rank:number;state:"underbuilt"|"aligned"|"overbuilt";
  headline:string;explanation:string;action:string;mirrorBotPrompt:string|null;
};
const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";
const SHOP_MAP_CACHE_PREFIX="goldie:shop-map:v14:";
const cacheDay=()=>new Date().toLocaleDateString("en-CA");
function readShopMapCache(key:string|null):ShopMap|null{
  if(typeof window==="undefined"||!key)return null;
  try{
    const raw=window.sessionStorage.getItem(SHOP_MAP_CACHE_PREFIX+key);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as {day?:string;data?:ShopMap};
    if(parsed.day!==cacheDay()||!parsed.data){window.sessionStorage.removeItem(SHOP_MAP_CACHE_PREFIX+key);return null;}
    return parsed.data;
  }catch{return null;}
}
function writeShopMapCache(key:string|null,data:ShopMap){
  if(typeof window==="undefined"||!key)return;
  try{window.sessionStorage.setItem(SHOP_MAP_CACHE_PREFIX+key,JSON.stringify({day:cacheDay(),data}));}catch{}
}
export type AttentionMap = {
  basis:"sales-90"|"sales-lifetime"|"favorites"|"none";
  basisLabel:string;
  totalSignal:number;
  listings:Array<{rank:number;listingId:number;title:string;imageUrl?:string;signal:number;attentionShare:number;attentionPercent:number;worldId:string|null}>;
  worlds:Array<{rank:number;worldId:string;label:string;signal:number;attentionShare:number;attentionPercent:number;
    activeListings:number;catalogShare:number;catalogPercent:number;buildGap:number;buildGapPoints:number;
    state:"underbuilt"|"aligned"|"overbuilt"}>;
};

export type NextBuildPlan = {
  requestedListings:number;
  allocatedListings:number;
  heldBackListings:number;
  rows:Array<{
    worldId:string;
    label:string;
    rank:number;
    currentActiveListings:number;
    attentionPercent:number;
    catalogPercent:number;
    recommendedListings:number;
  }>;
  note:string;
};

type ShopMap = {
  attention?: AttentionMap;
  patterns?: WinningPatternMap;
  catalogPatterns?: WinningPatternMap;
  purchasePriorities?:PurchasePriorityMap;
  productDirections?:ProductDirection[];
  opportunityFindings?:ShopFinding[];
  ownReviews?:OwnReviewInsight[];
  analysedListingIds?:number[];
  opportunities?: ShopOpportunity[];
  nextBuild?: NextBuildPlan;
  marketCorroboration?: MarketCorroboration[];
  marketProof?:ArtworkMarketProof[];
  winnerDna?:WinnerDna|null;
  catalogActions?: CatalogAction[];
  displayUnavailable?:boolean;
  topListings?: Array<{listingId:number;title:string;imageUrl:string;favorites:number|null;sales:number;revenueMinor:number}>;
  shop?: { shopId?:number; shopName: string; imageUrl?: string };
  month?: string;
  thisMonth?: { revenueMinor: number|null; productRevenueMinor?:number|null; shippingCollectedMinor?:number|null;
    discountsMinor?:number|null; marketplaceTaxMinor?:number|null; etsyFeesMinor: number|null;
    etsyTransactionFeesMinor?:number|null; etsyProcessingFeesMinor?:number|null; etsyListingFeesMinor?:number|null;
    etsyAdvertisingFeesMinor?:number|null; etsyOtherFeesMinor?:number|null;
    productionCostMinor: number|null; productionProductCostMinor?:number|null; productionShippingMinor?:number|null;
    refundsMinor?:number|null;adjustmentsMinor?:number|null; profitMarginPercent?:number|null;
    currency?:string; headline: string; profitMinor: number | null; accuracy: string; orders: number;
    salesAsOf?: number; salesStale?: boolean; freshness?: string;
    /* What this month's figures may be called. An estimate must never be
       able to read as a verified figure, so the distinction is structural
       rather than a word inside `headline`. */
    label?: "verified" | "estimated" | "unavailable";
    coverage?: { verified: number; estimated: number; unavailable: number } };
  standout?: { hasStandout: boolean; headline: string; nextStep: string };
  whereToFocus?: Focus[];
  /*
    Plain sentences about how the niches were organised, written on the
    server. This page never sees the wording they were built from.
  */
  grouping?: {
    found?: number;
    shown?: number;
    notes?: Array<{ kind: "grouped" | "left-out"; sentence: string }>;
  };
  worlds?: Niche[];
  unclassifiedCard?: Niche;
  worldsPeriod?: string;
  directionBasis?: string;
  directionCaveat?: string;
  coverage?: { activeListings: number; recentRevenue: number; recentOrders: number };
  unclassifiedPerformance?: { listings: number; activeListings: number; orders: number;
    revenueMinor: number; reviews: number; ordersLast90: number; revenueLast90Minor: number };
  needsAttention?: { overbuiltWorlds: Array<{ label: string; reason: string }> };
  shopTotals?: { listings: number; activeListings?:number; orders: number; ordersLast90?:number; revenueLast90Minor?:number };
  soldListings?: { period: string; days?:number; listings: Array<{ listingId: number; title: string;
    imageUrl: string; favorites: number; sales: number; revenueMinor: number }> };
  timezoneNeeded?: boolean;
  error?: string;
};

function validShopMapForTab(data:ShopMap|null,tab:ShopMapSection){
  if(!data||data.error)return false;
  if(tab==="overview")return Boolean(data.purchasePriorities)
    &&Array.isArray(data.purchasePriorities.priorities);
  if(tab==="sold")return Boolean(data.soldListings)&&Array.isArray(data.soldListings?.listings);
  if(tab==="themes")return Array.isArray(data.worlds);
  return Boolean(data.thisMonth)||data.timezoneNeeded===true;
}

// Cached estimates must never be presented as a complete profit figure.
function monthBasis(month: { label?: string;
  coverage?: { estimated: number; unavailable: number } } | undefined) {
  return month?.label === "verified" ? "verified" : "unavailable";
}

const money = (minor: number | null | undefined,currency="USD") =>
  minor === null || minor === undefined ? "—" : new Intl.NumberFormat(undefined,{style:"currency",currency}).format(minor/100);


/*
  D1792 · SOLD, AND ON ONLY ONE PRODUCT.

  Shop Map could say what sold and never what to do about it, which is the
  difference between a report and a tool. A design that has already proven
  itself on one blank is the clearest revenue action a print-on-demand seller
  has: the artwork is drawn, the market has answered, and the second product
  is an afternoon against a question that is already settled.
*/
function DesignReach(){
  const [rows,setRows]=useState<Reach[]>([]);
  const [read,setRead]=useState(false);
  useEffect(()=>{void fetch("/api/shop-map/my-listings")
    .then(response=>response.ok?response.json() as Promise<{listings?:ReachListing[]}>:null)
    .then(body=>{setRows(designsOnOneProduct(body?.listings??[]).slice(0,8));setRead(true)})
    .catch(()=>setRead(true))},[]);
  if(!read||!rows.length)return null;
  return <section className="cc-tool shop-map-reach">
    <h2>Proven designs to expand</h2>

    <ul>{rows.map(row=><li key={row.key}>
      {row.imageUrl?<img src={row.imageUrl} alt="" width={72} height={72} loading="lazy"/>:<span aria-hidden="true"/>}
      <span className="shop-map-reach-copy">
        <b>{shortLabel(row.title)}</b>
        <small>{row.sold90} sold in 90 days · {familyLabel(row.families[0])}</small>
      </span>
      <a href={`https://www.etsy.com/listing/${row.listingId}`} target="_blank" rel="noopener noreferrer">
        See it on Etsy ↗</a>
    </li>)}</ul>
  </section>;
}

/*
  D1810 · THE RULE LABELS THE GROUP; THE ROW CARRIES ITS OWN FIGURE.

  Every row repeated the rule that put it there, so the panel read as one
  sentence printed six times. The rule is a heading now, and each row shows
  the number that is true of that listing alone.
*/
function CatalogReview({actions,shopId}:{actions:CatalogAction[];shopId?:number}){
  if(!actions.length)return null;
  const groups:Array<{headline:string;rows:CatalogAction[]}>=[];
  for(const action of actions){
    const last=groups[groups.length-1];
    if(last&&last.headline===action.headline)last.rows.push(action);
    else groups.push({headline:action.headline,rows:[action]});
  }
  return <section className="cc-tool shop-map-review"><h2>Review these</h2>
    {groups.map(group=><div key={group.headline} className="shop-map-review-group">
      <h3>{group.headline}</h3>
      {group.rows.map(action=><details key={action.listingId} className="shop-map-review-row">
        <summary><b>{shortLabel(action.title)}</b><span>{action.fact}</span></summary>
        <div className="shop-map-review-body">
          <p>{action.evidence}</p><p>{action.nextStep}</p>
          <a href={`https://www.etsy.com/listing/${action.listingId}`} target="_blank" rel="noopener noreferrer">Check this listing on Etsy ↗</a>

        </div>
      </details>)}
    </div>)}
  </section>;
}


export function WinningPatterns({map}:{map:WinningPatternMap}){
  const patterns=map.patterns.slice(0,4);
  const products=map.listings.slice(0,5);
  return <section className="oe-support">
    <div className="oe-section-heading"><h2>What customers are choosing</h2><small>{map.basis==="sales-90"?"Last 90 days":map.basisLabel}</small></div>
    {patterns.length?<div className="oe-pattern-list">{patterns.map(pattern=><div key={pattern.key} className="oe-pattern">
      <b>{pattern.label}</b>
      <div className="oe-pattern-metrics">
        <span aria-label={pattern.customerPercent+"% of "+map.basisLabel}>
          <strong>{pattern.customerPercent}%</strong><small>{map.basis==="sales-90"?"sales":map.basis==="sales-lifetime"?"lifetime sales":"favorites"}</small>
        </span>
        <span aria-label={pattern.catalogPercent+"% of active analyzed designs"}>
          <strong>{pattern.catalogPercent}%</strong><small>active designs</small>
        </span>
      </div>
    </div>)}</div>:<p className="oe-quiet-state">No shared pattern in the available analysis.</p>}
    {products.length?<details className="oe-source-gallery"><summary>See the listings</summary>
      <div>{products.map(listing=><a key={listing.listingId} href={"https://www.etsy.com/listing/"+listing.listingId}
        target="_blank" rel="noopener noreferrer">
        {listing.imageUrl?<img src={listing.imageUrl} alt="" width={88} height={88} loading="lazy"/>:
          <span>Image unavailable</span>}
        <b>{shortLabel(listing.title)}</b>
        <small>{listing.signal} {map.basis==="favorites"?"favorites":"units"}</small>
      </a>)}</div>
    </details>:null}
  </section>;
}

export function AttentionEngine({attention}:{attention:AttentionMap}){
  const worlds=attention.worlds.filter(world=>world.signal>0).slice(0,5);
  const lead=worlds[0];
  const listings=attention.listings.slice(0,5);
  const worldLabel=new Map(attention.worlds.map(world=>[world.worldId,world.label]));
  if(!lead&&!listings.length)return null;
  const gapCopy=(world:AttentionMap["worlds"][number])=>world.state==="underbuilt"
    ? `Customers are giving this theme ${world.attentionPercent}% of your strongest signal, while it is only ${world.catalogPercent}% of your active catalog. You have not built around the demand as deeply as customers have rewarded it.`
    :world.state==="overbuilt"
      ? `This theme gets ${world.attentionPercent}% of customer attention but already occupies ${world.catalogPercent}% of your active catalog. Do not give it more of your time than the response it is earning.`
      :`Customer attention and catalog attention are close here. Keep giving it its share without taking time from stronger priorities.`;
  const moveCopy=(world:AttentionMap["worlds"][number])=>world.state==="underbuilt"
    ? "Make this your first design-and-list priority. Build deeper here before moving on to weaker ideas."
    :world.state==="overbuilt"
      ? "Maintain what is already working here, but stop expanding this theme until customer response catches up."
      : "Keep building here in proportion to the response it is earning.";
  return <section className="shop-map-attention">
    <div className="shop-map-attention-head">
      <div><p className="mini-label">ATTENTION MAP</p><h2>Put your attention where customers already put theirs.</h2>
        <p>Goldie ranks what is working, then compares that response with how much of your catalog you have actually built around it.</p></div>
      <span>Based on {attention.basisLabel}</span>
    </div>

    {lead&&<article className="shop-map-attention-lead">
      <div className="shop-map-attention-lead-copy">
        <p className="mini-label">YOUR #1 PRIORITY</p>
        <div className="shop-map-attention-lead-title"><span>01</span><h3>{lead.label}</h3></div>
        <strong>{lead.attentionPercent}% of customer attention</strong>
        <p>{gapCopy(lead)}</p>
        <p className="shop-map-attention-directive"><b>What to do:</b> {moveCopy(lead)}</p>
      </div>
      <div className="shop-map-attention-compare" aria-label="Customer attention compared with catalog attention">
        <div><span>Customer attention</span><b>{lead.attentionPercent}%</b>
          <i><em style={{width:`${Math.max(2,lead.attentionPercent)}%`}}/></i></div>
        <div><span>Catalog attention</span><b>{lead.catalogPercent}%</b>
          <i><em style={{width:`${Math.max(2,lead.catalogPercent)}%`}}/></i></div>
        <small>{lead.buildGapPoints>0?`+${lead.buildGapPoints}`:lead.buildGapPoints} point build gap</small>
      </div>
    </article>}

    {worlds.length>1&&<div className="shop-map-attention-priorities">
      <div className="shop-map-attention-priorities-head"><p className="mini-label">THEN FOLLOW THE RANKING</p>
        <h3>Your next priorities, in order</h3></div>
      <div className="shop-map-attention-list">
        {worlds.slice(1).map(world=><article key={world.worldId}>
          <div className="shop-map-attention-row">
            <span className="shop-map-attention-rank">0{world.rank}</span>
            <div className="shop-map-attention-name"><b>{world.label}</b>
              <small>{world.attentionPercent}% customer attention · {world.catalogPercent}% of active designs</small></div>
            <em className={`attention-state ${world.state}`}>{world.state==="underbuilt"
              ?`+${world.buildGapPoints} pt gap`:world.state==="overbuilt"
                ?`${world.buildGapPoints} pt gap`:"in line"}</em>
          </div>
          <div className="shop-map-attention-mini-compare" aria-label={`${world.attentionPercent}% customer attention compared with ${world.catalogPercent}% catalog attention`}>
            <div><small>Customer</small><i><em style={{width:`${Math.max(2,world.attentionPercent)}%`}}/></i></div>
            <div className="catalog"><small>Catalog</small><i><em style={{width:`${Math.max(2,world.catalogPercent)}%`}}/></i></div>
          </div>
        </article>)}
      </div>
    </div>}

    {!!listings.length&&<div className="shop-map-attention-listings">
      <div><p className="mini-label">STRONGEST LISTINGS</p><h3>The listings creating that customer response</h3>
        <p>These are the individual listings currently filling the ranking above.</p></div>
      <ol>{listings.map(listing=><li key={listing.listingId}>
        <span>0{listing.rank}</span>
        {listing.imageUrl?<img src={listing.imageUrl} alt="" width={52} height={52} loading="lazy"/>:<i aria-hidden="true"/>}
        <div><b>{shortLabel(listing.title)}</b>
          {listing.worldId&&worldLabel.get(listing.worldId)?<small>{worldLabel.get(listing.worldId)}</small>:null}</div>
        <strong>{listing.attentionPercent}%</strong>
      </li>)}</ol>
    </div>}
  </section>;
}


export function NextBuildAllocation({plan}:{plan:NextBuildPlan}){
  if(!plan.rows.length)return null;
  return <section className="shop-map-next-build">
    <div className="shop-map-section-head">
      <div><p className="mini-label">WHERE TO BUILD NEXT</p>
        <h2>Your next design-and-list priorities start here.</h2>
        <p>Customers have already shown you where their attention is going. Follow that signal in this order.</p></div>
    </div>
    <div className="shop-map-next-build-grid">
      {plan.rows.map((row,index)=><article key={row.worldId}>
        <div className="shop-map-next-build-count">{String(index+1).padStart(2,"0")}</div>
        <div className="shop-map-next-build-copy">
          <div><span>{index===0?"FIRST PRIORITY":"NEXT PRIORITY"}</span><b>{row.label}</b></div>
          <p>{row.attentionPercent}% customer attention · {row.catalogPercent}% of active designs</p>
        </div>
      </article>)}
    </div>
    <p className="shop-map-next-build-note">Priority follows the gap between customer attention and how much of your catalog you have already built around it.</p>
  </section>;
}

export function OpportunityRecommendations(
  {rows,marketEvidence=[]}:{rows:ShopOpportunity[];marketEvidence?:MarketCorroboration[]},
){
  const [copied,setCopied]=useState("");
  const visible=rows.filter(row=>row.state!=="aligned").slice(0,4);
  const marketByWorld=new Map(marketEvidence.map(row=>[row.worldId,row]));
  if(!visible.length)return null;
  const copyPrompt=async(row:ShopOpportunity)=>{
    if(!row.mirrorBotPrompt)return;
    try{
      await navigator.clipboard.writeText(row.mirrorBotPrompt);
      setCopied(row.worldId);
      window.setTimeout(()=>setCopied(current=>current===row.worldId?"":current),1600);
    }catch{}
  };
  return <section className="shop-map-recommendations">
    <div className="shop-map-section-head">
      <div><p className="mini-label">WHAT TO DO NEXT</p><h2>Turn the ranking into action</h2>
        <p>These recommendations follow the customer response already happening in your shop.</p></div>
    </div>
    <div className="shop-map-recommendation-list">
      {visible.map(row=>{const proof=row.state==="underbuilt"?marketByWorld.get(row.worldId):undefined;return <article key={row.worldId} className={`shop-map-recommendation ${row.state}`}>
        <div className="shop-map-recommendation-rank">0{row.rank}</div>
        <div className="shop-map-recommendation-copy">
          <div className="shop-map-recommendation-label"><span>{row.label}</span>
            <em>{row.state==="underbuilt"?"BUILD DEEPER":"PAUSE EXPANSION"}</em></div>
          <h3>{row.headline}</h3>
          <p>{row.explanation}</p>
          <strong>{row.action}</strong>
          {proof&&<div className="shop-map-market-proof">
            <div><span>MARKET RADAR SUPPORT</span>
              <a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(proof.phrase)}`}>Open tracked keyword →</a></div>
            <p>{proof.sellingListings>0
              ? `Across “${proof.phrase},” ${proof.sellingListings} tracked listings recorded ${proof.observedSold30} observed units sold in the last 30 days.`
              : `Across “${proof.phrase},” ${proof.moving} tracked listings are showing selling movement.`}</p>
            {!!proof.missingProductFamilies.length&&<p><b>Product expansion to look at:</b>{" "}
              {proof.missingProductFamilies.slice(0,2).map(item=>familyLabel(item.family)).join(" and ")}
              {" "}are showing observed sales in this tracked market but are not currently represented in your {row.label} catalog.</p>}
          </div>}
          {row.mirrorBotPrompt&&<details className="shop-map-mirrorbot">
            <summary>Go deeper with MirrorBot</summary>
            <div>
              <p>{row.mirrorBotPrompt}</p>
              <div className="shop-map-mirrorbot-actions">
                <button type="button" onClick={()=>void copyPrompt(row)}>{copied===row.worldId?"Copied":"Copy prompt"}</button>
                <a href={MIRRORBOT_URL} target="_blank" rel="noreferrer">Open MirrorBot ↗</a>
              </div>
            </div>
          </details>}
        </div>
      </article>})}
    </div>
  </section>;
}

export default function ShopMapClient({ signedInEmail,cacheScope,activeShopId,engine="workspace" }: {
  signedInEmail?: string;cacheScope:string|null;activeShopId:number|null;
  /* "top-ten" is the rebuilt Opportunity Engine, shown to the owner first. */
  engine?:"workspace"|"top-ten";
}) {
  const [map, setMap] = useState<ShopMap | null>(null);
  const [mapKey,setMapKey]=useState("");
  const [open, setOpen] = useState("");
  const [themeQuery,setThemeQuery]=useState("");
  const [themeState,setThemeState]=useState("all");
  const [themeSort,setThemeSort]=useState<"sales"|"favorites">("sales");
  const [soldSort,setSoldSort]=useState<"sales"|"revenue">("sales");
  const [soldQuery,setSoldQuery]=useState("");
  const [busy, setBusy] = useState("");
  /* The last map that loaded. A failed refresh shows this rather than nothing. */
  const [lastGood, setLastGood] = useState<ShopMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<ShopMapSection>("overview");
  /* Build opens on the listing chosen on Votes ("Build on this"). */
  const [engineListing,setEngineListing]=useState<number|null>(null);
  const topTen=engine==="top-ten";
  /* Build and Track exist only in the rebuilt engine. */
  const sectionFor=(value:string|null):ShopMapSection=>{const next=shopMapSection(value);return !topTen&&(next==="build"||next==="track")?"overview":next};

  const [soldDays,setSoldDays]=useState(90);
  const [selectedDays,setSelectedDays]=useState<30|90>(90);
  const [selectedMonth,setSelectedMonth]=useState("");
  const viewKey=()=>{
    const params=new URLSearchParams({view:tab==="overview"?"overview-purchases":tab});
    if(tab==="overview")params.set("days",String(selectedDays));
    if(tab==="sold")params.set("days",String(soldDays));
    if(tab==="money"&&selectedMonth)params.set("month",selectedMonth);
    return params.toString();
  };
  const selectTab=(next:ShopMapSection)=>{
    setFailed(false);
    setTab(next);
    setEngineListing(null);
    const url=new URL(window.location.href);url.searchParams.set("tab",next);
    window.history.replaceState(window.history.state,"",url);
  };
  /* The rail's Your Shop links switch the section in place; Back and Forward
     walk through the sections the seller visited. */
  useEffect(()=>{
    const fromUrl=()=>{const params=new URLSearchParams(window.location.search);setFailed(false);setTab(sectionFor(params.get("tab")));
      const listing=Number(params.get("listing"));setEngineListing(Number.isFinite(listing)&&listing>0?listing:null)};
    const onNavigate=(event:Event)=>{const detail=(event as CustomEvent<ShopMapNavigateDetail>).detail;setFailed(false);
      setTab(sectionFor(detail.tab));setEngineListing(detail.listing??null);window.scrollTo({top:0})};
    window.addEventListener("popstate",fromUrl);window.addEventListener(SHOP_MAP_NAVIGATE,onNavigate);
    return ()=>{window.removeEventListener("popstate",fromUrl);window.removeEventListener(SHOP_MAP_NAVIGATE,onNavigate)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setTab(sectionFor(params.get("tab")));
    const listing=Number(params.get("listing"));if(Number.isFinite(listing)&&listing>0)setEngineListing(listing);const month=params.get("month")??"";if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month))setSelectedMonth(month)},[]);
  const [refreshing,setRefreshing]=useState(false);
  const [syncingMoney,setSyncingMoney]=useState(false);
  const [moneyRefreshError,setMoneyRefreshError]=useState("");
  const [insightsLoading,setInsightsLoading]=useState(false);
  const [insightsFailed,setInsightsFailed]=useState(false);
  const requestSequence=useRef(0);
  const load = useCallback(async () => {
    const sequence=++requestSequence.current;
    /* The rebuilt engine loads its own data; the old overview payload is not needed. */
    if(topTen&&ENGINE_SECTIONS.has(tab)){setRefreshing(false);return}
    const params=new URLSearchParams({view:tab==="overview"?"overview-purchases":tab});
    if(tab==="overview")params.set("days",String(selectedDays));
    if(tab==="sold")params.set("days",String(soldDays));
    if(tab==="money"&&selectedMonth)params.set("month",selectedMonth);
    const cacheKey=params.toString();
    const storageKey=cacheScope?`${cacheScope}:${cacheKey}`:null;
    const cached=readShopMapCache(storageKey);
    const hasCached=Boolean(cached&&cached.shop?.shopId===activeShopId&&validShopMapForTab(cached,tab));
    setMapKey(cacheKey);
    if(hasCached){
      setMap(cached);setLastGood(cached);setFailed(false);setRefreshing(false);
    }else{
      setMap(null);
      setRefreshing(true);
    }
    const next = await fetch(`/api/shop-map/map?${params.toString()}`)
      .then(response => response.ok ? response.json() as Promise<ShopMap> : null)
      .catch(() => null);
    if(sequence!==requestSequence.current)return;
    setRefreshing(false);
    if (!validShopMapForTab(next,tab)
      ||(activeShopId&&next?.shop?.shopId&&next.shop.shopId!==activeShopId)) {
      if(!hasCached)setMap(null);
      setFailed(true);
      return;
    }
    setFailed(false);
    setMapKey(cacheKey);
    setMap(next);
    setLastGood(next);
    writeShopMapCache(storageKey,next);
    if(tab==="overview"){
      setInsightsLoading(true);
      setInsightsFailed(false);
      void fetch("/api/shop-map/map?view=overview-support")
        .then(response=>response.ok?response.json() as Promise<ShopMap>:null)
        .then(detail=>{
          if(sequence!==requestSequence.current||!detail||detail.error
            ||(activeShopId&&detail.shop?.shopId&&detail.shop.shopId!==activeShopId))return;
          setMap(current=>{if(!current)return current;
            const merged={...current,...detail};writeShopMapCache(storageKey,merged);return merged;});
          setLastGood(current=>current?{...current,...detail}:detail);
        }).catch(()=>undefined);
      {
        void fetch(`/api/shop-map/map?view=overview-insights&days=${selectedDays}`)
          .then(response=>response.ok?response.json() as Promise<ShopMap>:null)
          .then(detail=>{
            if(sequence!==requestSequence.current)return;
            if(!detail||detail.error||!Array.isArray(detail.productDirections)
              ||(activeShopId&&detail.shop?.shopId&&detail.shop.shopId!==activeShopId)){setInsightsFailed(true);return}
            setMap(current=>{if(!current)return current;
              const merged={...current,...detail};writeShopMapCache(storageKey,merged);return merged;});
            setLastGood(current=>current?{...current,...detail}:detail);
            const artworkPatterns=selectedDays===90?(detail.patterns?.patterns??[]):[];
            if(!artworkPatterns.length)return;
            const marketParams=new URLSearchParams({view:"overview-market"});
            for(const pattern of artworkPatterns.slice(0,5))marketParams.append("pattern",pattern.key);
            void fetch(`/api/shop-map/map?${marketParams.toString()}`)
              .then(response=>response.ok?response.json() as Promise<ShopMap>:null)
              .then(market=>{
                if(sequence!==requestSequence.current||!market||!Array.isArray(market.marketProof)
                  ||(activeShopId&&market.shop?.shopId&&market.shop.shopId!==activeShopId))return;
                setMap(current=>{if(!current)return current;
                  const merged={...current,marketProof:market.marketProof};
                  writeShopMapCache(storageKey,merged);return merged;
                });
              }).catch(()=>undefined);
          }).catch(()=>{if(sequence===requestSequence.current)setInsightsFailed(true)})
          .finally(()=>{if(sequence===requestSequence.current)setInsightsLoading(false)});
      }
    } else setInsightsLoading(false);
  },[tab,soldDays,selectedDays,selectedMonth,cacheScope,activeShopId,topTen]);
  useEffect(() => { void load(); }, [load]);

  const refreshMoney = async () => {
    if (syncingMoney) return;
    setSyncingMoney(true);
    setMoneyRefreshError("");
    try {
      await refreshShopFinances();
    } catch (error) {
      setMoneyRefreshError(error instanceof Error ? error.message : "Your numbers could not be refreshed. Try again.");
    } finally {
      await load();
      setSyncingMoney(false);
    }
  };

  /*
    The browser knows where the member is; Shop Map asks rather than assumes.
    A timezone is stored for THIS member's THIS shop only, and only once they
    say yes - month boundaries move real money between months.
  */
  const detected = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  const confirmTimezone = async () => {
    setBusy("timezone");
    await fetch(`/api/shop-map/financial/settings?timezone=${encodeURIComponent(detected)}`
      + `&detected=${encodeURIComponent(detected)}`).catch(() => undefined);
    await load();
    setBusy("");
  };

  /*
    A CORRECTION THAT FAILED MUST NOT LOOK LIKE ONE THAT WORKED.

    This swallowed every failure and reloaded the map, so a member who moved a
    listing into the wrong niche and was refused saw the listing sitting
    exactly where it had been, with no error — indistinguishable from a move
    that had been saved and then correctly shown. Correcting a classification
    is the one thing on this page a member does TO their data, so it is the
    one place silence is least affordable.
  */
  const [correctionFailed, setCorrectionFailed] = useState("");

  const moveListing = async (listingId: number, nicheId: string) => {
    setBusy(`move:${listingId}`);
    setCorrectionFailed("");
    try {
      const response = await fetch("/api/shop-map/correct", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move-listing", listingId,
          worldIds: nicheId === "unclassified" ? [] : [nicheId] }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setCorrectionFailed(body.error
          ?? "That change could not be saved. The listing is where it was.");
      }
    } catch {
      setCorrectionFailed("That change could not be saved. The listing is where it was.");
    }
    await load();
    setBusy("");
  };

  const clearCorrection = async (listingId: number) => {
    setBusy(`clear:${listingId}`);
    setCorrectionFailed("");
    try {
      const response = await fetch("/api/shop-map/correct", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-correction", listingId }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setCorrectionFailed(body.error
          ?? "That correction could not be cleared. It is still in place.");
      }
    } catch {
      setCorrectionFailed("That correction could not be cleared. It is still in place.");
    }
    await load();
    setBusy("");
  };

  const currentKey=viewKey();
  const shown = mapKey===currentKey ? map : null;
  const panelLoading=!shown&&!failed;
  const periodControl=tab==="overview"?<div className="shop-map-analysis-period oe-site-period" role="group" aria-label="Analysis period">
    {([30,90] as const).map(days=><button key={days} type="button" aria-pressed={selectedDays===days}
      onClick={()=>setSelectedDays(days)}>Last {days} days</button>)}
  </div>:null;

  if(topTen&&ENGINE_SECTIONS.has(tab))
    return <main className="shop-map shop-map-redesign oe-bleed">
      <OpportunityEngine days={selectedDays} onDays={setSelectedDays} section={tab as EngineSection} listingId={engineListing}
        onSection={(next,listing=null)=>{if(!navigateShopMap(next,listing)){setTab(next);setEngineListing(listing)}}}/>
    </main>;
  if (!shown && failed)
    return <main className="shop-map shop-map-redesign">
      <header className="shop-map-head current-page-heading"><div>
        <p className="current-kicker">MY SHOP</p><h1>{tab==="overview"?"Opportunity Engine":"My Shop"}</h1>
      </div>{periodControl}</header>
      {/* The rebuilt engine moves these into the rail under Your shop. */}
      {!topTen&&<nav className="shop-map-tabs" aria-label="Your shop sections">
        {([['overview','Opportunity Engine'],['money','Your numbers'],['themes','Product themes'],['sold','Sold listings']] as const)
          .map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined}
            onClick={()=>selectTab(key)}>{label}</button>)}
      </nav>}
      <section className="shop-map-state" role="alert">
        <p>This section could not load.</p>
        <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button>
      </section>
    </main>;
  if (!shown)
    return <main className="shop-map shop-map-redesign">
      <header className="shop-map-head current-page-heading"><div>
        <p className="current-kicker">MY SHOP</p>
        <h1>{tab==="overview"?"Opportunity Engine":"My Shop"}</h1>
        <p>Loading your connected shop and latest performance…</p>
      </div>{periodControl}</header>
      {/* The rebuilt engine moves these into the rail under Your shop. */}
      {!topTen&&<nav className="shop-map-tabs" aria-label="Your shop sections">
        {([['overview','Opportunity Engine'],['money','Your numbers'],['themes','Product themes'],['sold','Sold listings']] as const)
          .map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined}
            onClick={()=>selectTab(key)}>{label}</button>)}
      </nav>}
      <section className="shop-map-progressive-loading" role="status">
        <span className="shop-map-loader-dot" aria-hidden="true"/>
        <div><strong>Loading your shop data…</strong>
        <p>The page is ready. Etsy totals and product performance are filling in now.</p></div>
      </section>
      <div className="shop-map-loading-grid" aria-hidden="true">
        <div className="p-skeleton p-skeleton-card"/><div className="p-skeleton p-skeleton-card"/>
        <div className="p-skeleton p-skeleton-card"/>
      </div>
    </main>;

  const month = shown.thisMonth;
  const sold = shown.soldListings?.listings ?? [];
  const themes = [...(shown.worlds ?? [])];
  const unclassifiedTheme = shown.unclassifiedCard?.listings ? shown.unclassifiedCard : null;
  const niches = unclassifiedTheme ? [...themes,unclassifiedTheme] : themes;
  const recentTotal = niches.reduce((sum, niche) => sum + niche.revenueMinor, 0);
  return <main className="shop-map shop-map-redesign">
    <header className="shop-map-head current-page-heading"><div><p className="current-kicker">MY SHOP</p><h1>{tab==="overview"?"Opportunity Engine":"My Shop"}</h1><p className="shop-map-shop-identity">{shown.shop?.shopName ?? "Connected shop"}</p></div>{periodControl}</header>
    {shown.displayUnavailable&&<p className="shop-map-stale">Some listing photos could not be refreshed from Etsy. <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button></p>}
    {failed ? <p className="shop-map-stale">Showing your last saved results. The latest refresh did not finish.</p> : null}
      {/* The rebuilt engine moves these into the rail under Your shop. */}
      {!topTen&&<nav className="shop-map-tabs" aria-label="Your shop sections">
      {([['overview','Opportunity Engine'],['money','Your numbers'],['themes','Product themes'],['sold','Sold listings']] as const)
        .map(([key,label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined}
          onClick={() => selectTab(key)}>{label}</button>)}
    </nav>}

    {tab === "overview" && engine!=="top-ten" && <div className="shop-map-tab-panel">
      {panelLoading?<section className="shop-map-inline-state" role="status"><strong>Loading Opportunity Engine…</strong></section>:null}
      {shown.purchasePriorities?<OpportunityWorkspace map={shown.purchasePriorities} directions={shown.productDirections} findings={shown.opportunityFindings??[]} actions={shown.catalogActions??[]} patterns={shown.patterns} catalogPatterns={shown.catalogPatterns} marketProof={shown.marketProof??[]} reviews={shown.ownReviews??[]} analysisFailed={insightsFailed} onRetry={()=>void load()}
        sourceAnalysis={shown.patterns&&((shown.patterns.patterns?.length??0)>0||(shown.catalogActions?.length??0)>0||(shown.opportunityFindings?.length??0)>0||Boolean(shown.winnerDna))?<>
          {selectedDays===90?<WinningPatterns map={shown.patterns}/>:null}
          <ReviewThese map={shown.patterns} actions={shown.catalogActions??[]} dna={shown.winnerDna??null} marketProof={shown.marketProof??[]} priorityIds={shown.purchasePriorities?.priorities.map(row=>row.listingId)??[]} findings={shown.opportunityFindings??[]} days={selectedDays}/>
          {selectedDays===90&&!!shown.patterns?.patterns?.length&&<ArtworkRecommendations map={shown.patterns} purchasePriorities={shown.purchasePriorities} marketProof={shown.marketProof??[]}/>}
        </>:null}/>:null}
      {insightsLoading?<section className="shop-map-inline-state" role="status">Checking other shop signals…</section>:null}
      {insightsFailed?<section className="shop-map-inline-state"><strong>Some analysis could not load.</strong> <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Retry</button></section>:null}

    </div>}

    {tab === "themes" && <section className="shop-map-card shop-map-themes">
      <div className="shop-map-section-head"><div><p className="mini-label">PRODUCT THEMES</p><h2>Sales by product theme</h2>
        <p>{shown.worldsPeriod?.replace(/^./,letter=>letter.toUpperCase())}. Open a theme to see what is included.</p></div></div>
      {!themes.length&&!unclassifiedTheme?<p className="shop-map-state">No product themes are available yet.</p>:null}
      <ul className="shop-map-worlds">{themes.map(niche => { const share = recentTotal ? niche.revenueMinor / recentTotal : 0; const members=browseOwnListings(niche.memberListings??[],themeSort,themeQuery,themeState);
        return <li key={niche.worldId} className={open === niche.worldId ? "theme-expanded" : undefined}><button type="button" className="shop-map-world"
          aria-expanded={open === niche.worldId} onClick={() => {setOpen(open === niche.worldId ? "" : niche.worldId);setThemeQuery("");setThemeState("all")}}>
          <span className="shop-map-world-label">{niche.label}</span><span className="shop-map-world-figure">{money(niche.revenueMinor)}</span>
          <span className="shop-map-world-meta">{Math.round(share*100)}% of 90-day revenue · {niche.units??"—"} units · {niche.activeListings} active</span>
          <span className="shop-map-world-thumbs">{(niche.memberListings??[]).filter(listing=>listing.imageUrl).slice(0,3).map(listing=><img key={listing.listingId} src={listing.imageUrl} alt="" width={42} height={42} loading="lazy"/>)}</span>
          <span className="shop-map-bar"><span style={{width:`${Math.max(2,Math.round(share*100))}%`}}/></span>
          <span className="shop-map-lifetime">Lifetime: {money(niche.lifetimeRevenueMinor)} · {niche.lifetimeUnits??"—"} units</span>
        </button>{open === niche.worldId ? <div className="shop-map-evidence"><p>{niche.evidence}</p>
          <p>{niche.listings} total listings: {niche.activeListings} active and {Math.max(0,niche.listings-niche.activeListings)} inactive. Sales below cover the last 90 days.</p>
          <div className="shop-map-theme-toolbar shop-map-browse-controls"><label>Search<input type="search" value={themeQuery} onChange={e=>setThemeQuery(e.target.value)} placeholder="Find a listing"/></label><label>Status<select value={themeState} onChange={e=>setThemeState(e.target.value)}><option value="all">All statuses</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></label><label>Sort<select value={themeSort} onChange={e=>setThemeSort(e.target.value as "sales"|"favorites")}><option value="sales">Most units sold</option><option value="favorites">Highest favorites</option></select></label></div>
          {members.length!== (niche.memberListings?.length??0)&&<p role="status">{members.length} of {niche.memberListings?.length??0} listings shown</p>}{members.length===0&&<p>No listings match this search and status. Change the filters to see more.</p>}
          <div className="shop-map-theme-listings">{members.map(listing=><a key={listing.listingId} href={`https://www.etsy.com/listing/${listing.listingId}`} target="_blank" rel="noopener noreferrer">{listing.imageUrl?<img src={listing.imageUrl} alt="" loading="lazy" width={68} height={68}/>:null}<span><strong>{shortLabel(listing.title)}</strong><small>{listing.sales} sold in 90 days · {listing.favorites==null?"Favorites unavailable":`${listing.favorites} total favorites`} · {listing.state}</small></span></a>)}</div></div> : null}</li>})}</ul>
      {unclassifiedTheme&&<details className="shop-map-unclassified"><summary>Unclassified listings · {unclassifiedTheme.listings}</summary><p>These listings are not currently grouped into a product theme.</p></details>}
      <details className="shop-map-correction-tool"><summary>Correct a listing’s theme</summary>{correctionFailed&&<p className="p-notice p-notice-bad shop-map-correction-failed" role="alert">{correctionFailed}</p>}<MoveControl niches={niches} busy={busy} onMove={moveListing} onClear={clearCorrection}/></details>
    </section>}

    {tab === "sold" && <section className="shop-map-card shop-map-sold">
      <div className="shop-map-section-head"><div><p className="mini-label">SOLD LISTINGS</p><h2>Sold listings · last {shown.soldListings?.days??90} days</h2>
        <p>Units sold and revenue for the selected period.</p></div></div>

      <div className="shop-map-sold-toolbar"><label>Period<select value={soldDays} onChange={event=>setSoldDays(Number(event.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select></label><label className="search">Search<input type="search" value={soldQuery} onChange={e=>setSoldQuery(e.target.value)} placeholder="Find a listing"/></label><label>Sort<select value={soldSort} onChange={e=>setSoldSort(e.target.value as "sales"|"revenue")}><option value="sales">Most units sold</option><option value="revenue">Highest revenue</option></select></label></div>
      {!refreshing&&browseOwnListings(sold,soldSort,soldQuery).length!==sold.length
        &&<p role="status">{browseOwnListings(sold,soldSort,soldQuery).length} of {sold.length} sold listings match your search</p>}
      {refreshing?<p role="status">Loading sold listings for this period…</p>
        :!sold.length?<p className="shop-map-state">No sold listings in this period.</p>
        :<div className="shop-map-sold-grid shop-map-sold-table" aria-label="Listings">
        {browseOwnListings(sold,soldSort,soldQuery).map(listing => <article key={listing.listingId}>{listing.imageUrl ? <img src={listing.imageUrl} alt="" width={84} height={84} loading="lazy"/> : <i>G</i>}
          <div><strong><a href={`https://www.etsy.com/listing/${listing.listingId}`} target="_blank" rel="noopener noreferrer">{shortLabel(listing.title)}</a></strong><small>{listing.sales} unit{listing.sales===1?"":"s"} sold</small></div><b>{money(listing.revenueMinor)}</b></article>)}</div>}
    </section>}

    {tab === "money" && <section className="shop-map-card shop-map-money shop-map-money-redesign">
      {/* D1810 · The heading came after the control it labelled, and the month
          picker ran the full width of the card for a twelve-character value.
          Heading, then the two controls on one line. */}
      <div className="shop-map-money-head">
        <h2>Monthly numbers</h2>
        <div className="shop-map-money-controls">
          <label className="shop-map-period"><span>Month</span><input type="month" value={selectedMonth||shown.month||""} onInput={event=>{const value=event.currentTarget.value;if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value))setSelectedMonth(value)}} onChange={event=>setSelectedMonth(event.target.value)}/></label>
          <button type="button" className="shop-map-confirm p-button p-button-quiet" disabled={syncingMoney} onClick={()=>void refreshMoney()}>{syncingMoney ? "Refreshing your numbers…" : "Refresh your numbers"}</button>
        </div>
      </div>
      {syncingMoney&&<p role="status">Getting the latest sales, Etsy fees, and production costs. This may take a few minutes.</p>}
      {moneyRefreshError&&<p role="alert" className="shop-map-reason">{moneyRefreshError}</p>}
      {refreshing?<p role="status">Loading this month’s totals…</p>:selectedMonth && shown.month!==selectedMonth ? <p role="alert">This month could not be loaded. <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button></p>:shown.timezoneNeeded ? <><p className="shop-map-reason">Confirm your shop timezone so monthly totals match Etsy.</p>
        {detected ? <button className="shop-map-confirm" disabled={busy === "timezone"} onClick={() => void confirmTimezone()}>
          {busy === "timezone" ? "Saving…" : `My shop runs on ${detected}`}</button> : null}</>
      : <div className="current-money-grid"><div className="current-money-total">{monthBasis(month)==="unavailable"||month?.profitMinor == null
          ? <><p className="shop-map-headline-label">Revenue this month</p>
              <p className="shop-map-figure" data-basis="unavailable">{money(month?.revenueMinor,month?.currency)}</p></>
          : <><p className="shop-map-headline-label">Profit this month</p>
              <p className="shop-map-figure" data-basis={monthBasis(month)}>{money(month.profitMinor,month.currency)}</p></>}
        {month?.profitMinor==null&&month?.headline?<p className="shop-map-money-status">{month.headline}</p>:null}
        <p className="shop-map-accuracy">{month?.accuracy}</p>
        {month?.freshness ? <p className="shop-map-freshness" data-stale={month.salesStale ? "yes" : "no"}>{month.freshness}</p> : null}
        </div>
        <div className="shop-map-money-detail">
          <section className="shop-map-money-group"><h3>Sales</h3><dl className="shop-map-rows">
            <div><dt>Product sales</dt><dd>{money(month?.productRevenueMinor,month?.currency)}</dd></div>
            <div><dt>Shipping collected</dt><dd>{money(month?.shippingCollectedMinor,month?.currency)}</dd></div>
            <div><dt>Discounts</dt><dd>{money(month?.discountsMinor,month?.currency)}</dd></div>
            <div><dt>Refunds</dt><dd>{money(month?.refundsMinor,month?.currency)}</dd></div>
            <div><dt>Revenue</dt><dd>{money(month?.revenueMinor,month?.currency)}</dd></div>
            <div><dt>Orders</dt><dd>{month?.orders ?? "—"}</dd></div>
            <div><dt>Average order</dt><dd>{month?.orders&&month.revenueMinor!=null?money(Math.round(month.revenueMinor/month.orders),month.currency):"—"}</dd></div>
          </dl></section>
          <section className="shop-map-money-group"><h3>Etsy</h3><dl className="shop-map-rows">
            <div><dt>Transaction fees</dt><dd>{money(month?.etsyTransactionFeesMinor,month?.currency)}</dd></div>
            <div><dt>Processing fees</dt><dd>{money(month?.etsyProcessingFeesMinor,month?.currency)}</dd></div>
            <div><dt>Listing + renewal fees</dt><dd>{money(month?.etsyListingFeesMinor,month?.currency)}</dd></div>
            <div><dt>Advertising fees</dt><dd>{money(month?.etsyAdvertisingFeesMinor,month?.currency)}</dd></div>
            <div><dt>Other Etsy fees / credits</dt><dd>{money(month?.etsyOtherFeesMinor,month?.currency)}</dd></div>
            <div><dt>Total Etsy fees</dt><dd>{money(month?.etsyFeesMinor,month?.currency)}</dd></div>
            <div><dt>Marketplace tax</dt><dd>{money(month?.marketplaceTaxMinor,month?.currency)}</dd></div>
          </dl></section>
          <section className="shop-map-money-group"><h3>Production</h3><dl className="shop-map-rows">
            <div><dt>Product cost</dt><dd>{month?.productionProductCostMinor==null?"Not available":money(-month.productionProductCostMinor,month.currency)}</dd></div>
            <div><dt>Production shipping</dt><dd>{month?.productionShippingMinor==null?"Not available":money(-month.productionShippingMinor,month.currency)}</dd></div>
            <div><dt>Total production</dt><dd>{month?.productionCostMinor == null || month?.coverage?.unavailable ? "Not available" : money(-month.productionCostMinor,month.currency)}</dd></div>
            <div><dt>Cost coverage</dt><dd>{month?.coverage?String(Math.round(month.coverage.verified*100))+"%":"—"}</dd></div>
            <div><dt>Adjustments</dt><dd>{money(month?.adjustmentsMinor,month?.currency)}</dd></div>
            <div><dt>Profit margin</dt><dd>{month?.profitMarginPercent==null?"Not available":month.profitMarginPercent.toFixed(1)+"%"}</dd></div>
          </dl></section>
        </div>
        {month?.coverage?.unavailable ? <a className="shop-map-fix p-button p-button-primary" href={`/shop-map/costs?month=${encodeURIComponent(shown.month ?? "")}`}>Add production costs</a> : null}</div>}
    </section>}
    {signedInEmail ? null : null}
  </main>;
}
type Placement = { listingId: number; title: string; nicheId: string;
  nicheLabel: string; corrected: boolean; why: string };

function MoveControl(
  { niches, busy, onMove, onClear }:
  { niches: Niche[]; busy: string;
    onMove: (listingId: number, nicheId: string) => Promise<void>;
    onClear: (listingId: number) => Promise<void> },
) {
  const [listingId, setListingId] = useState("");
  const [nicheId, setNicheId] = useState("unclassified");
  /*
    CORRECTING SOMETHING YOU CANNOT SEE THE REASON FOR IS GUESSING.

    A member could already move a listing, but nothing on the page told them
    where the listing currently sits or why. Looking it up first is a read:
    it changes nothing, and the sentence it shows is built on the server so
    this component never handles the wording behind a placement.
  */
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [lookupFailed, setLookupFailed] = useState("");
  const [looking, setLooking] = useState(false);

  const look = async (id: string) => {
    setLooking(true);
    setPlacement(null);
    setLookupFailed("");
    try {
      const response = await fetch(`/api/shop-map/map?listingId=${encodeURIComponent(id)}`);
      if (!response.ok) {
        setLookupFailed("That listing could not be looked up just now. Nothing was changed.");
      } else {
        const body = await response.json() as { placement?: Placement | null };
        if (body.placement) {
          setPlacement(body.placement);
          setNicheId(body.placement.nicheId || "unclassified");
        } else {
          setLookupFailed(`Listing ${id} is not in this shop's map. Check the ID on `
            + `Etsy — it is the number in the listing's own URL.`);
        }
      }
    } catch {
      setLookupFailed("That listing could not be looked up just now. Nothing was changed.");
    }
    setLooking(false);
  };

  const working = busy.startsWith("move:");
  return (
    <div className="shop-map-move">
      <label>
        <span>Etsy listing ID</span>
        <input inputMode="numeric" value={listingId} placeholder="e.g. 1234567890"
          onChange={event => {
            setListingId(event.target.value.replace(/[^0-9]/g, ""));
            setPlacement(null);
            setLookupFailed("");
          }} />
      </label>
      <button type="button" className="shop-map-look" disabled={!listingId || looking}
        onClick={() => void look(listingId)}>
        {looking ? "Looking…" : "Where is it now?"}
      </button>
      {lookupFailed && (
        <p className="p-notice p-notice-bad shop-map-lookup-failed" role="alert">
          {lookupFailed}
        </p>
      )}
      {placement && (
        <div className="shop-map-placement">
          {placement.title && <p className="shop-map-placement-title">{placement.title}</p>}
          <p className="shop-map-placement-where">
            In <strong>{placement.nicheLabel}</strong>
            {placement.corrected ? " — your correction" : ""}
          </p>
          <p className="shop-map-placement-why">{placement.why}</p>
          {placement.corrected && (
            /*
              A correction made by mistake was permanent. Moving the listing
              to Unclassified is not the same thing — that is a member saying
              it belongs nowhere, which is itself a correction.
            */
            <button type="button" className="shop-map-clear-correction"
              disabled={busy.startsWith("clear:")}
              onClick={() => void (async () => {
                await onClear(placement.listingId);
                await look(String(placement.listingId));
              })()}>
              {busy.startsWith("clear:") ? "Clearing…" : "Use the automatic placement instead"}
            </button>
          )}
        </div>
      )}
      <label>
        <span>Move to</span>
        <select value={nicheId} onChange={event => setNicheId(event.target.value)}>
          {niches.filter(niche => niche.worldId !== "unclassified").map(niche =>
            <option key={niche.worldId} value={niche.worldId}>{niche.label}</option>)}
          <option value="unclassified">Unclassified</option>
        </select>
      </label>
      <button type="button" disabled={!listingId || working}
        onClick={() => void (async () => {
          await onMove(Number(listingId), nicheId);
          /*
            The panel above described where the listing WAS. Leaving it there
            after a move would state the old niche beside a map that now
            shows the new one, so it is read again rather than kept.
          */
          if (placement) await look(listingId);
        })()}>
        {working ? "Moving…" : "Move listing"}
      </button>
    </div>
  );
}
