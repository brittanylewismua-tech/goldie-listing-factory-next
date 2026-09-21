"use client";

import ActionPlan from "@/app/command-center/action-plan";
import OfferPlanner from "@/app/command-center/offer-planner";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type Listing = {
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
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [opening,setOpening]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

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

  if(open)return <NicheDetail view={open} refreshing={Boolean(opening)} onRefresh={()=>void openNiche(open.key)} onBack={()=>{setOpen(null);void loadNiches(true)}}/>;
  return <main className="mw">
    <header className="mw-intro"><p className="mini-label">MARKET WATCH</p><h1>Explore Etsy listings.</h1><p className="lede">Compare listing photos, prices, favorites, and reviews for the keywords and shops you follow.</p></header>
    <div className="tabs p-tabs" role="tablist">
      <button className="p-tab" role="tab" aria-selected={tab==="niches"} id="mw-tab-niches" aria-controls="mw-panel" onClick={()=>chooseTab("niches")}>Tracked keywords</button>
      <button className="p-tab" role="tab" aria-selected={tab==="shops"} id="mw-tab-shops" aria-controls="mw-panel" onClick={()=>chooseTab("shops")}>Tracked shops</button>
    </div>
    <div className="add"><input className="p-input" value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void add()}} aria-label={tab==="niches"?"Keyword to track":"Shop to track"} placeholder={tab==="niches"?"Enter a keyword, like bookish sweatshirt":"Etsy shop link or name"}/><button className="p-button p-button-primary" onClick={()=>void add()} disabled={busy||!input.trim()} aria-busy={busy}>{busy?"Adding…":tab==="niches"?"Track keyword":"Track shop"}</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!error && notice && <p className="p-notice" role="status">{notice}</p>}
    {tab==="shops"&&<p className="watch-limit">{shops.data.length} of 25 shops tracked</p>}
    <div id="mw-panel" role="tabpanel" aria-labelledby={tab==="niches"?"mw-tab-niches":"mw-tab-shops"}>
      {tab==="niches"?<WatchList load={watches} onRetry={()=>void loadNiches()} failure="Your tracked keywords could not be loaded." empty="Track a keyword to start comparing listings.">
        <div className="keyword-watch-grid">{watches.data.map(watch=><article className="keyword-watch" key={watch.key} data-stale={watch.stale?"yes":"no"}>
          <div className="keyword-watch-head"><div><span>TRACKED KEYWORD</span><h2>{watch.phrase}</h2></div><button type="button" onClick={()=>void openNiche(watch.key)} disabled={Boolean(opening)}>{opening===watch.key?"Opening…":"View listings"}</button></div>
          {watch.stale&&<p className="keyword-stale">Current data could not be refreshed. Showing saved details.</p>}
          <div className="keyword-thumbs">{(watch.listings??[]).slice(0,4).map(listing=>listing.imageUrl&&listing.displayFresh?<img key={listing.listingId} src={listing.imageUrl} alt="" width={180} height={180}/>:<span key={listing.listingId} aria-hidden="true"/>)}{(watch.listings??[]).length===0&&<p>Listings will appear after Etsy refreshes this keyword.</p>}</div>
          <p className="keyword-watch-caption">Open listings to compare photos, prices, favorites, and recorded activity.</p>
        </article>)}</div>
      </WatchList>:<WatchList load={shops} onRetry={()=>void loadShops()} failure="Your tracked shops could not be loaded." empty="Add an Etsy shop to follow its listing activity.">{shops.data.map(shop=><ShopCard key={shop.shopId} shop={shop}/>)}</WatchList>}
    </div>
  </main>;
}

function WatchList({load,onRetry,failure,empty,children}:{load:{status:"loading"|"ready"|"failed";data:unknown[]};onRetry:()=>void;failure:string;empty:string;children:ReactNode}){
  if(load.status==="loading"&&!load.data.length)return <div className="watch-wait" aria-label="Loading"><span className="p-skeleton"/><span className="p-skeleton"/></div>;
  if(load.status==="failed"&&!load.data.length)return <p className="p-notice failed">{failure} <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>;
  return <>{load.status==="failed"&&<p className="p-notice failed">{failure} Showing the last loaded results. <button className="p-button p-button-quiet" onClick={onRetry}>Try again</button></p>}{load.data.length?children:<p className="empty">{empty}</p>}</>;
}

function NicheDetail({view,onBack,onRefresh,refreshing}:{view:NicheView;onBack:()=>void;onRefresh:()=>void;refreshing:boolean}){
  const [sort,setSort]=useState("favorites");
  const [currency,setCurrency]=useState("");
  const currencies=[...new Set((view.listings??[]).map(listing=>listing.currency||"USD"))].sort();
  const mixedCurrencies=!currency&&currencies.length>1;
  const listings=(view.listings??[]).filter(listing=>!currency||(listing.currency||"USD")===currency).sort((a,b)=>sort==="price"?(a.priceCents??Infinity)-(b.priceCents??Infinity):sort==="newest"?(a.ageDays??Infinity)-(b.ageDays??Infinity):sort==="reviews"?b.reviewsOnThisListing-a.reviewsOnThisListing:(b.favorites??-1)-(a.favorites??-1));
  return <main className="mw"><button className="back p-button p-button-quiet" onClick={onBack}>← Tracked keywords</button><header className="mw-detail-head"><p className="mini-label">MARKET WATCH</p><h1>{view.phrase}</h1><p>Compare Etsy listings for this keyword.</p></header>
    {view.stale&&<p className="stale-flag" role="status">{view.error || "Current Etsy data could not be refreshed. Showing saved results."}</p>}
    <OfferPlanner key={view.key} source={view.key} phrase={view.phrase} listings={view.listings??[]}/>
    <div className="market-toolbar"><label>Sort by <select value={sort} onChange={event=>setSort(event.target.value)}><option value="favorites">Most favorites</option><option value="reviews">Most recorded reviews</option><option value="newest">Newest listing</option><option value="price" disabled={mixedCurrencies}>Lowest price</option></select></label>{currencies.length>1&&<label>Currency <select value={currency} onChange={event=>{setCurrency(event.target.value);if(!event.target.value&&sort==="price")setSort("favorites")}}><option value="">All currencies</option>{currencies.map(code=><option key={code} value={code}>{code}</option>)}</select></label>}<button className="p-button p-button-quiet" disabled={refreshing} onClick={onRefresh}>{refreshing?"Refreshing…":"Refresh listings"}</button></div>
    {mixedCurrencies&&<p className="market-note">Choose one currency to sort by price.</p>}
    <p className="market-note">Favorites and views are current listing totals. Recorded activity reflects changes observed over time; it does not establish how many units an individual listing sold.</p>
    {!listings.length?<p className="empty">Etsy could not load these listings. Your keyword is saved. Try refreshing.</p>:<div className="cards">{listings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div>}
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
  const [showListings,setShowListings]=useState(false);
  const [listings,setListings]=useState<Listing[]>([]);
  const [loading,setLoading]=useState(false);
  const [listingError,setListingError]=useState("");
  const loadListings=async()=>{
    setShowListings(true);setLoading(true);setListingError("");
    try{const response=await fetch(`/api/shop-watch/listings?shop=${shop.shopId}`);const payload=await response.json() as {listings?:Listing[];error?:string;stale?:boolean};if(!response.ok)throw new Error(payload.error||"Listings could not load.");setListings(payload.listings??[]);if(payload.stale)setListingError("Etsy could not refresh these listings. Showing saved results.");}
    catch(error){setListingError(error instanceof Error?error.message:"Listings could not load.");}finally{setLoading(false);}
  };

  const sections:Array<[string,ShopPattern[]]>=[["Listings buyers reviewed",shop.gettingAttention??[]],["What buyers love",shop.whatBuyersLove??[]],["What buyers dislike",shop.whatBuyersDislike??[]],["Shop changes",shop.whatChanged??[]]];
  const anything=sections.some(([,cards])=>cards.length);
  return <section className="shop"><div className="shop-watch-heading"><h2 className="shop-name">{shop.shopName}</h2><a href={shop.etsy} target="_blank" rel="noopener noreferrer">View shop on Etsy ↗</a></div>
    <button className="p-button p-button-quiet" disabled={loading} onClick={()=>showListings&&!listingError?setShowListings(false):void loadListings()}>{loading?"Loading listings…":showListings&&!listingError?"Hide listings":"View listings"}</button>
    {showListings&&<div className="shop-listing-browser">{listingError&&<p role="alert">{listingError} <button onClick={()=>void loadListings()} disabled={loading}>Try again</button></p>}{!loading&&!listings.length&&!listingError&&<p>No active listings are available from Etsy.</p>}<div className="cards">{listings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div></div>}
    {!anything&&<p className="empty">No recorded reviews or changes yet. Open this shop’s listings to compare its current products.</p>}
    {shop.displayUnavailable&&<p className="p-notice">Etsy could not refresh some listing photos. Review history remains available.</p>}
    {sections.map(([name,cards])=>cards.length?<div className="section" key={name}><h3 className="section-name">{name}</h3>{name==="Listings buyers reviewed"&&<p className="section-note">Review dates show when feedback was posted, not when an item sold.</p>}<div className="shop-pattern-grid">{cards.map((card,index)=><article className="pattern" key={`${name}-${index}`}>
      {card.listing?.imageUrl&&<img className="shop-listing-photo" src={card.listing.imageUrl} alt={card.listing.title||"Etsy listing"} loading="lazy" width={570} height={570}/>}
      {card.listing?.title&&<h4>{card.listing.title}</h4>}
      <p className="pattern-headline">{card.pattern}</p>
      <span className="support">{card.evidence}{card.window?` · ${card.window}`:""}</span>
      {Boolean(card.reviews?.length)&&<details><summary>Read buyer reviews</summary>{card.reviews!.map((review,i)=><blockquote key={i}><p>{review.review}</p><footer>{review.rating} / 5 · {new Date(review.createdAt*1000).toLocaleDateString()}</footer></blockquote>)}</details>}
      {card.action&&<div className="cc-tool"><h4>Apply this to your offer</h4><p>{card.action.change}</p><p className="cc-note">{card.action.check}</p></div>}
      {card.because&&<details><summary>About this comparison</summary><p className="pattern-because">{card.because}</p></details>}
      {card.listing?.url&&<a href={card.listing.url} target="_blank" rel="noreferrer noopener">{card.listing.id?"View listing on Etsy":"View shop on Etsy"} ↗</a>}
    </article>)}</div></div>:null)}<ActionPlan feature="marketWatch" source={`shop-${shop.shopId}`} heading={`Offer improvement: ${shop.shopName}`} notes={[...shop.whatBuyersDislike,...shop.whatBuyersLove].filter(c=>c.action).slice(0,3).map(c=>`${c.pattern}
Evidence: ${c.because}
Change to test: ${c.action!.change}
How to check: ${c.action!.check}`).join('\n\n')||'Choose a specific product and buyer need. Record the evidence, one change to test, and how you will measure the result.'}/></section>;
}
