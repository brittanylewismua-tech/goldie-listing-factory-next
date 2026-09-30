"use client";
import {shopMapSection,type ShopMapSection} from "./shop-map-navigation";
import ListingCheckPanel from "./listing-check-panel";
import {browseOwnListings} from "@/app/market-listing-browser";
import {designsOnOneProduct,familyLabel,shortLabel,type Reach,type ReachListing} from "@/app/design-reach";
import type {CatalogAction} from "@/app/shop-map-actions";
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
  opportunities?: ShopOpportunity[];
  nextBuild?: NextBuildPlan;
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
    <h2>Artwork selling on one recorded product type</h2><p>Review these before choosing a design to offer on another product.</p>

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
  return <section className="cc-tool shop-map-review"><h2>Listings to review</h2>
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
    ? "Give this the largest share of your next build cycle. Expand what is already working before you move on to weaker ideas."
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
              <small>{world.attentionPercent}% customer attention · {world.catalogPercent}% of active catalog</small></div>
            <em className={`attention-state ${world.state}`}>{world.state==="underbuilt"
              ?`+${world.buildGapPoints} pt gap`:world.state==="overbuilt"
                ?`${world.buildGapPoints} pt gap`:"in line"}</em>
          </div>
          <div className="shop-map-attention-track" aria-label={`${world.attentionPercent}% of customer attention`}>
            <i style={{width:`${Math.max(2,world.attentionPercent)}%`}}/>
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
  if(!plan.requestedListings)return null;
  return <section className="shop-map-next-build">
    <div className="shop-map-section-head">
      <div><p className="mini-label">YOUR NEXT BUILD CYCLE</p>
        <h2>If you make {plan.requestedListings} listings next, put them here.</h2>
        <p>This allocation closes the biggest gaps between customer response and what you have already built.</p></div>
      <span className="shop-map-next-build-total">{plan.allocatedListings}/{plan.requestedListings} placed</span>
    </div>
    {plan.rows.length?<div className="shop-map-next-build-grid">
      {plan.rows.map(row=><article key={row.worldId}>
        <div className="shop-map-next-build-count">{row.recommendedListings}</div>
        <div className="shop-map-next-build-copy">
          <div><span>0{row.rank}</span><b>{row.label}</b></div>
          <p>{row.attentionPercent}% customer attention · {row.catalogPercent}% of active catalog</p>
        </div>
      </article>)}
      {plan.heldBackListings>0?<article className="held-back">
        <div className="shop-map-next-build-count">{plan.heldBackListings}</div>
        <div className="shop-map-next-build-copy"><div><span>—</span><b>Hold back</b></div>
          <p>Goldie does not have enough classified evidence to place {plan.heldBackListings===1?"this slot":"these slots"} confidently yet.</p></div>
      </article>:null}
    </div>:null}
    <p className="shop-map-next-build-note">{plan.note}</p>
  </section>;
}

export function OpportunityRecommendations({rows}:{rows:ShopOpportunity[]}){
  const [copied,setCopied]=useState("");
  const visible=rows.filter(row=>row.state!=="aligned").slice(0,4);
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
      {visible.map(row=><article key={row.worldId} className={`shop-map-recommendation ${row.state}`}>
        <div className="shop-map-recommendation-rank">0{row.rank}</div>
        <div className="shop-map-recommendation-copy">
          <div className="shop-map-recommendation-label"><span>{row.label}</span>
            <em>{row.state==="underbuilt"?"BUILD DEEPER":"PAUSE EXPANSION"}</em></div>
          <h3>{row.headline}</h3>
          <p>{row.explanation}</p>
          <strong>{row.action}</strong>
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
      </article>)}
    </div>
  </section>;
}

export default function ShopMapClient({ signedInEmail }: { signedInEmail?: string }) {
  const [map, setMap] = useState<ShopMap | null>(null);
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
  const [tab, setTab] = useState<"overview" | "themes" | "sold" | "money">("overview");

  const [soldDays,setSoldDays]=useState(90);
  const [selectedMonth,setSelectedMonth]=useState("");
  const selectTab=(next:ShopMapSection)=>{
    setTab(next);
    const url=new URL(window.location.href);url.searchParams.set("tab",next);
    window.history.replaceState(window.history.state,"",url);
  };
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setTab(shopMapSection(params.get("tab")));const month=params.get("month")??"";if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month))setSelectedMonth(month)},[]);
  const [refreshing,setRefreshing]=useState(false);
  const [syncingMoney,setSyncingMoney]=useState(false);
  const [moneyRefreshError,setMoneyRefreshError]=useState("");
  const [insightsLoading,setInsightsLoading]=useState(false);
  const requestSequence=useRef(0);
  const load = useCallback(async () => {
    const sequence=++requestSequence.current;
    setRefreshing(true);
    const params=new URLSearchParams({view:tab});
    if(tab==="sold")params.set("days",String(soldDays));
    if(tab==="money"&&selectedMonth)params.set("month",selectedMonth);
    const next = await fetch(`/api/shop-map/map?${params.toString()}`)
      .then(response => response.json() as Promise<ShopMap>)
      .catch(() => null);
    if(sequence!==requestSequence.current)return;
    setRefreshing(false);
    if (!next || next.error) { setFailed(true); return; }
    setFailed(false);
    setMap(next);
    setLastGood(next);
    if(tab==="overview"){
      setInsightsLoading(true);
      void fetch("/api/shop-map/map?view=overview-insights")
        .then(response=>response.ok?response.json() as Promise<ShopMap>:null)
        .then(detail=>{
          if(sequence!==requestSequence.current||!detail||detail.error)return;
          setMap(current=>current?{...current,...detail}:detail);
          setLastGood(current=>current?{...current,...detail}:detail);
        })
        .catch(()=>undefined)
        .finally(()=>{if(sequence===requestSequence.current)setInsightsLoading(false);});
    } else setInsightsLoading(false);
  },[tab,soldDays,selectedMonth]);
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

  const shown = refreshing ? null : (map ?? lastGood);

  if (!shown && failed)
    return <main className="shop-map"><p className="shop-map-state">
      Your shop data could not load. Try again.
    </p></main>;
  if (!shown)
    return <main className="shop-map shop-map-redesign">
      <header className="shop-map-head current-page-heading"><div>
        <p className="current-kicker">YOUR SHOP</p>
        <h1>Your shop</h1>
        <p>Loading your connected shop and latest performance…</p>
      </div></header>
      <nav className="shop-map-tabs" aria-label="Your shop sections">
        {([['overview','Opportunity Engine'],['money','Your numbers'],['themes','Product themes'],['sold','Sold listings']] as const)
          .map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined}
            onClick={()=>selectTab(key)}>{label}</button>)}
      </nav>
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
  const themes = [...(shown.worlds ?? [])];
  const unclassifiedTheme = shown.unclassifiedCard?.listings ? shown.unclassifiedCard : null;
  const niches = unclassifiedTheme ? [...themes,unclassifiedTheme] : themes;
  const recentTotal = niches.reduce((sum, niche) => sum + niche.revenueMinor, 0);
  const noSalesYet = (shown.shopTotals?.orders ?? 0) === 0;

  const sold = shown.soldListings?.listings ?? [];
  const units90=sold.reduce((sum,row)=>sum+row.sales,0);
  const leaders=shown.topListings??[];
  return <main className="shop-map shop-map-redesign">
    <header className="shop-map-head current-page-heading"><div><p className="current-kicker">YOUR SHOP</p><h1>{shown.shop?.shopName ?? "Your shop"}</h1><p>What is selling, where your revenue is coming from, and what deserves your attention.</p></div></header>
    {shown.displayUnavailable&&<p className="shop-map-stale">Some listing photos could not be refreshed from Etsy. <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button></p>}
    {failed ? <p className="shop-map-stale">Showing your last saved results. The latest refresh did not finish.</p> : null}
    <nav className="shop-map-tabs" aria-label="Your shop sections">
      {([['overview','Opportunity Engine'],['money','Your numbers'],['themes','Product themes'],['sold','Sold listings']] as const)
        .map(([key,label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined}
          onClick={() => selectTab(key)}>{label}</button>)}
    </nav>

    {tab === "overview" && <div className="shop-map-tab-panel">
      {shown.attention&&shown.attention.basis!=="none"&&<AttentionEngine attention={shown.attention}/>}
      {shown.nextBuild&&<NextBuildAllocation plan={shown.nextBuild}/>}
      {!!shown.opportunities?.length&&<OpportunityRecommendations rows={shown.opportunities}/>}
      <section className="shop-map-leaders">
        <div className="shop-map-section-head"><div><p className="mini-label">LAST 90 DAYS</p>
          <h2>Top sellers</h2></div>
          <button type="button" className="p-button p-button-primary" onClick={() => selectTab("sold")}>View sold listings →</button></div>
        {leaders.length ? <div className="shop-map-leader-grid">{leaders.map((listing,index) =>
          <article key={listing.listingId} className={index === 0 ? "lead" : ""}>
            <div className="shop-map-listing-image">{listing.imageUrl
              ? <img src={listing.imageUrl} alt="" loading="lazy" width={570} height={570} />
              : <span aria-hidden="true">G</span>}<b>0{index + 1}</b></div>
            <div>{index === 0 ? <p className="mini-label">TOP SELLER</p> : null}<h3><a href={`https://www.etsy.com/listing/${listing.listingId}`} target="_blank" rel="noopener noreferrer">{shortLabel(listing.title)}</a></h3>
              <p><strong>{listing.sales} sold</strong><span>{money(listing.revenueMinor)}</span></p></div>
          </article>)}</div> : <div className="shop-map-empty"><b>No sales in the last 90 days.</b>
            <p>Your sold listings will appear here after the next Etsy sales import.</p></div>}
      </section>

      <section className="shop-map-summary-grid" aria-label="Last 90 days summary">
        <article><span>Revenue · 90 days</span><strong>{money(shown.shopTotals?.revenueLast90Minor)}</strong><small>across your shop</small></article>
        <article><span>Units sold · 90 days</span><strong>{units90}</strong><small>from sold listings</small></article>
        <article><span>Top product theme</span><strong>{themes[0]?.label ?? "Not enough data"}</strong><small>{themes[0] ? `${themes[0].units??"—"} units sold in 90 days` : "Sales will reveal this"}</small></article>
      </section>

      {insightsLoading&&!shown.whereToFocus?.length?<section className="shop-map-insights-loading" role="status"><span className="shop-map-loader-dot"/><span>Loading where to focus…</span></section>:null}
      {!!shown.whereToFocus?.length&&<section className="shop-map-focus-panel">
        <div className="shop-map-section-head"><div><p className="mini-label">WHERE TO FOCUS</p><h2>{shown.standout?.headline||"What deserves your attention"}</h2></div></div>
        <div className="shop-map-focus-list">{shown.whereToFocus.slice(0,3).map(focus=><article key={focus.nicheId||focus.label}>
          <span>{focus.label}</span><strong>{focus.headline}</strong><p>{focus.advice}</p>
        </article>)}</div>
      </section>}

      {!insightsLoading||shown.catalogActions||shown.whereToFocus?<section className="shop-map-opportunities">
        <div className="shop-map-section-head"><div><p className="mini-label">OPPORTUNITIES IN YOUR SHOP</p><h2>Things worth reviewing</h2></div></div>
        <div className="shop-map-opportunity-stack">
          <CatalogReview actions={shown.catalogActions ?? []} shopId={shown.shop?.shopId}/>
          <DesignReach/>
          <ListingCheckPanel/>
        </div>
      </section>:null}
    </div>}

    {tab === "themes" && <section className="shop-map-card shop-map-themes">
      <div className="shop-map-section-head"><div><p className="mini-label">PRODUCT THEMES</p><h2>Sales by product theme</h2>
        <p>{shown.worldsPeriod?.replace(/^./,letter=>letter.toUpperCase())}. Open a theme to see what is included.</p></div></div>
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
      {refreshing?<p role="status">Loading sold listings for this period…</p>:<div className="shop-map-sold-grid shop-map-sold-table" aria-label="Listings">
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

