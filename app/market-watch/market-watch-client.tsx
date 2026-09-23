"use client";

import ActionPlan from "@/app/command-center/action-plan";
import OfferPlanner from "@/app/command-center/offer-planner";
import {competitorChanges,type CollectionEntry} from "@/app/market-collection";
import {rankScan,type KeywordOrder} from "@/app/keyword-scan";
import {confirmAction} from "@/app/confirm-dialog";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {browseListings,type ListingOrder} from "@/app/market-listing-browser";

type Listing = {
  createdAt?:number|null; listedAt?:number|null;
  listingId: number; title: string; imageUrl: string; etsyUrl: string;
  state?: string; label?: string; confirmedAt?: number; intervals: number;
  sold7?: number; sold30?: number; priceCents: number | null; currency: string;
  favorites: number | null; views: number | null; ageDays: number | null;
  reviewsOnThisListing: number|null; displayFresh: boolean;
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
    <header className="mw-intro"><h1>Market Watch</h1><p className="lede">Compare listing photos, prices, favorites, and reviews for the keywords and shops you follow.</p></header>
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
          <div className="keyword-watch-head"><div><h2>{watch.phrase}</h2></div><div className="watch-card-actions"><button type="button" onClick={()=>void openNiche(watch.key)} disabled={Boolean(opening)}>{opening===watch.key?"Opening…":"View listings"}</button><button type="button" className="watch-remove" aria-label={`Stop tracking ${watch.phrase}`} disabled={removing===watch.key} onClick={()=>void stopWatching("niche",watch.key,watch.phrase)}>{removing===watch.key?"Removing…":"Stop tracking"}</button></div></div>
          {watch.stale&&<p className="keyword-stale">Current data could not be refreshed. Showing saved details.</p>}
          <div className="keyword-thumbs">{(watch.listings??[]).slice(0,4).map(listing=>listing.imageUrl&&listing.displayFresh?<img key={listing.listingId} src={listing.imageUrl} alt="" width={180} height={180}/>:<span key={listing.listingId} aria-hidden="true"/>)}{(watch.listings??[]).length===0&&<p>Listings will appear after Etsy refreshes this keyword.</p>}</div>

        </article>)}</div>
      </WatchList>:<WatchList load={shops} onRetry={()=>void loadShops()} failure="Your tracked shops could not be loaded." empty="Add an Etsy shop to follow its listing activity."><p className="watch-explainer">Choose a shop to see its current listings, buyer feedback, and recent changes. Only shops you track appear here, including your own if you added it.</p><div className="tracked-shop-grid">{shops.data.map(shop=><article className="tracked-shop-card" key={shop.shopId}><p className="mini-label">TRACKED SHOP</p><h2>{shop.shopName}</h2><p>Active listings · Buyer feedback · Shop changes</p><div className="watch-card-actions"><button className="p-button p-button-primary" onClick={()=>setSelectedShop(shop)}>Explore shop</button><button type="button" className="watch-remove" aria-label={`Stop tracking ${shop.shopName}`} disabled={removing===String(shop.shopId)} onClick={()=>void stopWatching("shop",shop.shopId,shop.shopName)}>{removing===String(shop.shopId)?"Removing…":"Stop tracking"}</button></div></article>)}</div></WatchList>}
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
    setLoading(true);setError("");setRows([]);setTotal(null);setShown(60);
    try{
      const params=new URLSearchParams({key:view.key,sort:"favorites",query:search});
      const response=await fetch(`/api/market-watch/listings?${params}`,{signal:controller.signal});
      const body=await response.json() as {listings?:Listing[];total?:number|null;error?:string};
      if(!response.ok)throw new Error(body.error||"Etsy search could not load.");
      if(controller.signal.aborted)return;
      setRows(body.listings??[]);setTotal(body.total??null);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Etsy search could not load.");}
    finally{if(active.current===controller){active.current=null;setLoading(false);}}
  },[view.key,search]);
  useEffect(()=>{void load();return()=>{active.current?.abort();active.current=null}},[load]);
  const ranked=rankScan(rows,sort);
  const listings=ranked.slice(0,shown);
  const savedIds=new Set(entries.map(entry=>entry.listing.listingId));
  const collectionCurrencies=[...new Set(entries.map(entry=>entry.listing.currency))].sort();
  const compared=browseListings(entries.map(entry=>entry.listing),collectionSort,"",collectionCurrency);
  const entryById=new Map(entries.map(entry=>[entry.listing.listingId,entry]));
  return <main className="mw"><button className="back p-button p-button-quiet" onClick={onBack}>← Tracked keywords</button><header className="mw-detail-head"><p className="mini-label">MARKET WATCH</p><h1>{view.phrase}</h1><p>Sort matching listings by what buyers actually did.</p></header>
    <div className="tabs p-tabs" role="tablist" aria-label="Keyword research"><button className="p-tab" role="tab" id="keyword-search-tab" aria-controls="keyword-search-panel" aria-selected={section==="search"} onClick={()=>setSection("search")}>Search Etsy</button><button className="p-tab" role="tab" id="keyword-saved-tab" aria-controls="keyword-saved-panel" aria-selected={section==="saved"} onClick={()=>setSection("saved")}>Saved comparisons{collectionLoading?"":` (${entries.length})`}</button></div>
    {collectionError&&<p className="p-notice failed" role="alert">{collectionError} <button className="p-button p-button-quiet" disabled={collectionBusy||collectionLoading} onClick={()=>void loadCollection()}>Reload collection</button></p>}
    {section==="search"&&<section id="keyword-search-panel" role="tabpanel" aria-labelledby="keyword-search-tab">
    <form className="market-browser-controls" onSubmit={event=>{event.preventDefault();if(search===query.trim())void load();else setSearch(query.trim())}}>
      <label className="market-search">Search within this keyword<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a product or phrase"/></label><button className="p-button p-button-primary" disabled={loading}>Search Etsy</button>
      {(query||search)&&<button type="button" className="p-button p-button-quiet" onClick={()=>{setQuery("");setSearch("")}}>Clear search</button>}
    </form>
    <div className="market-result-bar"><p role="status">{loading&&!rows.length?`Searching Etsy for “${view.phrase}”…`:""}</p><button className="p-button p-button-quiet" disabled={loading} onClick={()=>void load()}>Refresh listings</button></div>
    <div className="market-results-sort"><label>Sort by<select value={sort} onChange={e=>{setSort(e.target.value as KeywordOrder);setShown(60)}}><option value="favorites">Most favorited</option><option value="views">Most viewed</option><option value="momentum">Favorites per day listed</option><option value="newest">Recently listed / renewed</option><option value="relevance">Etsy’s relevance order</option><option value="price">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label></div>
    {error&&<p className="p-notice failed" role="alert">{error} <button className="p-button p-button-quiet" disabled={loading} onClick={()=>void load()}>Try again</button></p>}
    {!loading&&!error&&!listings.length&&<p className="empty">No Etsy listings match this search.</p>}
    <div className="cards" aria-busy={loading}>{listings.map(listing=><ListingCard key={listing.listingId} listing={listing} action={<button className="p-button p-button-quiet" disabled={collectionLoading||collectionBusy||Boolean(collectionError)||savedIds.has(listing.listingId)} onClick={()=>void updateCollection("save",listing.listingId)}>{savedIds.has(listing.listingId)?"Saved to comparisons":"Save to compare"}</button>}/>)}</div>
    {shown<ranked.length&&<div className="market-pagination"><button className="p-button p-button-primary" onClick={()=>setShown(count=>count+60)}>Show more listings</button></div>}
    </section>}
    {section==="saved"&&<section className="keyword-collection" id="keyword-saved-panel" role="tabpanel" aria-labelledby="keyword-saved-tab">
      <div className="market-result-bar"><div><h2>Saved comparisons</h2><p>{entries.length} of 100 listings · Chosen by you</p></div><button className="p-button p-button-primary" disabled={collectionLoading||collectionBusy||!entries.length||Boolean(collectionError)} onClick={()=>void updateCollection("refresh")}>{collectionBusy?"Updating…":"Check for changes"}</button></div>
      {collectionLoading?<p role="status">Loading saved comparisons…</p>:!entries.length&&!collectionError?<p className="empty">Save listings from Search Etsy to compare them here and follow changes in their favorites, views, and prices.</p>:null}
      {entries.length>0&&<>
        <div className="market-results-sort">{collectionCurrencies.length>1&&<label>Currency<select value={collectionCurrency} onChange={e=>{setCollectionCurrency(e.target.value);if(!e.target.value&&(collectionSort==="price"||collectionSort==="price-desc"))setCollectionSort("favorites")}}><option value="">All currencies</option>{collectionCurrencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}<label>Sort saved listings<select value={collectionSort} onChange={e=>setCollectionSort(e.target.value as ListingOrder)}><option value="favorites">Highest favorites</option><option value="views">Highest views</option><option value="newest">Newest original listing</option><option value="price" disabled={!collectionCurrency&&collectionCurrencies.length>1}>Price: low to high</option><option value="price-desc" disabled={!collectionCurrency&&collectionCurrencies.length>1}>Price: high to low</option></select></label></div>
        <div className="cards">{compared.map(listing=>{const entry=entryById.get(listing.listingId)!;return <ListingCard key={listing.listingId} listing={listing} action={<button className="p-button p-button-quiet" disabled={collectionBusy||collectionLoading} onClick={()=>void updateCollection("remove",listing.listingId)}>Remove from comparisons</button>} extra={<CompetitorChange entry={entry}/>}/>})}</div>
        <OfferPlanner key={view.key} source={view.key} phrase={view.phrase} listings={entries.map(entry=>entry.listing)}/>
      </>}
    </section>}
  </main>;
}

function ListingCard({listing,action,extra}:{listing:Listing;action?:ReactNode;extra?:ReactNode}){return <article className="card">
  {listing.imageUrl && listing.displayFresh?<img src={listing.imageUrl} alt={listing.title} loading="lazy" width={570} height={570}/>:<p className="no-image">{listing.imageUrl ? "Photo needs refreshing" : "Photo unavailable from Etsy"}</p>}
  <div className="body"><div className="listing-price-row"><strong>{money(listing)}</strong>{!listing.displayFresh&&<span>Saved details</span>}</div><h2 className="title">{listing.title}</h2><dl className="listing-stat-grid"><div><dt>Total favorites</dt><dd>{listing.favorites??"Unavailable"}</dd></div><div><dt>Total views</dt><dd>{listing.views??"Unavailable"}</dd></div>{listing.listedAt!==undefined&&<div><dt>Listed / renewed</dt><dd>{listing.listedAt?new Date(listing.listedAt*1000).toLocaleDateString():"Unavailable"}</dd></div>}<div><dt>Original age</dt><dd>{listing.ageDays==null?"Unavailable":`${listing.ageDays} ${listing.ageDays===1?"day":"days"}`}</dd></div></dl>
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
      <div className="market-result-bar"><p role="status">{listings.length}{total===null?"":` of ${total}`} listings loaded{query||currency?` · ${visibleListings.length} match your filters`:""}</p><button className="p-button p-button-quiet" onClick={()=>void loadListings()} disabled={loading}>{loading&&!loadingAll?"Loading listings…":"Refresh active listings"}</button></div>
      <div className="market-catalog-scope"><p>{total===null?"Loading the shop’s catalog…":""}</p>{nextOffset!==null&&!loadingAll&&<button type="button" className="p-button p-button-quiet" disabled={loading} onClick={()=>void loadListings(nextOffset,true)}>Load full catalog</button>}{loadingAll&&<button type="button" className="p-button p-button-quiet" onClick={()=>activeRequest.current?.abort()}>Stop loading</button>}</div>
      {listingError&&<p role="alert">{listingError} <button className="p-button p-button-quiet" onClick={()=>void loadListings(retryOffset)} disabled={loading}>Try again</button></p>}
      {loading&&!listings.length&&<p role="status">Loading this shop’s active listings…</p>}
      {!loading&&!listings.length&&!listingError&&<p className="empty">No active listings are available from Etsy.</p>}
      {listings.length>0&&!visibleListings.length&&<p className="empty">No loaded listings match these filters. Clear the search or change the currency{nextOffset!==null?", or load more of the shop’s catalog":""}.</p>}
      <ListingSort sort={sort} setSort={setSort} mixed={!currency&&currencies.length>1}/>
      <div className="cards">{visibleListings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div>
      {listings.length>0&&<div className="market-pagination">{nextOffset!==null&&<button type="button" className="p-button p-button-primary" disabled={loading} onClick={()=>void loadListings(nextOffset??0)}>{loading?"Loading more listings…":"Load more listings"}</button>}<span>{listings.length}{total===null?"":` of ${total}`} loaded{loadingAll?" · Loading full catalog…":""}</span><a className="p-button p-button-quiet" href="#shop-catalog-controls">Back to filters ↑</a></div>}
    </div>}
    {(section==="reviews"||section==="changes")&&<>{!anything&&<p className="empty">{section==="reviews"?"No recent review summary is available for this shop. Recorded review counts may still appear on its active listings.":"No shop changes have been recorded yet. Changes appear after repeat checks."}</p>}
    {section==="reviews"&&shop.displayUnavailable&&<p className="p-notice">Etsy could not refresh some listing photos. Review history remains available.</p>}
    {visibleSections.map(([name,cards])=>cards.length?<div className="section" key={name}><h2 className="section-name">{name==="Listings buyers reviewed"?"Products mentioned in buyer reviews":name}</h2>{name==="Listings buyers reviewed"&&<p className="section-note">Review dates show when feedback was posted, not when an item sold.</p>}<div className="shop-pattern-grid">{cards.map((card,index)=><article className={`pattern${card.listing?.imageUrl?" has-listing-photo":""}`} key={`${name}-${index}`}>
      {card.listing?.imageUrl&&<img className="shop-listing-photo" src={card.listing.imageUrl} alt={card.listing.title||"Etsy listing"} loading="lazy" width={570} height={570}/>}
      {card.listing?.title&&<h4>{card.listing.title}</h4>}
      <p className="pattern-headline">{card.pattern}</p>
      <span className="support">{card.evidence}{card.window?` · ${card.window}`:""}</span>
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
   {mixed&&<p className="market-sort-note">Choose a currency to compare prices.</p>}
 </div>;
}

function ListingSort({sort,setSort,mixed}:{sort:ListingOrder;setSort:(value:ListingOrder)=>void;mixed:boolean}){
 return <div className="market-results-sort"><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value as ListingOrder)}><option value="favorites">Most favorited</option><option value="views">Most viewed</option><option value="newest">First listed most recently</option><option value="price" disabled={mixed}>Price: low to high</option><option value="price-desc" disabled={mixed}>Price: high to low</option></select></label></div>;
}
