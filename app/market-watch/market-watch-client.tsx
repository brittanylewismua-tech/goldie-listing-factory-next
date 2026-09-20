"use client";

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
  listings?: Listing[]; window?: string | null };
type WatchRow = { key: string; phrase: string; moving: number; repeated: number;
  shops: number; lastCheckedAt: number; stale: boolean; listings: Listing[] };
type ShopPattern = { pattern?: string; because?: string; evidence?: string; window?: string;
  listing?: { id: number | null; url: string } };
type ShopView = { shopId: number; shopName: string; etsy: string;
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
    if (typeof window === "undefined" || startTab) return;
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

  if(open)return <NicheDetail view={open} onBack={()=>{setOpen(null);void loadNiches(true)}}/>;
  return <main className="mw">
    <header className="mw-intro"><p className="mini-label">MARKET WATCH</p><h1>See what shoppers are responding to.</h1><p className="lede">Track a keyword to compare real Etsy listings, current stats, and confirmed sales.</p></header>
    <div className="tabs p-tabs" role="tablist">
      <button className="p-tab" role="tab" aria-selected={tab==="niches"} id="mw-tab-niches" aria-controls="mw-panel" onClick={()=>chooseTab("niches")}>Tracked keywords</button>
      <button className="p-tab" role="tab" aria-selected={tab==="shops"} id="mw-tab-shops" aria-controls="mw-panel" onClick={()=>chooseTab("shops")}>Tracked shops</button>
    </div>
    <div className="add"><input className="p-input" value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void add()}} aria-label={tab==="niches"?"Keyword to track":"Shop to track"} placeholder={tab==="niches"?"Enter a keyword, like bookish sweatshirt":"Etsy shop link or name"}/><button className="p-button p-button-primary" onClick={()=>void add()} disabled={busy||!input.trim()} aria-busy={busy}>{busy?"Adding…":tab==="niches"?"Track keyword":"Track shop"}</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!error && notice && <p className="p-notice" role="status">{notice}</p>}
    <div id="mw-panel" role="tabpanel" aria-labelledby={tab==="niches"?"mw-tab-niches":"mw-tab-shops"}>
      {tab==="niches"?<WatchList load={watches} onRetry={()=>void loadNiches()} failure="Your tracked keywords could not be loaded." empty="Track a keyword to start comparing listings.">
        <div className="keyword-watch-grid">{watches.data.map(watch=><article className="keyword-watch" key={watch.key} data-stale={watch.stale?"yes":"no"}>
          <div className="keyword-watch-head"><div><span>TRACKED KEYWORD</span><h2>{watch.phrase}</h2></div><button type="button" onClick={()=>void openNiche(watch.key)} disabled={Boolean(opening)}>{opening===watch.key?"Opening…":"View listings"}</button></div>
          {watch.stale&&<p className="keyword-stale">Current data could not be refreshed. Showing the last confirmed reading.</p>}
          <div className="keyword-thumbs">{(watch.listings??[]).slice(0,4).map(listing=>listing.imageUrl&&listing.displayFresh?<img key={listing.listingId} src={listing.imageUrl} alt="" width={180} height={180}/>:<span key={listing.listingId} aria-hidden="true"/>)}{(watch.listings??[]).length===0&&<p>Listings will appear after Etsy refreshes this keyword.</p>}</div>
          <dl className="keyword-stats"><div><dt>Confirmed sold · 30 days</dt><dd>{(watch.listings??[]).reduce((sum,row)=>sum+(row.sold30??0),0)}</dd></div><div><dt>Repeat sellers</dt><dd>{watch.repeated}</dd></div></dl>
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

function NicheDetail({view,onBack}:{view:NicheView;onBack:()=>void}){
  const listings=view.listings??[],sold7=listings.reduce((sum,row)=>sum+row.sold7,0),sold30=listings.reduce((sum,row)=>sum+row.sold30,0);
  return <main className="mw"><button className="back p-button p-button-quiet" onClick={onBack}>← Tracked keywords</button><header className="mw-detail-head"><p className="mini-label">MARKET WATCH</p><h1>{view.phrase}</h1><p>Compare the listings Etsy is showing for this keyword.</p></header>
    {view.stale&&<p className="stale-flag">Current Etsy data could not be refreshed. Showing the last saved results.</p>}
    <dl className="market-summary-grid"><div><dt>Confirmed sold · 7 days</dt><dd>{sold7}</dd></div><div><dt>Confirmed sold · 30 days</dt><dd>{sold30}</dd></div><div><dt>Repeat sellers</dt><dd>{view.summary?.repeated??0}</dd></div></dl>
    {listings.length>0&&sold30===0&&<p className="market-note">No sales have been confirmed for these listings yet. Their current Etsy stats are below.</p>}
    {!listings.length?<p className="empty">Listings could not be refreshed right now. Go back and try this keyword again.</p>:<div className="cards">{listings.map(listing=><ListingCard key={listing.listingId} listing={listing}/>)}</div>}
  </main>;
}

function ListingCard({listing}:{listing:Listing}){return <article className="card">
  {listing.imageUrl && listing.displayFresh?<img src={listing.imageUrl} alt="" loading="lazy" width={570} height={570}/>:<p className="no-image">{listing.imageUrl ? "Picture not current — refreshed shortly" : "No picture available"}</p>}
  <div className="body"><div className="listing-price-row"><strong>{money(listing)}</strong>{listing.sold30>0&&<span>{listing.sold30} confirmed sold</span>}</div><p className="title">{listing.title}</p><dl className="listing-stat-grid"><div><dt>Favorites</dt><dd>{listing.favorites??"—"}</dd></div><div><dt>Views</dt><dd>{listing.views??"—"}</dd></div><div><dt>Sold · 7d</dt><dd>{listing.sold7}</dd></div></dl></div>
  <a href={listing.etsyUrl} target="_blank" rel="noreferrer noopener">View on Etsy</a>
  </article>}

function ShopCard({shop}:{shop:ShopView}){const sections:Array<[string,ShopPattern[]]>=[["Getting attention",shop.gettingAttention??[]],["What buyers love",shop.whatBuyersLove??[]],["What buyers dislike",shop.whatBuyersDislike??[]],["What changed",shop.whatChanged??[]]],anything=sections.some(([,cards])=>cards.length);return <section className="shop"><h2 className="shop-name">{shop.shopName}</h2>{!anything&&<p className="empty">No listing activity has been confirmed for this shop yet.</p>}{sections.map(([name,cards])=>cards.length?<div className="section" key={name}><h3 className="section-name">{name}</h3>{name === "Getting attention" && <p className="section-note">Reviews are not sales, and a buyer can leave one up to a hundred days after delivery.</p>}{cards.map((card,index)=><div className="pattern" key={`${name}-${index}`}><p className="pattern-headline">{card.pattern}</p>{card.because&&<p className="pattern-because">{card.because}</p>}<span className="support">{card.evidence}{card.window?` · ${card.window}`:""}</span>{card.listing?.url&&<a href={card.listing.url} target="_blank" rel="noreferrer noopener">View on Etsy</a>}</div>)}</div>:null)}</section>}
