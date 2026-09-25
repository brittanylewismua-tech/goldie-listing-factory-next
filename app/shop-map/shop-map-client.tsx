"use client";
import {browseOwnListings} from "@/app/market-listing-browser";
import ActionPlan from "@/app/command-center/action-plan";
import {designsOnOneProduct,familyLabel,shortLabel,type Reach,type ReachListing} from "@/app/design-reach";
import ListingCheckPanel from "./listing-check-panel";
import type {CatalogAction} from "@/app/shop-map-actions";
import { useCallback, useEffect, useRef, useState } from "react";
import { monthName } from "@/app/shop-map-month";
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
type ShopMap = {
  catalogActions?: CatalogAction[];
  displayUnavailable?:boolean;
  topListings?: Array<{listingId:number;title:string;imageUrl:string;favorites:number|null;sales:number;revenueMinor:number}>;
  shop?: { shopId?:number; shopName: string; imageUrl?: string };
  month?: string;
  thisMonth?: { revenueMinor: number|null; etsyFeesMinor: number|null; productionCostMinor: number|null; refundsMinor?:number|null;adjustmentsMinor?:number|null;
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
  shopTotals?: { listings: number; activeListings?:number; orders: number };
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
    <h2>Sold, and only on one product</h2>

    <ul>{rows.map(row=><li key={row.key}>
      {row.imageUrl?<img src={row.imageUrl} alt="" width={72} height={72} loading="lazy"/>:<span aria-hidden="true"/>}
      <span className="shop-map-reach-copy">
        <b>{shortLabel(row.title)}</b>
        <small>{row.sold90} sold in 90 days · only on {familyLabel(row.families[0])}</small>
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
  if(!actions.length)return <section className="cc-tool"><h2>Listings to review</h2>
    <p className="cc-note">Nothing in your catalog is currently a past seller gone inactive,
    a sharp slowdown, or an older listing with favorites and no orders.</p></section>;
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
          <a href={`https://www.etsy.com/listing/${action.listingId}`} target="_blank" rel="noopener noreferrer">Check this listing on Etsy \u2197</a>
          <ActionPlan feature="shopMap" source={`shop-${shopId}-listing-${action.listingId}`} heading={action.headline} notes={`${action.title}
${action.evidence}

${action.nextStep}

Change I will test:
Start and end dates:
What would make this worth repeating:`}/>
        </div>
      </details>)}
    </div>)}
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
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("tab")==="money")setTab("money");const month=params.get("month")??"";if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month))setSelectedMonth(month)},[]);
  const [refreshing,setRefreshing]=useState(false);
  const [syncingMoney,setSyncingMoney]=useState(false);
  const [moneyRefreshError,setMoneyRefreshError]=useState("");
  const requestSequence=useRef(0);
  const load = useCallback(async () => {
    const sequence=++requestSequence.current;
    setRefreshing(true);
    const next = await fetch(`/api/shop-map/map?days=${soldDays}${selectedMonth?`&month=${encodeURIComponent(selectedMonth)}`:""}`)
      .then(response => response.json() as Promise<ShopMap>)
      .catch(() => null);
    if(sequence!==requestSequence.current)return;
    setRefreshing(false);
    if (!next || next.error) { setFailed(true); return; }
    setFailed(false);
    setMap(next);
    setLastGood(next);
  },[soldDays,selectedMonth]);
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

  const shown = map ?? lastGood;

  if (!shown && failed)
    return <main className="shop-map"><p className="shop-map-state">
      Shop Map could not load just now. Nothing has changed — try again in a moment.
    </p></main>;
  if (!shown)
    /*
      D1604 · A sentence on a white page was the whole loading state, and Shop
      Map takes a few seconds to read a shop. The shape of what is coming is
      drawn instead, so the wait has somewhere to land and the page does not
      jump when it arrives.
    */
    return <main className="shop-map p-grid">
      <div className="p-page">
        <div className="p-head">
          <p className="p-eyebrow">Shop Map</p>
          <div className="p-skeleton p-skeleton-line" style={{ width: "40%", height: 26 }} />
          <div className="p-skeleton p-skeleton-line" style={{ width: "62%" }} />
        </div>
        <p className="shop-map-state" role="status">Organizing your shop…</p>
        <div className="p-stack" aria-hidden="true">
          <div className="p-skeleton p-skeleton-card" />
          <div className="p-skeleton p-skeleton-card" />
          <div className="p-skeleton p-skeleton-card" />
        </div>
      </div>
    </main>;

  const month = shown.thisMonth;
  const niches = [...(shown.worlds ?? [])];
  if (shown.unclassifiedCard?.listings) niches.push(shown.unclassifiedCard);
  const recentTotal = niches.reduce((sum, niche) => sum + niche.revenueMinor, 0);
  const noSalesYet = (shown.shopTotals?.orders ?? 0) === 0;

  const sold = shown.soldListings?.listings ?? [];
  const leaders=shown.topListings??[];
  return <main className="shop-map shop-map-redesign">
    <header className="shop-map-head">
      <div className="shop-map-identity">
        {shown.shop?.imageUrl ? <img src={shown.shop.imageUrl} alt="" width={64} height={64}/>
          : <span className="shop-map-profile-fallback" aria-hidden="true">G</span>}
        <div><h1>{shown.shop?.shopName ?? "Shop Map"}</h1>
          <p>Shop Map · {monthName(shown.month)}</p></div>
      </div>
    </header>
    {shown.displayUnavailable&&<p className="shop-map-stale">Some listing photos could not be refreshed from Etsy. <button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button></p>}
    {failed ? <p className="shop-map-stale">Showing your last saved results. The latest refresh did not finish.</p> : null}
    <nav className="shop-map-tabs" aria-label="Shop Map sections">
      {([['overview','Overview'],['themes','Product themes'],['sold','Sold listings'],['money','Your numbers']] as const)
        .map(([key,label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined}
          onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === "overview" && <div className="shop-map-tab-panel">
      <section className="shop-map-leaders">
        <div className="shop-map-section-head"><div><p className="mini-label">LAST 90 DAYS</p>
          <h2>Top 3 listings in the last 90 days</h2></div>
          <button type="button" className="p-button p-button-primary" onClick={() => setTab("sold")}>See every sold listing ↗</button></div>
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
      {/* D1799 · Facts first, then what to do about them. These two action
          panels opened the page, so Shop Map began with eight rows of
          near-identical SEO titles and the shop's own sales were pushed
          below the fold. */}
      <DesignReach/>
      <ListingCheckPanel/>
      <CatalogReview actions={shown.catalogActions ?? []} shopId={shown.shop?.shopId}/>
      <section className="shop-map-summary-grid">
        <article><span>Orders this month</span><strong>{month?.orders ?? 0}</strong><small>{money(month?.revenueMinor,month?.currency)} revenue</small></article>
        <article><span>Active listings</span><strong>{shown.shopTotals?.activeListings ?? 0}</strong><small>in your current catalog</small></article>
        <article><span>Top product theme</span><strong>{niches[0]?.label ?? "Not enough data"}</strong><small>{niches[0] ? `${niches[0].units??"—"} units sold in 90 days` : "Sales will reveal this"}</small></article>
      </section>
    </div>}

    {tab === "themes" && <section className="shop-map-card shop-map-themes">
      <div className="shop-map-section-head"><div><p className="mini-label">PRODUCT THEMES</p><h2>Where your sales are coming from.</h2>
        <p>{shown.worldsPeriod}. Open a theme to see what is included.</p></div></div>
      <ul className="shop-map-worlds">{niches.map(niche => { const share = recentTotal ? niche.revenueMinor / recentTotal : 0; const members=browseOwnListings(niche.memberListings??[],themeSort,themeQuery,themeState);
        return <li key={niche.worldId} className={open === niche.worldId ? "theme-expanded" : undefined}><button type="button" className="shop-map-world"
          aria-expanded={open === niche.worldId} onClick={() => {setOpen(open === niche.worldId ? "" : niche.worldId);setThemeQuery("");setThemeState("all")}}>
          <span className="shop-map-world-label">{niche.label}</span><span className="shop-map-world-figure">{money(niche.revenueMinor)}</span>
          <span className="shop-map-world-meta">{niche.activeListings} active listings · {niche.units??"—"} units sold</span>
          <span className="shop-map-bar"><span style={{width:`${Math.max(2,Math.round(share*100))}%`}}/></span>
          <span className="shop-map-lifetime">Recorded history: {money(niche.lifetimeRevenueMinor)} · {niche.lifetimeUnits??"—"} units sold</span>
        </button>{open === niche.worldId ? <div className="shop-map-evidence"><p>{niche.evidence}</p>
          <p>{niche.listings} total listings: {niche.activeListings} active and {Math.max(0,niche.listings-niche.activeListings)} inactive. Sales below cover the last 90 days.</p>
          <div className="shop-map-browse-controls"><label>Search this theme<input type="search" value={themeQuery} onChange={e=>setThemeQuery(e.target.value)} placeholder="Find a listing"/></label><label>Listing status<select value={themeState} onChange={e=>setThemeState(e.target.value)}><option value="all">All statuses</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></label></div>
          <p role="status">{members.length} of {niche.memberListings?.length??0} listings shown</p>{members.length===0&&<p>No listings match this search and status. Change the filters to see more.</p>}
<div className="market-results-sort"><label>Sort theme listings<select value={themeSort} onChange={e=>setThemeSort(e.target.value as "sales"|"favorites")}><option value="sales">Most units sold</option><option value="favorites">Highest total favorites</option></select></label></div>
          <div className="shop-map-theme-listings">{members.map(listing=><a key={listing.listingId} href={`https://www.etsy.com/listing/${listing.listingId}`} target="_blank" rel="noopener noreferrer">{listing.imageUrl?<img src={listing.imageUrl} alt="" loading="lazy" width={68} height={68}/>:null}<span><strong>{shortLabel(listing.title)}</strong><small>{listing.sales} sold in 90 days · {listing.favorites==null?"Favorites unavailable":`${listing.favorites} total favorites`} · {listing.state}</small></span></a>)}</div></div> : null}</li>})}</ul>
    </section>}

    {tab === "sold" && <section className="shop-map-card shop-map-sold">
      <div className="shop-map-section-head"><div><p className="mini-label">SOLD LISTINGS</p><h2>Sold listings · last {shown.soldListings?.days??90} days</h2>
        <p>Units sold and revenue for the selected period.</p></div></div>

      <div className="shop-map-browse-controls"><label>Sales period <select value={soldDays} onChange={event=>setSoldDays(Number(event.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select></label><label>Search sold listings<input type="search" value={soldQuery} onChange={e=>setSoldQuery(e.target.value)} placeholder="Find a listing"/></label></div>
      {!refreshing&&<p role="status">{browseOwnListings(sold,soldSort,soldQuery).length} of {sold.length} sold listings shown</p>}
<div className="market-results-sort"><label>Sort sold listings<select value={soldSort} onChange={e=>setSoldSort(e.target.value as "sales"|"revenue")}><option value="sales">Most units sold</option><option value="revenue">Highest revenue</option></select></label></div>
      {refreshing?<p role="status">Loading sold listings for this period…</p>:<div className="shop-map-sold-table"><div className="head"><span>Listing</span><span>Units sold</span><span>Revenue</span></div>
        {browseOwnListings(sold,soldSort,soldQuery).map(listing => <article key={listing.listingId}><div>{listing.imageUrl ? <img src={listing.imageUrl} alt=""/> : <i>G</i>}
          <strong><a href={`https://www.etsy.com/listing/${listing.listingId}`} target="_blank" rel="noopener noreferrer">{shortLabel(listing.title)}</a></strong></div><b data-label="Units sold">{listing.sales}</b><span data-label="Revenue">{money(listing.revenueMinor)}</span></article>)}</div>}
    </section>}

    {tab === "money" && <section className="shop-map-card shop-map-money shop-map-money-redesign">
      {/* D1810 · The heading came after the control it labelled, and the month
          picker ran the full width of the card for a twelve-character value.
          Heading, then the two controls on one line. */}
      <div className="shop-map-money-head">
        <h2>Monthly profit</h2>
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
      : <>{monthBasis(month)==="unavailable"||month?.profitMinor == null
          ? <><p className="shop-map-headline-label">Revenue this month</p>
              <p className="shop-map-figure" data-basis="unavailable">{money(month?.revenueMinor,month?.currency)}</p></>
          : <><p className="shop-map-headline-label">Profit this month</p>
              <p className="shop-map-figure" data-basis={monthBasis(month)}>{money(month.profitMinor,month.currency)}</p></>}
        <p className="shop-map-accuracy">{month?.accuracy}</p>
        {month?.freshness ? <p className="shop-map-freshness" data-stale={month.salesStale ? "yes" : "no"}>{month.freshness}</p> : null}
        <dl className="shop-map-rows">
          <div><dt>Revenue</dt><dd>{money(month?.revenueMinor,month?.currency)}</dd></div><div><dt>Etsy fees</dt><dd>{money(month?.etsyFeesMinor,month?.currency)}</dd></div>
          <div><dt>Production</dt><dd>{month?.productionCostMinor == null || month?.coverage?.unavailable ? "Not available" : money(-month.productionCostMinor,month.currency)}</dd></div>
          <div><dt>Refunds recorded</dt><dd>{money(month?.refundsMinor,month?.currency)}</dd></div><div><dt>Adjustments</dt><dd>{money(month?.adjustmentsMinor,month?.currency)}</dd></div><div><dt>Orders</dt><dd>{month?.orders ?? 0}</dd></div></dl>
        {month?.coverage?.unavailable ? <a className="shop-map-fix p-button p-button-primary" href={`/shop-map/costs?month=${encodeURIComponent(shown.month ?? "")}`}>Add production costs</a> : null}</>}
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
