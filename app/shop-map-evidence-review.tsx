"use client";
import {useEffect,useState} from "react";
import {designsOnOneProduct,familyLabel,shortLabel,type ReachListing} from "./design-reach";
import type {CatalogAction} from "./shop-map-actions";
import type {WinningPatternMap} from "./shop-map-patterns";
import type {ArtworkMarketProof} from "./shop-map-artwork-actions";
import type {WinnerDna} from "./shop-map-winner-dna";

type Expansion={
  listingId:number;title:string;imageUrl?:string;family:string;sold90:number;
  peerFamily:string;peerSold90:number;peerListingId?:number;peerTitle?:string;peerImageUrl?:string;
  marketPhrase?:string;pattern:string;source:"shop"|"market";
};

function expansionReviews(listings:ReachListing[],map:WinningPatternMap,marketProof:ArtworkMarketProof[],priorityIds:Set<number>){
  return designsOnOneProduct(listings).filter(row=>row.sold90>=3).flatMap(row=>{
    const pattern=map.patterns.find(item=>item.listingIds.includes(row.listingId));
    if(!pattern)return [];
    const family=row.families[0];
    const peer=listings.filter(item=>pattern.listingIds.includes(item.listingId)
      &&item.artworkHash!==row.key&&item.family&&item.family!==family&&item.sold90>0)
      .sort((a,b)=>b.sold90-a.sold90)[0];
    const market=marketProof.find(item=>item.patternKey===pattern.key)
      ?.productFamilies?.filter(item=>item.family!==family&&item.sold30>0)
      .sort((a,b)=>b.sold30-a.sold30)[0];
    if(!peer&&!market)return [];
    return [{
      listingId:row.listingId,title:row.title,imageUrl:row.imageUrl,
      family,sold90:row.sold90,
      peerFamily:peer?.family??market!.family,
      peerSold90:peer?.sold90??market!.sold30,
      peerListingId:peer?.listingId,peerTitle:peer?.title,peerImageUrl:peer?.imageUrl,
      marketPhrase:peer?undefined:marketProof.find(item=>item.patternKey===pattern.key)?.phrase,
      pattern:pattern.label,source:peer?"shop":"market",
    } satisfies Expansion];
  }).sort((a,b)=>Number(priorityIds.has(a.listingId))-Number(priorityIds.has(b.listingId))
    ||b.sold90-a.sold90||a.listingId-b.listingId).slice(0,3);
}

export function ReviewThese({map,actions,dna,marketProof=[],priorityIds=[]}:{
  map:WinningPatternMap;actions:CatalogAction[];dna:WinnerDna|null;
  marketProof?:ArtworkMarketProof[];priorityIds?:number[];
}){
  const [listings,setListings]=useState<ReachListing[]>([]);
  const [sources,setSources]=useState<{shop:string;catalog:string;sales:string}|null>(null);
  const [retry,setRetry]=useState(0);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    void fetch("/api/shop-map/my-listings",{cache:"no-store"})
      .then(async response=>{
        const body=await response.json().catch(()=>null) as {
          listings?:ReachListing[];sources?:{shop:string;catalog:string;sales:string}
        }|null;
        if(!body?.sources)throw new Error("Comparison sources unavailable");
        return body;
      })
      .then(body=>{if(!cancelled){setListings(body.listings??[]);setSources(body.sources!);}})
      .catch(()=>{if(!cancelled)setSources({shop:"failed",catalog:"unavailable",sales:"unavailable"});})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[retry]);
  const sourceIssue=sources?.shop==="failed"||sources?.catalog==="failed"||sources?.sales==="failed";
  const expansion=sources?.catalog==="available"&&sources?.sales==="available"
    ?expansionReviews(listings,map,marketProof,new Set(priorityIds)):[];
  const overbuilt=map.overbuilt??[];
  if(!dna&&!overbuilt.length&&!actions.length&&!expansion.length&&!sourceIssue)return null;
  return <section className="oe-review" aria-labelledby="oe-review-title">
    <div className="oe-section-heading"><h2 id="oe-review-title">Worth checking</h2></div>
    <div className="oe-review-grid">
      {sourceIssue?<div className="oe-review-card oe-source-issue" role="status">
        <span className="oe-card-tag">COMPARISON DATA</span><h3>Comparison needs a retry</h3>
        <p>{sources?.shop==="failed"?"Shop connection could not be checked."
          :sources?.catalog==="failed"&&sources?.sales==="failed"?"Catalog and purchase reads failed."
          :sources?.catalog==="failed"?"Catalog coverage could not load."
          :"Purchase history could not load."}</p>
        <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={loading}>
          {loading?"Retrying…":"Retry comparison"}</button>
      </div>:null}
      {dna?<div className="oe-review-card oe-dna">
        <span className="oe-card-tag">DESIGN EVIDENCE</span><h3>Winner DNA</h3>
        <div className="oe-dna-traits">{dna.traits.slice(0,2).map(row=><div key={row.label}>
          <span>{row.label}</span><b>{row.customerPercent}%</b>
        </div>)}</div>
        <details><summary>See the evidence</summary>
          <p>Purchased units among {dna.sellingArtworks} leading analyzed selling artworks ({dna.basis==="sales-90"?"last 90 days":"recorded lifetime"}); catalog shares use active analyzed artworks.</p>
          {dna.traits.map(row=><p key={row.label}><b>{row.label}</b>: {row.customerPercent}% of this artwork purchase set; {row.catalogPercent}% of active analyzed artworks.
            {!!row.listingIds?.length?<span> Sources: {row.listingIds.map((id,index)=><span key={id}>{index?", ":null}<a href={"https://www.etsy.com/listing/"+id} target="_blank" rel="noopener noreferrer">{shortLabel(map.listings.find(item=>item.listingId===id)?.title??"Listing "+id)}</a></span>)}</span>:null}
          </p>)}
        </details>
      </div>:null}
      {overbuilt.map(row=><div key={row.key} className="oe-review-card">
        <span className="oe-card-tag">CATALOG BALANCE</span><h3>{row.label}</h3>
        <p className="oe-review-figure"><b>{row.catalogPercent}%</b> active designs <span>·</span> <b>{row.customerPercent}%</b> {map.basis==="sales-90"?"90-day sales":map.basis==="sales-lifetime"?"lifetime sales":"favorites"}</p>
        <details><summary>What to check</summary><p>Check availability and exposure before making another variation.</p></details>
      </div>)}
      {actions.map(row=><div key={row.listingId} className="oe-review-card">
        <span className="oe-card-tag">{row.headline}</span><h3>{shortLabel(row.title)}</h3>
        <p>{row.fact}</p>
        <details><summary>Review this finding</summary><p>{row.evidence}</p><p>{row.nextStep}</p>
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
        </details>
      </div>)}
      {expansion.map(row=><div key={row.listingId} className="oe-review-card oe-expansion">
        <span className="oe-card-tag">{row.source==="shop"?"SHOP COMPARISON":"SAVED WATCH"}</span>
        <div className="oe-expansion-pair">
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer"
            aria-label={"View "+row.title}>
            {row.imageUrl?<img src={row.imageUrl} alt="" width={64} height={64} loading="lazy"/>:<span>No photo</span>}
            <small>{row.sold90} sold · {familyLabel(row.family)}</small>
          </a>
          {row.peerListingId?<a href={"https://www.etsy.com/listing/"+row.peerListingId} target="_blank" rel="noopener noreferrer"
            aria-label={"View "+row.peerTitle}>
            {row.peerImageUrl?<img src={row.peerImageUrl} alt="" width={64} height={64} loading="lazy"/>:<span>No photo</span>}
            <small>{row.peerSold90} sold · {familyLabel(row.peerFamily)}</small>
          </a>:null}
        </div>
        <h3>{shortLabel(row.title)}</h3>
        {row.source==="market"?<p>{row.peerSold90} observed stock decreases on {familyLabel(row.peerFamily)} listings. These are not verified purchases.</p>:null}
        <details><summary>{row.source==="shop"?"Why compare these":"View watch evidence"}</summary>
          {row.source==="shop"
            ?<p>Different artworks share the {row.pattern} pattern. Compare their imagery and exposure before making a new version.</p>
            :<p>Check the dated stock observations before treating this as demand.</p>}
          {row.marketPhrase?<a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(row.marketPhrase)}`}>Open saved watch</a>:null}
        </details>
      </div>)}
    </div>
  </section>;
}
