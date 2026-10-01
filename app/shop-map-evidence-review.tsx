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
  return <section className="cc-tool shop-map-review shop-map-review-all">
    <div className="shop-map-section-head"><h2>Review these</h2></div>
    {sourceIssue?<div className="shop-map-review-group" role="status">
      <h3>Comparison sources need a retry</h3>
      <p>{sources?.shop==="failed"
        ?"Shop connection could not be checked. Catalog and purchase comparisons are unavailable."
        :sources?.catalog==="failed"&&sources?.sales==="failed"
          ?"Catalog and purchase reads failed. No comparison conclusion is available."
          :sources?.catalog==="failed"
            ?"Purchase observations loaded, but catalog coverage failed. No related-product conclusion is available."
            :"Catalog loaded, but purchase history failed. No sales-based comparison conclusion is available."}</p>
      <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={loading}>
        {loading?"Retrying…":"Retry comparison"}
      </button>
    </div>:null}
    {dna?<div className="shop-map-review-group">
      <h3>Winner DNA</h3>
      <p>Trait comparison among {dna.sellingArtworks} leading analyzed selling artworks ({dna.basis==="sales-90"?"last 90 days":"recorded lifetime"}):</p>
      <ul>{dna.traits.map(row=><li key={row.label}>
        <b>{row.label}</b> · {row.customerPercent}% of purchased units among these {dna.sellingArtworks} artworks; {row.catalogPercent}% of active analyzed artworks.
        {!!row.listingIds?.length&&<span className="shop-map-review-trait-sources"> Supporting listings: {row.listingIds.map((id,index)=><span key={id}>{index>0?", ":null}<a href={`https://www.etsy.com/listing/${id}`} target="_blank" rel="noopener noreferrer">{shortLabel(map.listings.find(item=>item.listingId===id)?.title??`Listing ${id}`)}</a></span>)}</span>}
      </li>)}</ul>
      <p>Use those traits to guide a distinct variation. Let the next test prove itself.</p>
    </div>:null}
    {overbuilt.map(row=><div key={row.key} className="shop-map-review-group">
      <h3>Review coverage: {row.label}</h3>
      <p>{row.catalogPercent}% of active designs, but {row.customerPercent}% of recent customer response.</p>
      <p>Keep proven listings active. Compare availability, selling time, and exposure before deciding whether to build another variation.</p>
    </div>)}
    {!!actions.length&&<div className="shop-map-review-group">
      {actions.map(row=><details key={row.listingId} className="shop-map-review-row">
        <summary><b>{shortLabel(row.title)}</b><span>{row.fact}</span></summary>
        <div className="shop-map-review-body">
          <h3>{row.headline}</h3><p>{row.evidence}</p><p>{row.nextStep}</p>
          <a href={`https://www.etsy.com/listing/${row.listingId}`} target="_blank" rel="noopener noreferrer">Check this listing on Etsy ↗</a>
        </div>
      </details>)}
    </div>}
    {!!expansion.length&&<div className="shop-map-review-group shop-map-reach">
      <h3>Proven designs to expand</h3>
      <ul>{expansion.map(row=><li key={row.listingId}>
        {row.imageUrl?<img src={row.imageUrl} alt="" width={72} height={72} loading="lazy"/>:<span aria-hidden="true"/>}
        <span className="shop-map-reach-copy">
          <b>{shortLabel(row.title)}</b>
          <small>This exact artwork sold {row.sold90} on {familyLabel(row.family)}.
            {row.source==="shop"
              ?` Another artwork in ${row.pattern} sold ${row.peerSold90} on ${familyLabel(row.peerFamily)}.`
              :` In the matching saved watch, ${familyLabel(row.peerFamily)} listings showed ${row.peerSold90} observed stock decreases in 30 days; inspect source observations before treating these as purchases.`}</small>
        </span>
        <a href={`https://www.etsy.com/listing/${row.listingId}`} target="_blank" rel="noopener noreferrer">See it on Etsy ↗</a>
      </li>)}</ul>
    </div>}
  </section>;
}
