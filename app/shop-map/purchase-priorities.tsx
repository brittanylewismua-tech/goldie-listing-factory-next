"use client";
import type {PurchasePriorityMap,PurchasePriority} from "@/app/shop-map-purchase-priorities";
import type {ProductDirection} from "@/app/shop-map-product-expansion";
import {shortLabel} from "@/app/design-reach";
import {useState} from "react";

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";
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
  const chosen=map.listings.find(row=>row.listingId===selectedId)??visiblePriorities[0];
  const visibleIds=new Set(visiblePriorities.map(row=>row.listingId));
  const additional=map.listings.filter(row=>!visibleIds.has(row.listingId));
  const displayedAdditional=showAllPurchased?additional:additional.slice(0,6);
  const direction=chosen?byListing.get(chosen.listingId):null;
  const period="last "+map.days+" days";
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
    try{await navigator.clipboard.writeText(researchPrompt);setCopyState("Prompt copied. Paste it into MirrorBot.")}
    catch{setCopyState("Copy the prompt below and paste it into MirrorBot.");}
  };
  const choiceLabel=direction?.kind==="test"?"NEXT TEST"
    :direction?.kind==="check-first"?"CHECK FIRST":"PRODUCT REVIEW";
  const choiceAction=direction?.proposedChange??direction?.researchQuestion
    ??(analysisFailed?"Product analysis unavailable.":directions?"Review this product.":"Checking product imagery…");
  const card=(row:PurchasePriority)=><button key={row.listingId} type="button"
    className="oe-top-card" aria-pressed={chosen?.listingId===row.listingId}
    aria-label={"Review "+row.title+": "+row.unitsPurchased+" units purchased"}
    onClick={()=>{setSelectedId(row.listingId);setCopyState("");}}>
    <span className="oe-top-photo">{row.imageUrl
      ?<img src={row.imageUrl} alt="" width={96} height={96} loading="lazy"/>
      :<span>Image unavailable</span>}</span>
    <span className="oe-top-name">{shortLabel(row.title)}
      {row.state==="sold_out"||row.state==="inactive"
        ?<small>{row.state==="sold_out"?"Sold out":"Inactive"}</small>:null}
    </span>
    <span className="oe-top-units"><b>{row.unitsPurchased}</b><small>sold</small></span>
  </button>;
  return <section className="oe-engine" aria-labelledby="oe-title">
    <div className="oe-lead">
      <div className="oe-lead-art">
        <span>{chosen?.rank===1?"01 / LEADING PRODUCT":"PURCHASED PRODUCT"}</span>
        {chosen?.imageUrl?<img src={chosen.imageUrl} alt={chosen.title} width={320} height={320}
          loading="eager" fetchPriority="high"/>:
          <div className="oe-image-missing">Listing image unavailable</div>}
      </div>
      <div className="oe-lead-copy" id="shop-map-selected-direction">
        <p className="oe-eyebrow">{direction?choiceLabel:"PURCHASED PRODUCT"}</p>
        <h2 id="oe-title">{map.totalUnits===0?"No purchases in this period.":choiceAction}</h2>
        {chosen?<><div className="oe-lead-stats">
          <div><b>{chosen.unitsPurchased}</b><span>units sold</span></div>
          <div><b>{percent(chosen.share)}</b><span>{map.shareLabel.toLowerCase()}</span></div>
        </div>
        <p className="oe-lead-product">{shortLabel(chosen.title)}</p>
        {direction?.kind==="check-first"?<p className="oe-lead-note">Confirm production fit before making it.</p>:null}
        {!direction&&analysisFailed&&onRetry?<button className="oe-retry" type="button" onClick={onRetry}>Retry product analysis</button>:null}
        {!direction&&!analysisFailed&&!directions?<p className="oe-lead-note" role="status">Checking product imagery and related catalog…</p>:null}
        <details className="oe-detail"><summary>Why this direction</summary>
          {direction?.retainedCharacteristic?<p>Keep {direction.retainedCharacteristic}.</p>:null}
          {direction?.catalogCoverage?<p>{direction.catalogCoverage}</p>:null}
          {direction?.researchQuestion?<p>{direction.researchQuestion}</p>:null}
          <a href={"https://www.etsy.com/listing/"+chosen.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
          {direction?.relatedListingId?<a href={"https://www.etsy.com/listing/"+direction.relatedListingId} target="_blank" rel="noopener noreferrer">See existing version</a>:null}
          {researchPrompt?<div className="oe-detail-actions">
            <button type="button" onClick={()=>void copy()}>Copy research context</button>
            <a href={MIRRORBOT_URL} target="_blank" rel="noopener noreferrer" onClick={()=>void copy()}>Open MirrorBot</a>
          </div>:null}
          {copyState?<p role="status">{copyState}</p>:null}
          {copyState.startsWith("Copy the prompt")?<textarea readOnly value={researchPrompt} aria-label="Full research context" onFocus={event=>event.currentTarget.select()}/>:null}
        </details></>:<p className="oe-lead-note">Try another period to see purchased products. Favorites remain a separate early signal.</p>}
      </div>
    </div>
    {map.totalUnits>0?<><div className="oe-section-heading"><h3>Your top listings</h3><small>Last {map.days} days</small></div>
      <div className="oe-top-grid">{visiblePriorities.map(card)}</div>
      {tiedBeyondCutoff.length>0?<button type="button" className="oe-ties" aria-expanded={showTies}
        onClick={()=>setShowTies(value=>!value)}>{showTies?"Hide tied listings":"View "+tiedBeyondCutoff.length+" tied listing"+(tiedBeyondCutoff.length===1?"":"s")}</button>:null}
      {additional.length>0?<details className="oe-more">
        <summary>More purchased products</summary>
        <div className="oe-more-list">{displayedAdditional.map(row=><button type="button" key={row.listingId}
          aria-pressed={chosen?.listingId===row.listingId}
          onClick={()=>{setSelectedId(row.listingId);setCopyState("");
            document.getElementById("shop-map-selected-direction")?.scrollIntoView({block:"center"});}}>
          {row.imageUrl?<img src={row.imageUrl} alt="" width={44} height={44} loading="lazy"/>:
            <span className="oe-more-missing">G</span>}
          <span>{shortLabel(row.title)}</span><b>{row.unitsPurchased} sold</b>
        </button>)}</div>
        {additional.length>displayedAdditional.length?<button type="button" className="oe-show-all"
          onClick={()=>setShowAllPurchased(true)}>Show all {additional.length} purchased products</button>:null}
      </details>:null}</>:null}
    {!map.receiptsComplete||map.unmatchedUnits>0||map.excludedRefundUnits>0?<details className="oe-data-note">
      <summary>About these purchase figures</summary>
      {!map.receiptsComplete?<p>Receipt import is incomplete. Shares may change after the next successful refresh.</p>:null}
      {map.unmatchedUnits>0?<p>{map.unmatchedUnits} purchased units could not be matched to a listing.</p>:null}
      {map.excludedRefundUnits>0?<p>{map.excludedRefundUnits} refund-affected units are excluded until attribution is clear.</p>:null}
    </details>:null}
  </section>;
}
