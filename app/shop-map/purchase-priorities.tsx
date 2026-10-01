"use client";
import type {PurchasePriorityMap,PurchasePriority} from "@/app/shop-map-purchase-priorities";
import type {ProductDirection} from "@/app/shop-map-product-expansion";
import {shortLabel} from "@/app/design-reach";
import {useState} from "react";

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";
const money=(minor:number,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(minor/100);
const percent=(share:number)=>share>0&&share<.005?"<1%":String(Math.round(share*100))+"%";

export default function PurchasePriorities({map,directions,analysisFailed=false,onRetry}:{
  map:PurchasePriorityMap;directions?:ProductDirection[];analysisFailed?:boolean;onRetry?:()=>void;
}){
  const [showTies,setShowTies]=useState(false);
  const [showAllPurchased,setShowAllPurchased]=useState(false);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [copyState,setCopyState]=useState("");
  const byListing=new Map((directions??[]).map(row=>[row.listingId,row]));
  const cutoffUnits=map.priorities.at(-1)?.unitsPurchased??0;
  const tiedBeyondCutoff=map.listings.slice(map.priorities.length).filter(row=>row.unitsPurchased===cutoffUnits);
  const visiblePriorities=showTies?[...map.priorities,...tiedBeyondCutoff]:map.priorities;
  const leaders=visiblePriorities.filter(row=>row.rank===1);
  const companions=visiblePriorities.filter(row=>row.rank!==1);
  const chosen=map.listings.find(row=>row.listingId===selectedId)??visiblePriorities[0];
  const visibleIds=new Set(visiblePriorities.map(row=>row.listingId));
  const additional=map.listings.filter(row=>!visibleIds.has(row.listingId));
  const displayedAdditional=showAllPurchased?additional:additional.slice(0,6);
  const direction=chosen?byListing.get(chosen.listingId):null;
  const hiddenUnits=Math.max(0,map.totalUnits-visiblePriorities.reduce((sum,row)=>sum+row.unitsPurchased,0));
  const period="last "+map.days+" days";
  const refreshed=map.refreshedAt
    ?new Date(map.refreshedAt*1000).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):null;
  const researchPrompt=chosen&&direction
    ?["Research one feasible original next test for purchased listing #"+chosen.listingId+" ("+chosen.title+").",
      "It received "+chosen.unitsPurchased+" purchased units across "+chosen.orders+" recorded transactions in the "+period+
      " ("+percent(chosen.share)+" "+map.shareLabel.toLowerCase()+").",
      direction.retainedCharacteristic?"Observed characteristic to retain: "+direction.retainedCharacteristic+".":"",
      direction.proposedChange?"Candidate change: "+direction.proposedChange:"",
      "Catalog coverage: "+direction.catalogCoverage,
      direction.researchQuestion||"Inspect actual product imagery, existing versions, production feasibility and relevant Etsy organic demand.",
      "Do not infer imagery from SEO titles, invent purchases or recommend a duplicate."].filter(Boolean).join("\n")
    :"";
  const copy=async()=>{
    if(!researchPrompt)return;
    try{await navigator.clipboard.writeText(researchPrompt);setCopyState("Copied the full product context. Opening MirrorBot does not transfer it automatically.")}
    catch{setCopyState("Copy the full context below, then paste it into MirrorBot.");}
  };
  const card=(row:PurchasePriority)=>{
    const dominant=row.rank===1&&leaders.length===1;
    return <article key={row.listingId} className={row.rank===1?"purchase-lead":""}
      data-dominant={dominant?"yes":"no"} data-selected={chosen?.listingId===row.listingId?"yes":"no"}>
      <button type="button" className="shop-map-purchases-select" aria-pressed={chosen?.listingId===row.listingId}
        aria-label={"Review priority "+row.rank+": "+row.title} onClick={()=>{setSelectedId(row.listingId);setCopyState("");}}>
        <span className="shop-map-purchases-photo">
          {row.imageUrl?<img src={row.imageUrl} alt={row.title} width={320} height={320}
            loading={row.rank===1?"eager":"lazy"} fetchPriority={row.rank===1?"high":"auto"}/>:
            <span className="shop-map-purchases-image-missing" aria-label="Listing image unavailable">Image unavailable</span>}
        </span>
        <span className="shop-map-purchases-card-copy">
          <span className="shop-map-purchases-rank">Priority {row.rank}</span>
          <strong className="shop-map-purchases-title" title={row.title}>{shortLabel(row.title)}</strong>
          <span className="shop-map-purchases-votes"><strong>{row.unitsPurchased}</strong> units purchased</span>
          <span className="shop-map-purchases-share">{percent(row.share)} {map.shareLabel.toLowerCase()}</span>
          <span className="shop-map-purchases-bar" aria-hidden="true"><span style={{width:Math.max(1,row.share*100)+"%"}}/></span>
          {row.state==="sold_out"||row.state==="inactive"
            ?<small>{row.state==="sold_out"?"Sold out":"Inactive"} · historical purchases</small>:null}
        </span>
      </button>
    </article>;
  };
  return <section className="shop-map-purchases" aria-labelledby="shop-map-purchases-title">
    <div className="shop-map-purchases-head">
      <div><p className="mini-label">PURCHASE-LED PRIORITIES</p>
        <h2 id="shop-map-purchases-title">Where to focus next</h2>
        <p>Build out what your customers are already buying.</p></div>
      <small>{refreshed?"Sales updated "+refreshed:"Sales refresh time unavailable"}</small>
    </div>
    {map.totalUnits===0
      ?<div className="shop-map-purchases-empty"><strong>No purchases in this period.</strong>
        <p>Try the other period. Favorites are separate early response, not purchases.</p></div>
      :<>
        <div className="shop-map-purchases-grid">
          {leaders.map(card)}
          {chosen?<section className="shop-map-purchases-analysis" aria-live="polite" id="shop-map-selected-direction">
            <p className="mini-label">SELECTED PRODUCT</p>
            <h3>What to build next</h3>
            {chosen.listingId!==map.priorities[0]?.listingId?<p className="shop-map-purchases-selected-name">{shortLabel(chosen.title)}</p>:null}
            {direction
              ?<>
                <strong>{direction.kind==="test"?"Next specific test":direction.kind==="check-first"?"Candidate · check existing versions first":"Product review"}</strong>
                <p className="shop-map-purchases-next">{direction.proposedChange??direction.researchQuestion??"Review this exact purchased product before choosing a new test."}</p>
                {direction.retainedCharacteristic?<p>Keep {direction.retainedCharacteristic}.</p>:null}
                <details><summary>Product evidence and catalog check</summary>
                  <p>Catalog check: {direction.catalogCoverage}</p>
                  <p>Why now: {direction.whyNow}.</p>
                  {direction.researchQuestion?<p>Next step: {direction.researchQuestion}</p>:null}
                  <p>{chosen.orders} recorded transaction{chosen.orders===1?"":"s"} · Product revenue: {chosen.productRevenueMinor!==null&&chosen.currency?money(chosen.productRevenueMinor,chosen.currency):"Unavailable across currencies"}</p>
                  <a href={"https://www.etsy.com/listing/"+chosen.listingId} target="_blank" rel="noopener noreferrer">View source listing ↗</a>
                  {direction.relatedListingId?<a href={"https://www.etsy.com/listing/"+direction.relatedListingId} target="_blank" rel="noopener noreferrer">See existing version ↗</a>:null}
                </details>
                <div className="shop-map-purchases-next-actions">
                  <button type="button" onClick={()=>void copy()}>Copy next steps</button>
                  <a href={MIRRORBOT_URL} target="_blank" rel="noopener noreferrer" onClick={()=>void copy()}>Research this direction ↗</a>
                </div>
                {copyState?<p role="status">{copyState}</p>:null}
                {copyState.startsWith("Copy the full")?<textarea readOnly value={researchPrompt} aria-label="Full research context" onFocus={event=>event.currentTarget.select()}/>:null}
              </>
              :<div className="shop-map-purchases-pending">
                <p>{analysisFailed?"Product analysis could not load.":directions?"No supported product-specific direction is available yet.":"Checking this product image and related catalog…"}</p>
                <p>{analysisFailed?"Purchase priorities remain available.":directions?"Review this purchased product and its existing versions before choosing a build.":"Purchase evidence stays visible while product analysis loads."}</p>
                {analysisFailed&&onRetry?<button type="button" onClick={onRetry}>Retry product analysis</button>:null}
              </div>}
          </section>:null}
          {companions.map(card)}
        </div>
        {tiedBeyondCutoff.length>0?<button type="button" className="shop-map-purchases-ties" aria-expanded={showTies}
          onClick={()=>setShowTies(value=>!value)}>{showTies?"Hide tied priorities":"View all tied priorities ("+tiedBeyondCutoff.length+" more)"}</button>:null}
        <p className="shop-map-purchases-remaining">{map.totalUnits} units purchased across {map.totalOrders} recorded transactions in the {period}.
          {hiddenUnits>0?" "+hiddenUnits+" other purchased unit"+(hiddenUnits===1?"":"s")+" remain beyond these priorities.":""}</p>
        {additional.length>0?<section className="shop-map-purchases-more">
          <h3>More purchased products to review</h3>
          <p>The leading cards are a summary. These products also have recorded purchases in the {period}; a useful direction can come from any of them.</p>
          <ul>{displayedAdditional.map(row=>{
            const item=byListing.get(row.listingId);
            return <li key={row.listingId}>
              {row.imageUrl?<img src={row.imageUrl} alt="" width={66} height={66} loading="lazy"/>:
                <span className="shop-map-purchases-more-missing" aria-hidden="true">G</span>}
              <span><b>{shortLabel(row.title)}</b><small>{row.unitsPurchased} units · {percent(row.share)} {map.shareLabel.toLowerCase()}</small>
                <small>{item?.proposedChange??item?.researchQuestion??item?.catalogCoverage??"Product analysis pending."}</small></span>
              <button type="button" aria-pressed={chosen?.listingId===row.listingId}
                onClick={()=>{setSelectedId(row.listingId);setCopyState("");
                  document.getElementById("shop-map-selected-direction")?.scrollIntoView({block:"center"});}}>
                Review direction
              </button>
            </li>;
          })}</ul>
          {additional.length>displayedAdditional.length?<button type="button" className="shop-map-purchases-show-all"
            onClick={()=>setShowAllPurchased(true)}>Show all {additional.length} purchased products</button>:null}
        </section>:null}
      </>}
    {!map.receiptsComplete&&<p className="shop-map-purchases-caveat">Receipt import is incomplete. Shares use recorded matched purchases and may change after the next successful sales refresh.</p>}
    {map.unmatchedUnits>0&&<p className="shop-map-purchases-caveat">{map.unmatchedUnits} purchased unit{map.unmatchedUnits===1?"":"s"} could not be matched to a listing and are shown separately.</p>}
    {map.excludedRefundUnits>0&&<p className="shop-map-purchases-caveat">Some receipt-level refunds cannot be assigned to individual items. {map.excludedRefundUnits} affected unit{map.excludedRefundUnits===1?" is":"s are"} excluded from this ranking until their attribution is clear.</p>}
  </section>;
}