"use client";
import {useEffect,useState} from "react";
import {designsOnOneProduct,familyLabel,shortLabel,type ReachListing} from "./design-reach";
import type {CatalogAction} from "./shop-map-actions";
import type {WinningPatternMap} from "./shop-map-patterns";
import type {ArtworkMarketProof} from "./shop-map-artwork-actions";
import type {WinnerDna} from "./shop-map-winner-dna";
import type {ShopFinding} from "./shop-map-opportunity-discovery";
import {productFamily} from "./product-type-utils";

const compactFamily=(value:string)=>{
  const label=familyLabel(value).replace(/^an? /,"");
  return label.charAt(0).toUpperCase()+label.slice(1);
};

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
    ||b.sold90-a.sold90||a.listingId-b.listingId);
}

export function ReviewThese({map,actions,dna,marketProof=[],priorityIds=[],findings=[],days=90}:{
  map:WinningPatternMap;actions:CatalogAction[];dna:WinnerDna|null;
  marketProof?:ArtworkMarketProof[];priorityIds?:number[];findings?:ShopFinding[];days?:number;
}){
  const [listings,setListings]=useState<ReachListing[]>([]);
  const [sources,setSources]=useState<{shop:string;catalog:string;sales:string}|null>(null);
  const [retry,setRetry]=useState(0);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(days!==90)return;
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
  },[retry,days]);
  const sourceIssue=days===90&&(sources?.shop==="failed"||sources?.catalog==="failed"||sources?.sales==="failed");
  const expansion=days===90&&sources?.catalog==="available"&&sources?.sales==="available"
    ?expansionReviews(listings,map,marketProof,new Set(priorityIds)):[];
  const overbuilt=days===90?map.overbuilt??[]:[];
  const shownDna=days===90?dna:null;
  const shownActions=days===90?actions:[];
  const externalPairs=days===90&&sources?.catalog==="available"?marketProof.flatMap(proof=>{
    const pattern=map.patterns.find(row=>row.key===proof.patternKey);
    if(!pattern)return [];
    const source=listings.filter(row=>pattern.listingIds.includes(row.listingId)&&row.sold90>0&&row.imageUrl)
      .sort((a,b)=>b.sold90-a.sold90)[0];
    if(!source)return [];
    const peers=(proof.listings??[]).filter(row=>row.listingId!==source.listingId
      &&row.imageUrl&&row.observedUnits30>0&&productFamily(source.title)!==""
      &&productFamily(row.title)===productFamily(source.title));
    if(!peers.length)return [];
    return [{source,peer:peers[0],proof}];
  }):[];
  const additionalFindings=findings.filter(row=>!priorityIds.includes(row.listingIds[0])||row.kind==="catalog-review");
  if(!shownDna&&!overbuilt.length&&!shownActions.length&&!expansion.length&&!additionalFindings.length&&!externalPairs.length&&!sourceIssue)return null;
  return <section className="oe-review" aria-labelledby="oe-review-title">
    <div className="oe-section-heading"><h2 id="oe-review-title">More opportunities</h2></div>
    <div className="oe-review-grid">
      {additionalFindings.map(row=><article key={row.id} className="oe-review-card oe-finding-card">
        <span className="oe-card-tag">{row.label}</span>
        <div className="oe-finding-main">
          {row.imageUrl?<img src={row.imageUrl} alt="" width={64} height={64} loading="lazy"/>:null}
          <h3>{shortLabel(row.title)}</h3>
        </div>
        <p>{row.evidence}</p>
        <strong>{row.direction}</strong>
        <details><summary>See the evidence</summary><p>{row.detail}</p>
          {row.listingIds.slice(0,4).map((id,index)=><a key={id} href={"https://www.etsy.com/listing/"+id}
            target="_blank" rel="noopener noreferrer">{index?"Related listing":"Source listing"}</a>)}
        </details>
      </article>)}
      {externalPairs.map(({source,peer,proof})=><article key={proof.patternKey+"-"+peer.listingId}
        className="oe-review-card oe-market-pair" data-source="market">
        <span className="oe-card-tag">ETSY PRODUCT EVIDENCE</span>
        <div className="oe-market-images">
          <a href={"https://www.etsy.com/listing/"+source.listingId} target="_blank" rel="noopener noreferrer"
            aria-label={"View "+source.title}><img src={source.imageUrl} alt="" width={70} height={70} loading="lazy"/>
            <small>Your product</small></a>
          <a href={peer.etsyUrl} target="_blank" rel="noopener noreferrer" aria-label={"View "+peer.title}>
            <img src={peer.imageUrl} alt="" width={70} height={70} loading="lazy"/><small>Etsy comparison</small></a>
        </div>
        <h3>{shortLabel(source.title)}</h3>
        <p>{peer.observedUnits30} units of observed activity for a related {compactFamily(source.family).toLowerCase()} on {new Date(peer.confirmedAt*1000).toLocaleDateString()}.</p>
        <strong>Inspect the actual products and options before testing a difference.</strong>
        <details><summary>See comparison evidence</summary>
          <p>Matched through the saved “{proof.phrase}” watch and product format. The source listing had {source.sold90} purchased units in the last 90 days. The external observation is dated and may include inventory movement; it is not a confirmed purchase count.</p>
          <p>Compare imagery, wording, materials, options and price; matching search words alone do not prove the products serve the same buyer need.</p>
          {peer.priceCents!=null?<p>External listing price: {new Intl.NumberFormat(undefined,{style:"currency",currency:peer.currency||"USD"}).format(peer.priceCents/100)}.</p>:null}
          <a href={peer.etsyUrl} target="_blank" rel="noopener noreferrer">View Etsy comparison</a>
        </details>
      </article>)}
      {sourceIssue?<div className="oe-review-card oe-source-issue" role="status">
        <span className="oe-card-tag">COMPARISON DATA</span><h3>Comparison needs a retry</h3>
        <p>{sources?.shop==="failed"?"Shop connection could not be checked."
          :sources?.catalog==="failed"&&sources?.sales==="failed"?"Catalog and purchase reads failed."
          :sources?.catalog==="failed"?"Catalog coverage could not load."
          :"Purchase history could not load."}</p>
        <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={loading}>
          {loading?"Retrying…":"Retry comparison"}</button>
      </div>:null}
      {shownDna?<div className="oe-review-card oe-dna">
        <span className="oe-card-tag">DESIGN EVIDENCE</span><h3>Winner DNA</h3>
        <div className="oe-dna-traits">{shownDna.traits.slice(0,2).map(row=><div key={row.label}>
          <span>{row.label}</span><b>{row.customerPercent}%</b>
        </div>)}</div>
        <details><summary>See the evidence</summary>
          <p>Purchased units among {shownDna.sellingArtworks} leading analyzed selling artworks ({shownDna.basis==="sales-90"?"last 90 days":"recorded lifetime"}); catalog shares use active analyzed artworks.</p>
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
      {shownActions.map(row=><div key={row.listingId} className="oe-review-card">
        <span className="oe-card-tag">{row.headline}</span><h3>{shortLabel(row.title)}</h3>
        <p>{row.fact}</p>
        <details><summary>Review this finding</summary><p>{row.evidence}</p><p>{row.nextStep}</p>
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
        </details>
      </div>)}
    </div>
    {expansion.length?<div className="oe-comparisons">
      <div className="oe-section-heading"><h3>Compare related products</h3></div>
      <div className="oe-comparison-grid">
        {expansion.map(row=><div key={row.listingId} className="oe-review-card oe-expansion" data-source={row.source}>
          <span className="oe-card-tag">{row.source==="shop"?row.pattern:"SAVED WATCH"}</span>
          <div className="oe-expansion-pair">
            <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer"
              aria-label={"View "+row.title}>
              {row.imageUrl?<img src={row.imageUrl} alt="" width={64} height={64} loading="lazy"/>:<span>No photo</span>}
              <small>{row.sold90} sold · {compactFamily(row.family)}</small>
            </a>
            {row.peerListingId?<a href={"https://www.etsy.com/listing/"+row.peerListingId} target="_blank" rel="noopener noreferrer"
              aria-label={"View "+row.peerTitle}>
              {row.peerImageUrl?<img src={row.peerImageUrl} alt="" width={64} height={64} loading="lazy"/>:<span>No photo</span>}
              <small>{row.peerSold90} sold · {compactFamily(row.peerFamily)}</small>
            </a>:null}
          </div>
          <h3>{shortLabel(row.title)}</h3>
          {row.source==="market"?<>
            <p>{row.peerSold90} observed stock decreases on {familyLabel(row.peerFamily)} listings. These are not verified purchases.</p>
            <details><summary>View watch evidence</summary>
              <p>Check the dated stock observations before treating this as demand.</p>
              {row.marketPhrase?<a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(row.marketPhrase)}`}>Open saved watch</a>:null}
            </details>
          </>:null}
        </div>)}
      </div>
    </div>:null}
  </section>;
}
