"use client";
import {useEffect,useState} from "react";
import {designsOnOneProduct,familyLabel,shortLabel,type ReachListing} from "./design-reach";
import type {CatalogAction} from "./shop-map-actions";
import type {WinningPatternMap} from "./shop-map-patterns";
import type {ArtworkMarketProof} from "./shop-map-artwork-actions";
import type {WinnerDna} from "./shop-map-winner-dna";

type Expansion={
  listingId:number;title:string;imageUrl?:string;family:string;sold90:number;
  peerFamily:string;peerSold90:number;pattern:string;source:"shop"|"market";
};

function expansionReviews(listings:ReachListing[],map:WinningPatternMap,marketProof:ArtworkMarketProof[]){
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
      pattern:pattern.label,source:peer?"shop":"market",
    } satisfies Expansion];
  }).slice(0,3);
}

export function ReviewThese({map,actions,dna,marketProof=[]}:{
  map:WinningPatternMap;actions:CatalogAction[];dna:WinnerDna|null;
  marketProof?:ArtworkMarketProof[];
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
    ?expansionReviews(listings,map,marketProof):[];
  const overbuilt=map.overbuilt??[];
  if(!dna&&!overbuilt.length&&!actions.length&&!expansion.length&&!sourceIssue)return null;
  return <section className="oe-review" aria-labelledby="oe-review-title">
    <div className="oe-section-heading"><h2 id="oe-review-title">Review these</h2></div>
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
        <details><summary>See trait sources and scope</summary>
          <p>Purchased units among {dna.sellingArtworks} leading analyzed selling artworks ({dna.basis==="sales-90"?"last 90 days":"recorded lifetime"}); catalog shares use active analyzed artworks.</p>
          {dna.traits.map(row=><p key={row.label}><b>{row.label}</b>: {row.customerPercent}% of this artwork purchase set; {row.catalogPercent}% of active analyzed artworks.
            {!!row.listingIds?.length?<span> Sources: {row.listingIds.map((id,index)=><span key={id}>{index?", ":null}<a href={"https://www.etsy.com/listing/"+id} target="_blank" rel="noopener noreferrer">{shortLabel(map.listings.find(item=>item.listingId===id)?.title??"Listing "+id)}</a></span>)}</span>:null}
          </p>)}
        </details>
      </div>:null}
      {overbuilt.map(row=><div key={row.key} className="oe-review-card">
        <span className="oe-card-tag">CATALOG BALANCE</span><h3>{row.label}</h3>
        <p className="oe-review-figure"><b>{row.catalogPercent}%</b> of active designs <span>/</span> <b>{row.customerPercent}%</b> of recent response</p>
        <details><summary>What to check</summary><p>Compare availability, selling time and exposure before deciding whether to build another variation. Keep proven listings active.</p></details>
      </div>)}
      {actions.map(row=><div key={row.listingId} className="oe-review-card">
        <span className="oe-card-tag">{row.headline}</span><h3>{shortLabel(row.title)}</h3>
        <p>{row.fact}</p>
        <details><summary>Review this finding</summary><p>{row.evidence}</p><p>{row.nextStep}</p>
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
        </details>
      </div>)}
      {expansion.map(row=><div key={row.listingId} className="oe-review-card oe-expansion">
        <span className="oe-card-tag">PROVEN DESIGN</span>
        {row.imageUrl?<img src={row.imageUrl} alt="" width={64} height={64} loading="lazy"/>:null}
        <h3>{shortLabel(row.title)}</h3>
        <p>{row.sold90} sold on {familyLabel(row.family)}. Review {familyLabel(row.peerFamily)} as a possible adjacent format.</p>
        <details><summary>See supporting evidence</summary>
          <p>{row.source==="shop"
            ?"Another artwork in "+row.pattern+" sold "+row.peerSold90+" on "+familyLabel(row.peerFamily)+"."
            :"The matching saved watch recorded "+row.peerSold90+" observed stock decreases for "+familyLabel(row.peerFamily)+" listings. Inspect those observations before treating them as purchases."}</p>
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
        </details>
      </div>)}
    </div>
  </section>;
}
