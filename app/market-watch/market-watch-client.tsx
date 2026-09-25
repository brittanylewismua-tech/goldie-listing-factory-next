"use client";

import ActionPlan from "@/app/command-center/action-plan";
import {competitorChanges,type CollectionEntry} from "@/app/market-collection";
import {rankScan,type KeywordOrder} from "@/app/keyword-scan";
import {confirmAction} from "@/app/confirm-dialog";
import {shortLabel} from "@/app/design-reach";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {browseListings,type ListingOrder} from "@/app/market-listing-browser";

type Listing = {
  createdAt?:number|null; listedAt?:number|null;
  listingId: number; title: string; imageUrl: string; etsyUrl: string;
  state?: string; label?: string; confirmedAt?: number; intervals: number;
  sold7?: number; sold30?: number; priceCents: number | null; currency: string;
  favorites: number | null; views: number | null; ageDays: number | null;
  reviewsOnThisListing: number|null; displayFresh: boolean;
  tags?: string[]; isPersonalizable?: boolean|null; materials?: string[]; shopSold?: number|null;
  soldUnits?: number|null; soldHours?: number|null;
};
type Profile = {
  sampleSize:number; currency:string|null;
  priceBand:{low:number;high:number}|null; priceMedian:number|null; fieldPriceMedian:number|null;
  ageMedianDays:number|null; personalisedShare:number|null; provenShopShare:number|null;
  subjects:Array<{word:string;winners:number;field:number}>;
  blanks:Array<{label:string;winners:number}>;
};
type NicheView = { key: string; phrase: string; stale?: boolean; gathering?: boolean;
  summary?: { moving: number; repeated: number; newSinceLastBrief: number; shops: number };
  listings?: Listing[]; window?: string | null; error?: string; history?: Array<{day:string;moving:number;repeated:number;shops:number}> };
type WatchRow = { key: string; phrase: string; moving: number; repeated: number;
  shops: number; lastCheckedAt: number; stale: boolean; listings: Listing[] };
type ShopPattern = { action?:{change:string;check:string}|null; pattern?: string; because?: string; evidence?: string; window?: string;
  reviews?: Array<{rating:number;review:string;createdAt:number}>; listing?: { id: number | null; url: string; title?:string;imageUrl?:string;priceCents?:number|null;currency?:string } };
type ShopView = { shopId: number; shopName: string; etsy: string; displayUnavailable?:boolean;
  gettingAttention: ShopPattern[]; whatBuyersLove: ShopPattern[];
  whatBuyersDislike: ShopPattern[]; whatChanged: ShopPattern[] };
type Load<T> = { status: "loading" | "ready" | "failed"; data: T };

const tabFromUrl = (): "niches" | "shops" => typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("tab") === "shops" ? "shops" : "niches";
const money = (listing: Listing) => listing.priceCents == null ? "Price unavailable"
  : new Intl.NumberFormat(undefined, { style: "currency", currency: listing.currency || "USD" })
    .format(listing.priceCents / 100);

export default function MarketWatchClient(
  { signedInEmail, startTab, startKeyword }: { signedInEmail: string;
    startTab?: "niches" | "shops"; startKeyword?: string },
) {
  void signedInEmail;
  const [tab,setTab]=useState<"niches"|"shops">(startTab??tabFromUrl);
  const [watches,setWatches]=useState<Load<WatchRow[]>>({status:"loading",data:[]});
  const [shops,setShops]=useState<Load<ShopView[]>>({status:"loading",data:[]});
  const [open,setOpen]=useState<NicheView|null>(null);
  const [selectedShop,setSelectedShop]=useState<ShopView|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [opening,setOpening]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  // The desktop shell scrolls its main pane; phones scroll the document.
  // Reset only when entering/leaving a detail, not when refreshing or sorting it.
  const detailKey=selectedShop?`shop:${selectedShop.shopId}`:open?`keyword:${open.key}`:"watchlist";
  useEffect(()=>{
    document.querySelector(".factory-main")?.scrollTo({top:0,behavior:"instant"});
    window.scrollTo({top:0,behavior:"instant"});
  },[detailKey]);


  const loadNiches=useCallback(async(quiet=false)=>{if(!quiet)setWatches(w=>({...w,status:"loading"}));try{const response=await fetch("/api/market-watch/niches");if(!response.ok)throw new Error();const body=await response.json() as {watches:WatchRow[]};setWatches({status:"ready",data:body.watches??[]})}catch{setWatches(w=>({status:"failed",data:w.data}))}},[]);
  const loadShops=useCallback(async(quiet=false)=>{if(!quiet)setShops(w=>({...w,status:"loading"}));try{const response=await fetch("/api/shop-watch/brief");if(!response.ok)throw new Error();const body=await response.json() as {shops:ShopView[]};setShops({status:"ready",data:body.shops??[]})}catch{setShops(w=>({status:"failed",data:w.data}))}},[]);
  useEffect(()=>{void loadNiches();void loadShops()},[loadNiches,loadShops]);

  const chooseTab = (next: "niches" | "shops") => {
    setTab(next); setError(""); setNotice("");
    if (typeof window === "undefined" ) return;
    const url = new URL(window.location.href);
    if (next === "shops") url.searchParams.set("tab", "shops");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
  const add = async () => {
    const value=input.trim(); if(!value||busy)return;
    setBusy(true); setError(""); setNotice("");
    try {
      const niches=tab==="niches",response=await fetch(niches?"/api/market-watch/niches":"/api/market-watch/shops",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(niches?{phrase:value}:{input:value})});
      const body=await response.json() as NicheView&{error?:string;alreadyWatched?:boolean;shopName?:string;shop?:{shopName?:string}};
      if(!response.ok)setError(body.error??"That could not be saved.");
      else { setInput("");
        if(body.alreadyWatched)setNotice(`${body.shopName ?? body.shop?.shopName ?? "That shop"} is already on your watch list.`);
        if(niches){setOpen(body);void loadNiches(true)}else void loadShops(true);
      }
    } catch { setError("That could not be saved."); }
    finally { setBusy(false); }
  };
  /*
    STOPPING IS AS ORDINARY AS STARTING.

    Both endpoints have taken a removal since they were written - the keyword
    one on `remove`, the shop one on the same - and neither had a button. A
    watchlist you can only add to fills up with phrases you tried once, and
    the shop list is capped at 25, so with no way to drop one the cap
    eventually locks the feature rather than limiting it.

    Confirmed because it is not undoable in one click; the wording says what
    survives, since removing a shop leaves its recorded history in place for
    anyone else watching it and for the member if they add it back.
  */
  const [removing,setRemoving]=useState("");
  const stopWatching=async(kind:"niche"|"shop",id:string|number,name:string)=>{
    const ok=await confirmAction({eyebrow:"MARKET WATCH",title:`Stop tracking ${name}?`,
      body:kind==="niche"
        ?"It comes off your tracked keywords. You can track it again at any time."
        :"It comes off your tracked shops. Its recorded history is kept, so adding it back resumes where it left off.",
      confirmLabel:"Stop tracking",destructive:true});
    if(!ok)return;
    setRemoving(String(id));setError("");
    try{
      const response=await fetch(kind==="niche"?"/api/market-watch/niches":"/api/market-watch/shops",
        {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({remove:id})});
      if(!response.ok)throw new Error();
      if(kind==="niche")await loadNiches(true);else await loadShops(true);
    }catch{setError(`${name} could not be removed. Nothing was changed. Try again.`);}
    finally{setRemoving("");}
  };
  const openNiche=async(key:string)=>{const saved=watches.data.find(row=>row.key===key);if(saved){setOpen({key:saved.key,phrase:saved.phrase});return;}setError("");setOpening(key);try{const response=await fetch(`/api/market-watch/niches?key=${encodeURIComponent(key)}`),body=await response.json() as NicheView&{error?:string};if(!response.ok)setError(body.error??"Those listings could not be opened.");else setOpen(body)}catch{setError("Those listings could not be opened.")}finally{setOpening("")}};
  useEffect(()=>{if(startKeyword)void openNiche(startKeyword)},[]);

  if(selectedShop)return <main className="mw"><button className="back p-button p-button-quiet" onClick={()=>setSelectedShop(null)}>← Tracked shops</button><ShopCard shop={selectedShop}/></main>;
  if(open)return <NicheDetail view={open} refreshing={Boolean(opening)} onRefresh={()=>void openNiche(open.key)} onBack={()=>{setOpen(null);void loadNiches(true)}}/>;
  return <main className="mw">
    <header className="mw-intro"><h1>Market Watch</h1></header>
    <div className="tabs p-tabs" role="tablist">
      <button className="p-tab" role="tab" aria-selected={tab==="niches"} id="mw-tab-niches" aria-controls="mw-panel" onClick={()=>chooseTab("niches")}>Tracked keywords</button>
      <button className="p-tab" role="tab" aria-selected={tab==="shops"} id="mw-tab-shops" aria-controls="mw-panel" onClick={()=>chooseTab("shops")}>Tracked shops</button>
    </div>
    <div className="add"><input className="p-input" value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void add()}} aria-label={tab==="niches"?"Keyword to track":"Shop to track"} placeholder={tab==="niches"?"Enter a keyword, like bookish sweatshirt":"Etsy shop link or name"}/><button className="p-button p-button-primary" onClick={()=>void add()} disabled={busy||!input.trim()} aria-busy={busy}>{busy?"Adding…":tab==="niches"?"Track keyword":"Track shop"}</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!error && notice && <p className="p-notice" role="status">{notice}</p>}
    {tab==="shops"&&(shops.status==="ready"||shops.data.length>0)&&<p className="watch-limit">{shops.data.length} of 25 shops tracked</p>}
    <div id="mw-panel" role="tabpanel" aria-labelledby={tab==="niches"?"mw-tab-niches":"mw-tab-shops"}>
      {tab==="niches"?<WatchList load={watches} onRetry={()=>void loadNiches()} failure="Your tracked keywords could not be loaded." empty="Track a keyword to start comparing listings.">
        <div className="keyword-watch-grid">{watches.data.map(watch=><article className="keyword-watch" key={watch.key} data-stale={watch.stale?"yes":"no"}>
          <div className="keyword-watch-head"><div><h2>{watch.phrase}</h2></div><div className="watch-card-actions"><button type="button" className="p-button p-button-primary" onClick={()=>void openNiche(watch.key)} disabled={Boolean(opening)}>{opening===watch.key?"Opening…":"View listings"}</button><button type="button" className="watch-remove" aria-label={`Stop tracking ${watch.phrase}`} disabled={removing===watch.key} onClick={()=>void stopWatching("niche",watch.key,watch.phrase)}>{removing===watch.key?"Removing…":"Stop tracking"}</button></div></div>
          {watch.stale&&<p className="keyword-stale">Current data could not be refreshed. Showing saved details.</p>}
          {/*
    D1812 · THE CARD KNEW ALL OF THIS AND SHOWED NONE OF IT.

    A tracked keyword is tracked so a seller can see what is moving in it
    without opening it. The card was the phrase, two buttons and four
    photographs; the response behind it already carried how many of the
    listings under watch have been seen selling, how many sold more than
    once, and how many shops they belong to. Measured live across seven
    keywords those ranged from 7/5/7 to 0/0/0 - which is the whole point of
    following one phrase and not another.
  */}
          {watch.moving>0
            ? <dl className="keyword-watch-stats">
                <div><dt>Seen selling</dt><dd>{watch.moving}</dd></div>
                <div><dt>More than once</dt><dd>{watch.repeated}</dd></div>
                <div><dt>Shops</dt><dd>{watch.shops}</dd></div>
              </dl>
            : <p className="keyword-watch-quiet">Nothing under watch here has been seen selling yet.</p>}
          {/*
    D1784 · FOUR EMPTY BOXES AND NO EXPLANATION.

    Etsy requires displayed listing information to be no more than six hours
    old, so a cached photo past that is not shown - correctly. What was wrong
    is what took its place: an empty span per listing, so four of these eight
    cards rendered as a row of grey rectangles with nothing saying why, and
    the card is not marked stale either, because the listings themselves are
    current. It reads as broken software.

    A row with nothing to show does not pretend to be a row now.
*/}
          {(() => {
            const shots=(watch.listings??[]).slice(0,4).filter(listing=>listing.imageUrl&&listing.displayFresh);
            if(shots.length) return <div className="keyword-thumbs">{shots.map(listing=>
              <img key={listing.listingId} src={listing.imageUrl} alt="" width={180} height={180}/>)}</div>;
            return <p className="keyword-thumbs-empty">{(watch.listings??[]).length
              ? "Photos for this keyword are older than Etsy allows us to display. Open it to see current listings."
              : "Listings will appear after Etsy refreshes this keyword."}</p>;
          })()}

        </article>)}</div>
      </WatchList>:<WatchList load={shops} onRetry={()=>void loadShops()} failure="Your tracked shops could not be loaded." empty="Add an Etsy shop to follow its listing activity."><div className="tracked-shop-grid">{shops.data.map(shop=><article className="tracked-shop-card" key={shop.shopId}><p className="mini-label">TRACKED SHOP</p><h2>{shop.shopName}</h2><p>Active listings · Buyer feedback · Shop changes</p><div className="watch-card-actions"><button className="p-button p-button-primary" onClick={()=>setSelectedShop(shop)}>Explore shop</button><button type="button" className="watch-remove" aria-label={`Stop tracking ${shop.shopName}`} disabled={removing===String(shop.shopId)} onClick={()=>void stopWatching("shop",shop.shopId,shop.shopName)}>{removing===String(shop.shopId)?"Removing…":"Stop tracking"}</button></div></article>)}</div></WatchList>}
    </div>
  </main>;
}

function WatchList({load,onRetry,failure,empty,children}:{load:{status:"loading"|"ready"|"failed";data:unknown[]};onRetry:()=>void;failure:string;empty:string;children:ReactNode}){
  if(load.status==="loading"&&!load.data.length)return <div className="watch-wait" aria-label="Loading"><span className="p-skeleton"/><span className="p-skeleton"/></div>;
  if(load.status==="failed"&&!load.data.length)return <p className="p-notice failed">{failure} <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>;
  return <>{load.status==="failed"&&<p className="p-notice failed">{failure} Showing the last loaded results. <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>}{load.data.length?children:<p className="empty">{empty}</p>}</>;
}

function NicheDetail({view,onBack}:{view:NicheView;onBack:()=>void;onRefresh:()=>void;refreshing:boolean}){
  /* Favorites first. It is the ordering Etsy will not give anyone, which is
     the reason to be on this page instead of etsy.com. */
  const [sort,setSort]=useState<KeywordOrder>("favorites");
  const [shown,setShown]=useState(60);
  /*
    D1789 · PRODUCT TYPE, BECAUSE "BACHELORETTE" IS MOSTLY CONFETTI.

    Measured live: the top fifty for bachelorette priced at $4-$25, and the
    recurring words were favors, decor, confetti, temporary and tattoos. All
    true, all about a party-supplies business, and for a seller printing
    shirts the price band was worse than useless because it looked like an
    answer. Etsy's search takes a taxonomy filter; this is it.
  */
  const [shelf,setShelf]=useState("");
  const [shelves,setShelves]=useState<Array<{label:string}>>([]);
  useEffect(()=>{void fetch("/api/market-watch/shelves")
    .then(response=>response.ok?response.json() as Promise<{shelves?:Array<{label:string}>}>:null)
    .then(body=>setShelves(body?.shelves??[])).catch(()=>undefined)},[]);
  const [section,setSection]=useState<"search"|"saved">("search");
  const [entries,setEntries]=useState<CollectionEntry[]>([]);
  const [collectionLoading,setCollectionLoading]=useState(true);
  const [collectionBusy,setCollectionBusy]=useState(false);
  const [collectionError,setCollectionError]=useState("");
  const [collectionSort,setCollectionSort]=useState<ListingOrder>("favorites");
  const [collectionCurrency,setCollectionCurrency]=useState("");
  const collectionRequest=useRef(false);
  const collectionUrl=`/api/market-watch/collection?key=${encodeURIComponent(view.key)}`;
  const loadCollection=useCallback(async()=>{
    setCollectionLoading(true);setCollectionError("");
    try{const response=await fetch(collectionUrl);const body=await response.json() as {entries?:CollectionEntry[];error?:string};if(!response.ok)throw new Error(body.error||"Saved comparisons could not load.");setEntries(body.entries??[]);}
    catch(e){setCollectionError(e instanceof Error?e.message:"Saved comparisons could not load.");}
    finally{setCollectionLoading(false);}
  },[collectionUrl]);
  useEffect(()=>{void loadCollection()},[loadCollection]);
  const updateCollection=async(action:"save"|"remove"|"refresh",listingId?:number)=>{
    if(collectionRequest.current)return;collectionRequest.current=true;setCollectionBusy(true);setCollectionError("");
    try{const response=await fetch(collectionUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,listingId})});const body=await response.json() as {entries?:CollectionEntry[];error?:string};if(!response.ok)throw new Error(body.error||"The collection update could not be confirmed.");setEntries(body.entries??[]);}
    catch(e){setCollectionError(e instanceof Error?e.message:"The collection update could not be confirmed. Reload before trying again.");}
    finally{collectionRequest.current=false;setCollectionBusy(false);}
  };
  const [query,setQuery]=useState("");
  const [search,setSearch]=useState("");
  const [rows,setRows]=useState<Listing[]>([]);
  const [total,setTotal]=useState<number|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const active=useRef<AbortController|null>(null);
  /*
    THE SCAN HAPPENS ONCE. SORTING IS FREE AFTER THAT.

    `sort` is deliberately not a dependency here. The whole scanned set is
    held in memory, so changing the ordering re-ranks what is already loaded
    instead of spending another ten Etsy calls to ask the same question in a
    different order - which is what made re-sorting expensive enough to be
    handed back to Etsy, and Etsy cannot sort by the fields that matter.
  */
  const load=useCallback(async()=>{
    active.current?.abort();
    const controller=new AbortController();active.current=controller;
    setLoading(true);setError("");setRows([]);setTotal(null);setProfile(null);setShown(60);
    try{
      const params=new URLSearchParams({key:view.key,sort:"favorites",query:search,...(shelf?{shelf}:{})});
      const response=await fetch(`/api/market-watch/listings?${params}`,{signal:controller.signal});
      const body=await response.json() as {listings?:Listing[];profile?:Profile;total?:number|null;error?:string};
      if(!response.ok)throw new Error(body.error||"Etsy search could not load.");
      if(controller.signal.aborted)return;
      setRows(body.listings??[]);setTotal(body.total??null);setProfile(body.profile??null);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Etsy search could not load.");}
    finally{if(active.current===controller){active.current=null;setLoading(false);}}
  },[view.key,search,shelf]);
  useEffect(()=>{void load();return()=>{active.current?.abort();active.current=null}},[load]);
  /* If the scan came back with no counted units the option is not offered, so
     a sort left over from a previous keyword falls back rather than showing an
     unordered list under a heading that claims an order. */
  const countsExist=rows.some(row=>row.soldUnits!=null);
  const effectiveSort=sort==="sold"&&!countsExist?"favorites":sort;
  const ranked=rankScan(rows,effectiveSort);
  const listings=ranked.slice(0,shown);
  const savedIds=new Set(entries.map(entry=>entry.listing.listingId));
  const collectionCurrencies=[...new Set(entries.map(entry=>entry.listing.currency))].sort();
  const compared=browseListings(entries.map(entry=>entry.listing),collectionSort,"",collectionCurrency);
  const entryById=new Map(entries.map(entry=>[entry.listing.listingId,entry]));
  return <main className="mw"><button className="back p-button p-button-quiet" onClick={onBack}>← Tracked keywords</button><header className="mw-detail-head"><p className="mini-label">MARKET WATCH</p><h1>{view.phrase}</h1></header>
    <div className="tabs p-tabs" role="tablist" aria-label="Keyword research"><button className="p-tab" role="tab" id="keyword-search-tab" aria-controls="keyword-search-panel" aria-selected={section==="search"} onClick={()=>setSection("search")}>Search Etsy</button><button className="p-tab" role="tab" id="keyword-saved-tab" aria-controls="keyword-saved-panel" aria-selected={section==="saved"} onClick={()=>setSection("saved")}>Saved comparisons{collectionLoading?"":` (${entries.length})`}</button></div>
    {collectionError&&<p className="p-notice failed" role="alert">{collectionError} <button className="p-button p-button-quiet" disabled={collectionBusy||collectionLoading} onClick={()=>void loadCollection()}>Reload collection</button></p>}
    {section==="search"&&<section id="keyword-search-panel" role="tabpanel" aria-labelledby="keyword-search-tab">
    <form className="market-browser-controls" onSubmit={event=>{event.preventDefault();if(search===query.trim())void load();else setSearch(query.trim())}}>
      <label className="market-search">Search within this keyword<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a product or phrase"/></label>
      {shelves.length>0&&<label className="market-shelf">Product type<select value={shelf} onChange={e=>setShelf(e.target.value)}>
        <option value="">Every product type</option>
        {shelves.map(entry=><option key={entry.label} value={entry.label}>{entry.label}</option>)}
      </select></label>}
      <button className="p-button p-button-primary" disabled={loading}>Search Etsy</button>
      {(query||search)&&<button type="button" className="p-button p-button-quiet" onClick={()=>{setQuery("");setSearch("")}}>Clear search</button>}
      {/* D1812 · It was a lone right-aligned button on a line of its own under
          the card it belongs to. */}
      <button type="button" className="p-button p-button-quiet" disabled={loading} onClick={()=>void load()}>Refresh listings</button>
    </form>
    {/* D1785 · The scan reads ten pages of Etsy and takes several seconds. It
    used to spend them behind one short line above an empty space, which at
    eight to sixteen seconds is indistinguishable from a page that has
    failed. It says how long it will be, and the space below holds its
    shape while it waits. */}
    <div className="market-result-bar"><p role="status">{loading&&!rows.length?`Reading Etsy for “${view.phrase}”. This takes a few seconds.`:""}</p></div>
    {profile&&<WinnerProfile profile={profile} shelf={shelf}/>}
    {/* D1783 · A sort that returns nothing is worse than a sort that is not
    there. Units are counted from the difference between two readings of a
    listing's quantity, so a phrase scanned for the first time has none yet -
    and the option only appears once something in this scan actually has a
    count behind it. */}
    <div className="market-results-sort"><label>Sort by<select value={sort} onChange={e=>{setSort(e.target.value as KeywordOrder);setShown(60)}}>{rows.some(row=>row.soldUnits!=null)&&<option value="sold">Units counted sold</option>}<option value="favorites">Most favorited</option><option value="views">Most viewed</option><option value="momentum">Favorites per day listed</option><option value="newest">Recently listed / renewed</option><option value="relevance">Etsy’s relevance order</option><option value="price">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label></div>
    {error&&<p className="p-notice failed" role="alert">{error} <button className="p-button p-button-quiet" disabled={loading} onClick={()=>void load()}>Try again</button></p>}
    {!loading&&!error&&!listings.length&&<p className="empty">No Etsy listings match this search.</p>}
    <div className="cards" aria-busy={loading}>{loading&&!rows.length&&Array.from({length:6},(_unused,index)=><div className="listing-skeleton" key={index} aria-hidden="true"><span/><div><i/><i/></div></div>)}{listings.map(listing=><ListingCard key={listing.listingId} listing={listing} action={<button className="p-button p-button-quiet" disabled={collectionLoading||collectionBusy||Boolean(collectionError)||savedIds.has(listing.listingId)} onClick={()=>void updateCollection("save",listing.listingId)}>{savedIds.has(listing.listingId)?"Saved":"Compare"}</button>}/>)}</div>
    {shown<ranked.length&&<div className="market-pagination"><button className="p-button p-button-primary" onClick={()=>setShown(count=>count+60)}>Show more listings</button></div>}
    </section>}
    {section==="saved"&&<section className="keyword-collection" id="keyword-saved-panel" role="tabpanel" aria-labelledby="keyword-saved-tab">
      <div className="market-result-bar"><div><h2>Saved comparisons</h2>{entries.length>0&&<p>{entries.length} of 100 saved</p>}</div><button className="p-button p-button-primary" disabled={collectionLoading||collectionBusy||!entries.length||Boolean(collectionError)} onClick={()=>void updateCollection("refresh")}>{collectionBusy?"Updating…":"Check for changes"}</button></div>
      {collectionLoading?<p role="status">Loading saved comparisons…</p>:!entries.length&&!collectionError?<p className="empty">Save listings from Search Etsy to compare them here and follow changes in their favorites, views, and prices.</p>:null}
      {entries.length>0&&<>
        <div className="market-results-sort">{collectionCurrencies.length>1&&<label>Currency<select value={collectionCurrency} onChange={e=>{setCollectionCurrency(e.target.value);if(!e.target.value&&(collectionSort==="price"||collectionSort==="price-desc"))setCollectionSort("favorites")}}><option value="">All currencies</option>{collectionCurrencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}<label>Sort saved listings<select value={collectionSort} onChange={e=>setCollectionSort(e.target.value as ListingOrder)}><option value="favorites">Highest favorites</option><option value="views">Highest views</option><option value="newest">Newest original listing</option><option value="price" disabled={!collectionCurrency&&collectionCurrencies.length>1}>Price: low to high</option><option value="price-desc" disabled={!collectionCurrency&&collectionCurrencies.length>1}>Price: high to low</option></select></label></div>
        <div className="cards">{compared.map(listing=>{const entry=entryById.get(listing.listingId)!;return <ListingCard key={listing.listingId} listing={listing} action={<button className="p-button p-button-quiet" disabled={collectionBusy||collectionLoading} onClick={()=>void updateCollection("remove",listing.listingId)}>Remove from comparisons</button>} extra={<CompetitorChange entry={entry}/>}/>})}</div>
        {/*
          D1812 · THE MARGIN CALCULATOR IS OFF MARKET WATCH.

          Nine cost fields to fill by hand, a Printify product link to paste,
          a production-cost currency to confirm from a dropdown, a variant
          table and eight paragraphs of caveats - behind an accordion, on the
          saved-comparisons tab of a research tool. It asked the seller to
          type in her Etsy fee rates, which /api/seller-preferences already
          holds, and to paste a Printify link, when the Listing Factory is
          already connected to that Printify account.

          It is a pricing tool. Research is not where a price gets set, and
          when it is rebuilt it should read what this product already knows
          instead of asking for it again. The component and its arithmetic
          stay in the tree; nothing on Market Watch mounts them.
        */}
      </>}
    </section>}
  </main>;
}


/*
  WHAT THE TOP FIFTY LOOK LIKE.

  Every sentence is a description of fifty listings. None of them says "do
  this", because nothing in this data supports that: Etsy ranks its own search
  partly on titles, so a word common among the winners may be a fact about
  Etsy rather than about buyers. It is offered as subject matter to weigh, and
  the heading says so rather than leaving the reader to assume otherwise.
*/
/*
  WHAT THE MEMBER WOULD KEEP AT THOSE PRICES.

  The band is what the market charges. It is not what a seller earns, and the
  gap between the two is where print-on-demand businesses quietly fail: a
  shirt priced inside a healthy-looking band, on a blank that costs too much,
  after Etsy's cut, can clear less than a dollar.

  Nobody else can put this number on the page. Etsy knows its own fees and not
  the production cost; Printify knows the production cost and not Etsy's fees;
  a research tool knows neither. This product holds both, and the arithmetic
  is exactly the arithmetic the Listing Factory already prices batches with -
  the member's own saved fee settings, not an assumed rate.
*/
/*
  D1811 · THE PRICING CALCULATOR IS GONE FROM RESEARCH.

  Market Watch answers what is selling in a search. Half way down that answer
  sat an input asking for the member's unit cost and a table of what they
  would earn at three prices - a pricing decision, unasked for, in the middle
  of a research read. It was also three floating pieces with a dead column:
  "If you priced here" at the bottom left, the cost input in the middle, the
  table on the right, and a third of the panel empty.

  What a seller would take home belongs where they are setting a price, not
  where they are looking at what other people sell. The price band stays; it
  is a fact about the search.
*/
/*
  D1812 · ONE UNIT FOR AGE.

  The profile said "25 mo" and the listing beneath it said "4936 days" for the
  same idea. Thirteen and a half years, written as four digits of days, is a
  number a reader has to do arithmetic on before it means anything.
*/
export function listedFor(days:number|null|undefined){
  if(days==null)return "Unavailable";
  if(days<60)return `${days} ${days===1?"day":"days"}`;
  if(days<730)return `${Math.round(days/30)} mo`;
  const years=days/365;
  return `${years<10?years.toFixed(1):Math.round(years)} yr`;
}

function WinnerProfile({profile,shelf}:{profile:Profile;shelf:string}){
  /*
    NUMBERS LEAD. THE EXPLANATION LIVES HERE, NOT ON THE PAGE.

    This panel used to be five full sentences and a two-line disclaimer -
    "Half of them sit between $14 and $27, against $24 across everything
    scanned", "The middle one was first listed 24 months ago". Every word was
    true and the result was a wall a seller had to read end to end before
    knowing anything, with nothing for the eye to land on.

    A figure and a two-word label says the same thing in a glance. Where a
    caveat is genuinely load-bearing - a band taken across every product type
    is a band across different businesses - it is a chip beside the number
    rather than a clause appended to a sentence.
  */
  const money=(cents:number)=>`$${(cents/100).toFixed(0)}`;
  const share=(value:number)=>`${Math.round(value*100)}%`;
  type Stat={label:string;value:string;note?:string;warn?:boolean};
  const stats:Stat[]=[];
  if(profile.currency==="USD"&&profile.priceBand)
    stats.push({label:"Middle half",value:`${money(profile.priceBand.low)}–${money(profile.priceBand.high)}`,
      note:shelf?undefined:"every product type",warn:!shelf});
  if(profile.ageMedianDays!=null)
    stats.push({label:"Median age",value:listedFor(profile.ageMedianDays)});
  if(profile.personalisedShare!=null)
    stats.push({label:"Personalised",value:share(profile.personalisedShare)});
  if(profile.provenShopShare!=null)
    stats.push({label:"From proven shops",value:share(profile.provenShopShare),note:"1,000+ lifetime sales"});
  if(profile.blanks.length)
    stats.push({label:"Printed on",value:profile.blanks[0].label,
      note:`${profile.blanks[0].winners} of ${profile.sampleSize}`
        +(profile.blanks.length>1?`, then ${profile.blanks[1].label}`:"")});
  if(!stats.length&&!profile.subjects.length)return null;
  return <section className="winner-profile">
    <h2>What the top {profile.sampleSize} have in common</h2>
    {stats.length>0&&<dl className="winner-stats">
      {stats.map(stat=><div key={stat.label}>
        <dt>{stat.label}</dt>
        <dd>{stat.value}</dd>
        {stat.note&&<span className={stat.warn?"winner-stat-note warn":"winner-stat-note"}>{stat.note}</span>}
      </div>)}
    </dl>}
    {profile.subjects.length>0&&<div className="winner-profile-subjects">
      <h3>Words in their titles</h3>
      {/*
        D1812 · THE WORD LIST HANDED OVER "DISNEY" WITH NO WAY TO CHECK IT.

        Measured live on "halloween": season, spooky, crochet, movie, skeleton
        - and disney. These are observed words, not cleared ones, and this
        product sells a trademark checker two links down the rail that had no
        connection to them. Each word now opens that checker already filled
        in, which costs the seller one click and costs this panel no words.
      */}
      <ul>{profile.subjects.map(entry=><li key={entry.word}>
        <a href={`/trademark?phrase=${encodeURIComponent(entry.word)}`}
           title={`Check "${entry.word}" for trademarks`}>
          <b>{entry.word}</b><span>{entry.winners}</span></a></li>)}</ul>
    </div>}
  </section>;
}

function ListingCard({listing,action,extra}:{listing:Listing;action?:ReactNode;extra?:ReactNode}){return <article className="card">
  {listing.imageUrl && listing.displayFresh?<img src={listing.imageUrl} alt={listing.title} loading="lazy" width={570} height={570}/>:<p className="no-image">{listing.imageUrl ? "Photo needs refreshing" : "Photo unavailable from Etsy"}</p>}
  <div className="body"><div className="listing-price-row"><strong>{money(listing)}</strong>{!listing.displayFresh&&<span>Saved details</span>}</div><h2 className="title">{listing.title}</h2><dl className="listing-stat-grid">{/* Counted, not estimated. Absent until a listing has been read twice, and
    shown with the window it was counted over, because three units over four
    hours and three over three weeks are different findings. */}{listing.soldUnits!=null&&<div className="listing-stat-counted"><dt>Units counted sold</dt><dd>{listing.soldUnits}<small>{listing.soldHours!=null?` over ${listing.soldHours>=48?`${Math.round(listing.soldHours/24)} days`:`${listing.soldHours} hours`} watched`:""}</small></dd></div>}<div><dt>Total favorites</dt><dd>{listing.favorites??"Unavailable"}</dd></div><div><dt>Total views</dt><dd>{listing.views??"Unavailable"}</dd></div>{/* D1810 · "Listed / renewed" printed the same date on all fifty rows. Etsy's
    creation_timestamp moves on renewal, so on a live search it is usually
    today for everything and tells a seller nothing, beside an Original age
    that is genuinely different for every listing. The field still orders the
    newest sort; it is not a column. */}<div><dt>Listed for</dt><dd>{listedFor(listing.ageDays)}</dd></div></dl>
    {listing.intervals>0&&<p className="listing-evidence">Activity observed on {listing.intervals} occasion{listing.intervals===1?"":"s"} in the last 30 days{listing.confirmedAt?` · latest ${new Date(listing.confirmedAt*1000).toLocaleDateString()}`:""}.</p>}
    {extra}
  </div>{action?<div className="research-card-actions">{action}<a href={listing.etsyUrl} target="_blank" rel="noreferrer noopener">View on Etsy ↗</a></div>:<a href={listing.etsyUrl} target="_blank" rel="noreferrer noopener">View on Etsy ↗</a>}
  </article>}

function CompetitorChange({entry}:{entry:CollectionEntry}){
 const changes=competitorChanges(entry);
 const signed=(n:number|null)=>n===null?"Unavailable":`${n>0?"+":""}${n.toLocaleString()}`;
 return <div className="competitor-changes"><p>Saved {new Date(entry.savedAt*1000).toLocaleDateString()} · Checked {new Date(entry.checkedAt*1000).toLocaleString()}</p>{entry.unavailable?<p role="status">Etsy could not return this listing. Showing its last saved details.</p>:entry.checkedAt<=entry.savedAt?<p>Changes will appear after your next check.</p>:<><strong>Change since saved</strong><dl className="listing-stat-grid"><div><dt>Favorites</dt><dd>{signed(changes.favorites)}</dd></div><div><dt>Views</dt><dd>{signed(changes.views)}</dd></div><div><dt>Price</dt><dd>{changes.priceCents===null?"Unavailable":changes.priceCents===0?"Unchanged":`${changes.priceCents>0?"+":"−"}${new Intl.NumberFormat(undefined,{style:"currency",currency:entry.listing.currency}).format(Math.abs(changes.priceCents)/100)}`}</dd></div></dl></>}</div>;
}

function ShopCard({shop}:{shop:ShopView}){
  const [section,setSection]=useState<"listings"|"reviews"|"changes"|"notes">("listings");
  const [listings,setListings]=useState<Listing[]>([]);
  const [loading,setLoading]=useState(false);
  const [loadingAll,setLoadingAll]=useState(false);
  const [listingError,setListingError]=useState("");
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [retryOffset,setRetryOffset]=useState(0);
  const [total,setTotal]=useState<number|null>(null);
  /* Favorites, because it is the ordering Etsy gives nobody and the reason to
     look at a competitor's catalog here rather than on their shop page. */
  const [sort,setSort]=useState<ListingOrder>("favorites");
  const [query,setQuery]=useState("");
  const [currency,setCurrency]=useState("");
  const activeRequest=useRef<AbortController|null>(null);
  const currencies=[...new Set(listings.map(l=>l.currency||"USD"))].sort();
  useEffect(()=>{if(!currency&&currencies.length>1&&(sort==="price"||sort==="price-desc"))setSort("newest")},[currency,currencies.length,sort]);
  const visibleListings=browseListings(listings,sort,query,currency);
  const loadListings=async(offset=0,all=false)=>{
    if(activeRequest.current)return;
    const controller=new AbortController();activeRequest.current=controller;
    setLoading(true);setLoadingAll(all);setListingError("");
    let cursor:number|null=offset;
    try{
      do{
        const response=await fetch(`/api/shop-watch/listings?shop=${shop.shopId}&offset=${cursor}${all?"&limit=100":""}`,{signal:controller.signal});
        const payload=await response.json() as {listings?:Listing[];error?:string;stale?:boolean;nextOffset?:number|null;total?:number|null};
        if(!response.ok)throw new Error(payload.error||"Listings could not load.");
        if(controller.signal.aborted)break;
        const first=cursor===0;
        setListings(old=>first?payload.listings??[]:[...new Map([...old,...(payload.listings??[])].map(l=>[l.listingId,l])).values()]);
        setTotal(payload.total??null);setNextOffset(payload.nextOffset??null);
        if(payload.stale){setListingError("Etsy could not refresh these listings. Showing saved results.");break;}
        const next=payload.nextOffset??null;
        if(next!==null&&next<=cursor)throw new Error("More listings could not be loaded. Try again.");
        cursor=next;
      }while(all&&cursor!==null&&!controller.signal.aborted);
    }catch(error){if(!controller.signal.aborted){setRetryOffset(cursor??offset);setListingError(error instanceof Error?error.message:"Listings could not load.");}}
    finally{if(activeRequest.current===controller){activeRequest.current=null;setLoading(false);setLoadingAll(false);}}
  };
  useEffect(()=>{void loadListings();return()=>{activeRequest.current?.abort();activeRequest.current=null}},[shop.shopId]);
  const sections:Array<[string,ShopPattern[]]>=[["Listings buyers reviewed",shop.gettingAttention??[]],["What buyers tell you to make",shop.whatBuyersLove??[]],["Problems buyers keep raising",shop.whatBuyersDislike??[]],["Shop changes",shop.whatChanged??[]]];
  const visibleSections=sections.filter(([name])=>section==="changes"?name==="Shop changes":name!=="Shop changes");
  const anything=visibleSections.some(([,cards])=>cards.length);
  return <section className="shop"><header className="mw-detail-head"><p className="mini-label">TRACKED SHOP</p><div className="shop-watch-heading"><h1 className="shop-name">{shop.shopName}</h1><a href={shop.etsy} target="_blank" rel="noopener noreferrer">Open shop on Etsy ↗</a></div></header>
    <div className="tabs p-tabs shop-detail-tabs" role="tablist" aria-label={`${shop.shopName} sections`}>{([["listings","Active listings"],["reviews","Buyer feedback"],["changes","Shop changes"],["notes","My notes"]] as const).map(([key,label])=><button key={key} id={`shop-tab-${key}`} className="p-tab" role="tab" aria-selected={section===key} aria-controls="shop-detail-panel" onClick={()=>setSection(key)}>{label}</button>)}</div>
    <div id="shop-detail-panel" role="tabpanel" aria-labelledby={`shop-tab-${section}`}>
    {section==="listings"&&<div className="shop-listing-browser" id="shop-catalog-controls">
      <ListingControls sort={sort} setSort={setSort} query={query} setQuery={setQuery} currency={currency} setCurrency={setCurrency} currencies={currencies}/>
      {/* D1810 · One row. The count lived here and again under the cards, and
          the two buttons were right-aligned on separate lines below it. */}
      <div className="market-result-bar">
        <p role="status">{total===null?"Loading the shop’s catalog…":query||currency?`${visibleListings.length} of ${listings.length} loaded listings match your filters`:""}</p>
        <div className="market-result-actions">
          <button className="p-button p-button-quiet" onClick={()=>void loadListings()} disabled={loading}>{loading&&!loadingAll?"Loading listings…":"Refresh active listings"}</button>
          {nextOffset!==null&&!loadingAll&&<button type="button" className="p-button p-button-quiet" disabled={loading} onClick={()=>void loadListings(nextOffset,true)}>Load full catalog</button>}
          {loadingAll&&<button type="button" className="p-button p-button-quiet" onClick={()=>activeRequest.current?.abort()}>Stop loading</button>}
        </div>
      </div>
      {listingError&&<p role="alert">{listingError} <button className="p-button p-button-quiet" onClick={()=>void loadListings(retryOffset)} disabled={loading}>Try again</button></p>}
      {loading&&!listings.length&&<p role="status">Loading this shop’s active listings…</p>}
      {!loading&&!listings.length&&!listingError&&<p className="empty">No active listings are available from Etsy.</p>}
      {listings.length>0&&!visibleListings.length&&<p className="empty">No loaded listings match these filters. Clear the search or change the currency{nextOffset!==null?", or load more of the shop’s catalog":""}.</p>}
      <div className="cards">{visibleListings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div>
      {listings.length>0&&<div className="market-pagination">{nextOffset!==null&&<button type="button" className="p-button p-button-primary" disabled={loading} onClick={()=>void loadListings(nextOffset??0)}>{loading?"Loading more listings…":"Load more listings"}</button>}<span>{listings.length}{total===null?"":` of ${total}`} loaded{loadingAll?" · Loading full catalog…":""}</span><a className="p-button p-button-quiet" href="#shop-catalog-controls">Back to filters ↑</a></div>}
    </div>}
    {(section==="reviews"||section==="changes")&&<>{!anything&&<p className="empty">{section==="reviews"?"No recent review summary is available for this shop. Recorded review counts may still appear on its active listings.":"No shop changes have been recorded yet. Changes appear after repeat checks."}</p>}
    {section==="reviews"&&shop.displayUnavailable&&<p className="p-notice">Etsy could not refresh some listing photos. Review history remains available.</p>}
    {visibleSections.map(([name,cards])=>cards.length?<div className="section" key={name}><h2 className="section-name">{name==="Listings buyers reviewed"?"Products mentioned in buyer reviews":name}</h2>{name==="Listings buyers reviewed"&&<p className="section-note">Review dates show when feedback was posted, not when an item sold.</p>}<div className="shop-pattern-grid">{cards.map((card,index)=><article className={`pattern${card.listing?.imageUrl?" has-listing-photo":""}`} key={`${name}-${index}`}>
      {card.listing?.imageUrl&&<img className="shop-listing-photo" src={card.listing.imageUrl} alt={card.listing.title||"Etsy listing"} loading="lazy" width={570} height={570}/>}
      {/* D1812 · The rest of Market Watch shortens an Etsy title; this section
          printed all twenty-odd words of it. */}
      {card.listing?.title&&<h4>{shortLabel(card.listing.title)}</h4>}
      <p className="pattern-headline">{card.pattern}</p>
      <span className="support">{[card.evidence,card.window].filter(Boolean).join(" · ")}</span>
      {Boolean(card.reviews?.length)&&<details><summary>Read buyer reviews</summary>{card.reviews!.map((review,i)=><blockquote key={i}><p>{review.review}</p><footer className="buyer-review-meta">{review.rating} / 5 · {new Date(review.createdAt*1000).toLocaleDateString()}</footer></blockquote>)}</details>}
      {card.action&&<details className="buyer-idea"><summary>How to use this feedback</summary><p>{card.action.change}</p><p className="cc-note">{card.action.check}</p></details>}
      {card.because&&<details><summary>About this comparison</summary><p className="pattern-because">{card.because}</p></details>}
      {card.listing?.url&&<a href={card.listing.url} target="_blank" rel="noreferrer noopener">{card.listing.id?"View listing on Etsy":"View shop on Etsy"} ↗</a>}
    </article>)}</div></div>:null)}</>}
    {section==="notes"&&<ActionPlan expanded feature="marketWatch" context="shop" source={`shop-${shop.shopId}`} heading={`Offer improvement: ${shop.shopName}`} notes={[...shop.whatBuyersDislike,...shop.whatBuyersLove].filter(c=>c.action).slice(0,3).map(c=>`${c.pattern}
Evidence: ${c.because}
Change to test: ${c.action!.change}
How to check: ${c.action!.check}`).join('\n\n')||`Notes about ${shop.shopName}:\n\nProduct or idea to revisit:\nWhy it matters for my shop:`}/>}</div></section>;
}

function ListingControls({sort,setSort,query,setQuery,currency,setCurrency,currencies}:{sort:ListingOrder;setSort:(v:ListingOrder)=>void;query:string;setQuery:(v:string)=>void;currency:string;setCurrency:(v:string)=>void;currencies:string[]}){
 const mixed=!currency&&currencies.length>1;
 return <div className="market-browser-controls">
   <label className="market-search">Search loaded listings<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a product or phrase"/></label>
   {currencies.length>1&&<label>Currency<select value={currency} onChange={e=>{setCurrency(e.target.value);if(!e.target.value&&(sort==="price"||sort==="price-desc"))setSort("newest")}}><option value="">All currencies</option>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}
   {(query||currency)&&<button type="button" className="p-button p-button-quiet" onClick={()=>{setQuery("");setCurrency("");if(sort==="price"||sort==="price-desc")setSort("newest")}}>Clear filters</button>}
   <ListingSort sort={sort} setSort={setSort} mixed={mixed}/>
   {mixed&&<p className="market-sort-note">Choose a currency to compare prices.</p>}
 </div>;
}

function ListingSort({sort,setSort,mixed}:{sort:ListingOrder;setSort:(value:ListingOrder)=>void;mixed:boolean}){
 return <div className="market-results-sort"><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value as ListingOrder)}><option value="favorites">Most favorited</option><option value="views">Most viewed</option><option value="newest">First listed most recently</option><option value="price" disabled={mixed}>Price: low to high</option><option value="price-desc" disabled={mixed}>Price: high to low</option></select></label></div>;
}
