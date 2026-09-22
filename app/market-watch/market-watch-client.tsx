"use client";

import ActionPlan from "@/app/command-center/action-plan";
import OfferPlanner from "@/app/command-center/offer-planner";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {browseListings,type ListingOrder} from "@/app/market-listing-browser";

type Listing = {
  createdAt?:number|null;
  listingId: number; title: string; imageUrl: string; etsyUrl: string;
  state: string; label: string; confirmedAt: number; intervals: number;
  sold7: number; sold30: number; priceCents: number | null; currency: string;
  favorites: number | null; views: number | null; ageDays: number | null;
  reviewsOnThisListing: number; displayFresh: boolean;
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
  const openNiche=async(key:string)=>{setError("");setOpening(key);try{const response=await fetch(`/api/market-watch/niches?key=${encodeURIComponent(key)}`),body=await response.json() as NicheView&{error?:string};if(!response.ok)setError(body.error??"Those listings could not be opened.");else setOpen(body)}catch{setError("Those listings could not be opened.")}finally{setOpening("")}};
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
          <div className="keyword-watch-head"><div><h2>{watch.phrase}</h2></div><button type="button" onClick={()=>void openNiche(watch.key)} disabled={Boolean(opening)}>{opening===watch.key?"Opening…":"View listings"}</button></div>
          {watch.stale&&<p className="keyword-stale">Current data could not be refreshed. Showing saved details.</p>}
          <div className="keyword-thumbs">{(watch.listings??[]).slice(0,4).map(listing=>listing.imageUrl&&listing.displayFresh?<img key={listing.listingId} src={listing.imageUrl} alt="" width={180} height={180}/>:<span key={listing.listingId} aria-hidden="true"/>)}{(watch.listings??[]).length===0&&<p>Listings will appear after Etsy refreshes this keyword.</p>}</div>

        </article>)}</div>
      </WatchList>:<WatchList load={shops} onRetry={()=>void loadShops()} failure="Your tracked shops could not be loaded." empty="Add an Etsy shop to follow its listing activity."><p className="watch-explainer">Choose a shop to see its current listings, buyer feedback, and recent changes. Only shops you track appear here, including your own if you added it.</p><div className="tracked-shop-grid">{shops.data.map(shop=><article className="tracked-shop-card" key={shop.shopId}><p className="mini-label">TRACKED SHOP</p><h2>{shop.shopName}</h2><p>Active listings · Buyer feedback · Shop changes</p><button className="p-button p-button-primary" onClick={()=>setSelectedShop(shop)}>Explore shop</button></article>)}</div></WatchList>}
    </div>
  </main>;
}

function WatchList({load,onRetry,failure,empty,children}:{load:{status:"loading"|"ready"|"failed";data:unknown[]};onRetry:()=>void;failure:string;empty:string;children:ReactNode}){
  if(load.status==="loading"&&!load.data.length)return <div className="watch-wait" aria-label="Loading"><span className="p-skeleton"/><span className="p-skeleton"/></div>;
  if(load.status==="failed"&&!load.data.length)return <p className="p-notice failed">{failure} <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>;
  return <>{load.status==="failed"&&<p className="p-notice failed">{failure} Showing the last loaded results. <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>}{load.data.length?children:<p className="empty">{empty}</p>}</>;
}

function NicheDetail({view,onBack,onRefresh,refreshing}:{view:NicheView;onBack:()=>void;onRefresh:()=>void;refreshing:boolean}){
  const [sort,setSort]=useState<ListingOrder>("favorites");
  const [currency,setCurrency]=useState("");
  const [query,setQuery]=useState("");
  const currencies=[...new Set((view.listings??[]).map(listing=>listing.currency||"USD"))].sort();
  const listings=browseListings(view.listings??[],sort,query,currency);
  return <main className="mw"><button className="back p-button p-button-quiet" onClick={onBack}>← Tracked keywords</button><header className="mw-detail-head"><p className="mini-label">MARKET WATCH</p><h1>{view.phrase}</h1><p>Compare Etsy listings for this keyword.</p></header>
    {view.stale&&<p className="stale-flag" role="status">{view.error || "Current Etsy data could not be refreshed. Showing saved results."}</p>}
    <OfferPlanner key={view.key} source={view.key} phrase={view.phrase} listings={view.listings??[]}/>
    <ListingControls sort={sort} setSort={setSort} query={query} setQuery={setQuery} currency={currency} setCurrency={setCurrency} currencies={currencies}/>
    <div className="market-result-bar"><p role="status">{listings.length} of {view.listings?.length??0} results shown for this keyword</p><button className="p-button p-button-quiet" disabled={refreshing} onClick={onRefresh}>{refreshing?"Refreshing…":"Refresh listings"}</button></div>
    <details className="market-measurements"><summary>About these numbers</summary><p>Favorites and views are current listing totals. Recorded activity reflects changes observed over time; it does not establish how many units an individual listing sold.</p></details>
    {!listings.length?<p className="empty">{view.listings?.length?"No loaded listings match these filters. Clear the search or change the currency.":"Etsy could not load these listings. Your keyword is saved. Try refreshing."}</p>:<div className="cards">{listings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div>}
    {Boolean(view.history?.length)&&<details className="market-history"><summary>Keyword activity history</summary><p>Listings with recorded activity across the tracked keyword. These are not unit sales.</p><table><thead><tr><th>Date</th><th>Listings with activity</th><th>Repeated activity</th></tr></thead><tbody>{view.history!.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.moving}</td><td>{row.repeated}</td></tr>)}</tbody></table></details>}
  </main>;
}

function ListingCard({listing}:{listing:Listing}){return <article className="card">
  {listing.imageUrl && listing.displayFresh?<img src={listing.imageUrl} alt={listing.title} loading="lazy" width={570} height={570}/>:<p className="no-image">{listing.imageUrl ? "Photo needs refreshing" : "Photo unavailable from Etsy"}</p>}
  <div className="body"><div className="listing-price-row"><strong>{money(listing)}</strong>{!listing.displayFresh&&<span>Saved details</span>}</div><h2 className="title">{listing.title}</h2><dl className="listing-stat-grid"><div><dt>Favorites</dt><dd>{listing.favorites??"Unavailable"}</dd></div><div><dt>Views</dt><dd>{listing.views??"Unavailable"}</dd></div><div><dt>Recorded reviews</dt><dd>{listing.reviewsOnThisListing}</dd></div><div><dt>Listing age</dt><dd>{listing.ageDays==null?"Unavailable":`${listing.ageDays} ${listing.ageDays===1?"day":"days"}`}</dd></div></dl>
    {listing.intervals>0&&<p className="listing-evidence">Activity observed on {listing.intervals} occasion{listing.intervals===1?"":"s"} in the last 30 days{listing.confirmedAt?` · latest ${new Date(listing.confirmedAt*1000).toLocaleDateString()}`:""}.</p>}
  </div><a href={listing.etsyUrl} target="_blank" rel="noreferrer noopener">View on Etsy ↗</a>
  </article>}

function ShopCard({shop}:{shop:ShopView}){
  const [section,setSection]=useState<"listings"|"reviews"|"changes"|"notes">("listings");
  const [listings,setListings]=useState<Listing[]>([]);
  const [loading,setLoading]=useState(false);
  const [loadingAll,setLoadingAll]=useState(false);
  const [listingError,setListingError]=useState("");
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [retryOffset,setRetryOffset]=useState(0);
  const [total,setTotal]=useState<number|null>(null);
  const [sort,setSort]=useState<ListingOrder>("newest");
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
  const sections:Array<[string,ShopPattern[]]>=[["Listings buyers reviewed",shop.gettingAttention??[]],["What buyers love",shop.whatBuyersLove??[]],["What buyers dislike",shop.whatBuyersDislike??[]],["Shop changes",shop.whatChanged??[]]];
  const visibleSections=sections.filter(([name])=>section==="changes"?name==="Shop changes":name!=="Shop changes");
  const anything=visibleSections.some(([,cards])=>cards.length);
  return <section className="shop"><header className="mw-detail-head"><p className="mini-label">TRACKED SHOP</p><div className="shop-watch-heading"><h1 className="shop-name">{shop.shopName}</h1><a href={shop.etsy} target="_blank" rel="noopener noreferrer">Open shop on Etsy ↗</a></div></header>
    <div className="tabs p-tabs shop-detail-tabs" role="tablist" aria-label={`${shop.shopName} sections`}>{([["listings","Active listings"],["reviews","Buyer feedback"],["changes","Shop changes"],["notes","My notes"]] as const).map(([key,label])=><button key={key} id={`shop-tab-${key}`} className="p-tab" role="tab" aria-selected={section===key} aria-controls="shop-detail-panel" onClick={()=>setSection(key)}>{label}</button>)}</div>
    <div id="shop-detail-panel" role="tabpanel" aria-labelledby={`shop-tab-${section}`}>
    {section==="listings"&&<div className="shop-listing-browser" id="shop-catalog-controls">
      <ListingControls sort={sort} setSort={setSort} query={query} setQuery={setQuery} currency={currency} setCurrency={setCurrency} currencies={currencies}/>
      <div className="market-result-bar"><p role="status">{listings.length}{total===null?"":` of ${total}`} listings loaded{query||currency?` · ${visibleListings.length} match your filters`:""}</p><button className="p-button p-button-quiet" onClick={()=>void loadListings()} disabled={loading}>{loading&&!loadingAll?"Loading listings…":"Refresh active listings"}</button></div>
      <div className="market-catalog-scope"><p>{total===null?"Loading the shop’s catalog details…":nextOffset!==null?"Sorting and search cover the loaded listings. Load the full catalog to compare the whole shop.":total!==null&&listings.length<total?"Some Etsy listings are unavailable. Sorting and search cover the loaded listings only.":"Sorting and search cover all loaded active listings."}</p>{nextOffset!==null&&!loadingAll&&<button type="button" className="p-button p-button-quiet" disabled={loading} onClick={()=>void loadListings(nextOffset,true)}>Load full catalog</button>}{loadingAll&&<button type="button" className="p-button p-button-quiet" onClick={()=>activeRequest.current?.abort()}>Stop loading</button>}</div>
      <details className="market-measurements"><summary>About these numbers</summary><p>Favorites and views are lifetime listing totals, not sales. Newest uses the original listing date. Missing measurements appear last.</p></details>
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
   <label>Sort by<select value={sort} onChange={e=>setSort(e.target.value as ListingOrder)}><option value="newest">Newest first</option><option value="favorites">Highest favorites</option><option value="views">Highest views</option><option value="reviews">Most recorded reviews</option><option value="price" disabled={mixed}>Price: low to high</option><option value="price-desc" disabled={mixed}>Price: high to low</option></select></label>
   {currencies.length>1&&<label>Currency<select value={currency} onChange={e=>{setCurrency(e.target.value);if(!e.target.value&&(sort==="price"||sort==="price-desc"))setSort("newest")}}><option value="">All currencies</option>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}
   {(query||currency)&&<button type="button" className="p-button p-button-quiet" onClick={()=>{setQuery("");setCurrency("");if(sort==="price"||sort==="price-desc")setSort("newest")}}>Clear filters</button>}
   {mixed&&<p className="market-sort-note">Choose a currency to compare prices.</p>}
 </div>;
}
