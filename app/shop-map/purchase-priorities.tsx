"use client";
import type {PurchasePriorityMap,PurchasePriority} from "@/app/shop-map-purchase-priorities";
import type {ProductDirection} from "@/app/shop-map-product-expansion";
import type {ShopFinding} from "@/app/shop-map-opportunity-discovery";
import {shortLabel} from "@/app/design-reach";
import {useState} from "react";

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";
const percent=(share:number)=>share>0&&share<.005?"<1%":String(Math.round(share*100))+"%";
const directionTitle=(row:ProductDirection|undefined,failed:boolean,settled:boolean)=>{
  if(!row)return failed?"Product analysis unavailable.":settled?"Product evidence is incomplete.":"Checking product evidence…";
  if(row.kind==="already-offered")return "Compare the existing "+(row.targetFormat||"version")+" before building another.";
  if(row.kind==="availability-review")return "Check whether this purchased product can be restored.";
  if(row.kind==="check-first")return "Verify existing versions before choosing a test.";
  if(row.kind==="test")return row.proposedChange||"Review this possible test.";
  return "Review this product and its related offers.";
};
const directionLabel=(row:ProductDirection|undefined)=>
  row?.kind==="already-offered"?"EXISTING VERSION":
  row?.kind==="availability-review"?"RESTORE":
  row?.kind==="test"?"POSSIBLE TEST":row?.kind==="check-first"?"EVIDENCE GAP":"PRODUCT REVIEW";

export default function PurchasePriorities({map,directions,findings=[],analysisFailed=false,onRetry}:{
  map:PurchasePriorityMap;directions?:ProductDirection[];findings?:ShopFinding[];
  analysisFailed?:boolean;onRetry?:()=>void;
}){
  const [showTies,setShowTies]=useState(false);
  const [showAllPurchased,setShowAllPurchased]=useState(false);
  const [copyState,setCopyState]=useState("");
  const byListing=new Map((directions??[]).map(row=>[row.listingId,row]));
  const cutoffUnits=map.priorities.at(-1)?.unitsPurchased??0;
  const tiedBeyondCutoff=map.listings.slice(map.priorities.length)
    .filter(row=>row.unitsPurchased===cutoffUnits);
  const visiblePriorities=showTies?[...map.priorities,...tiedBeyondCutoff]:map.priorities;
  const visibleIds=new Set(visiblePriorities.map(row=>row.listingId));
  const additional=map.listings.filter(row=>!visibleIds.has(row.listingId));
  const displayedAdditional=showAllPurchased?additional:additional.slice(0,6);
  const findingFor=(id:number)=>findings.find(row=>row.listingIds[0]===id
    &&(row.kind==="compare"||row.kind==="restore"));
  const promptFor=(row:PurchasePriority,direction:ProductDirection|undefined)=>{
    if(!direction)return "";
    return ["Research one feasible original next move for purchased listing #"+row.listingId+" ("+row.title+").",
      "It received "+row.unitsPurchased+" purchased units in the last "+map.days+" days ("+
        percent(row.share)+" "+map.shareLabel.toLowerCase()+").",
      direction.retainedCharacteristic?"Observed characteristic: "+direction.retainedCharacteristic+".":"",
      direction.catalogCoverage?"Catalog evidence: "+direction.catalogCoverage:"",
      direction.researchQuestion||"Compare actual imagery, existing versions, production fit and relevant Etsy products.",
      "Do not infer imagery from SEO titles, invent competitor sales or recommend a duplicate."]
      .filter(Boolean).join("\n");
  };
  const copy=async(row:PurchasePriority,direction:ProductDirection|undefined)=>{
    const prompt=promptFor(row,direction);
    if(!prompt)return;
    try{await navigator.clipboard.writeText(prompt);setCopyState("Copied for listing "+row.listingId+".");}
    catch{setCopyState("Copy unavailable for listing "+row.listingId+".");}
  };
  const card=(row:PurchasePriority)=>{
    const direction=byListing.get(row.listingId);
    const finding=findingFor(row.listingId);
    const diagnosis=finding?.evidence??(direction?.kind==="already-offered"
      ?direction.catalogCoverage:direction?.kind==="availability-review"
      ?direction.catalogCoverage:direction?.kind==="check-first"
      ?"Catalog coverage or production fit needs checking.":direction?.kind==="research"
      ?"Product or related-listing evidence is incomplete.":"");
    const title=finding?.direction??directionTitle(direction,analysisFailed,Boolean(directions));
    return <article className="oe-priority-card" key={row.listingId}>
      <div className="oe-priority-art">
        <span className="oe-priority-rank">{String(row.rank).padStart(2,"0")} / PRIORITY</span>
        {row.imageUrl?<img src={row.imageUrl} alt={row.title} width={240} height={240}
          loading={row.rank===1?"eager":"lazy"} fetchPriority={row.rank===1?"high":undefined}/>:
          <div className="oe-image-missing">Listing image unavailable</div>}
      </div>
      <div className="oe-priority-body">
        <h3>{shortLabel(row.title)}</h3>
        <div className="oe-priority-metrics"><div><b>{row.unitsPurchased}</b><span>sold</span></div>
          <div><b>{percent(row.share)}</b><span>{map.shareLabel.toLowerCase()}</span></div></div>
        <span className="oe-priority-label">{finding?.label??directionLabel(direction)}</span>
        {diagnosis?<p className="oe-priority-diagnosis">{diagnosis}</p>:null}
        <p className="oe-priority-direction">{title}</p>
        {!direction&&analysisFailed&&onRetry?<button className="oe-retry" type="button" onClick={onRetry}>Retry product analysis</button>:null}
        <details className="oe-priority-detail"><summary>See product evidence</summary>
          {direction?.retainedCharacteristic?<p>Observed: {direction.retainedCharacteristic}.</p>:null}
          {finding?.detail?<p>{finding.detail}</p>:null}
          {direction?.catalogCoverage&&finding?.evidence!==direction.catalogCoverage?<p>{direction.catalogCoverage}</p>:null}
          {direction?.researchQuestion?<p>{direction.researchQuestion}</p>:null}
          <a href={"https://www.etsy.com/listing/"+row.listingId} target="_blank" rel="noopener noreferrer">View source listing</a>
          {direction?.relatedListingId?<a href={"https://www.etsy.com/listing/"+direction.relatedListingId} target="_blank" rel="noopener noreferrer">See existing version</a>:null}
          {direction?<div className="oe-detail-actions"><button type="button" onClick={()=>void copy(row,direction)}>Copy research context</button>
            <a href={MIRRORBOT_URL} target="_blank" rel="noopener noreferrer" onClick={()=>void copy(row,direction)}>Open MirrorBot</a></div>:null}
          {copyState.endsWith("listing "+row.listingId+".")?<p role="status">{copyState}</p>:null}
          {copyState==="Copy unavailable for listing "+row.listingId+"."?<textarea readOnly value={promptFor(row,direction)}
            aria-label="Full research context" onFocus={event=>event.currentTarget.select()}/>:null}
        </details>
      </div>
    </article>;
  };
  return <section className="oe-engine" aria-labelledby="oe-title">
    <div className="oe-section-heading"><h2 id="oe-title">Your top three</h2><small>Last {map.days} days</small></div>
    {map.totalUnits>0?<><div className="oe-priority-grid">{visiblePriorities.map(card)}</div>
      {tiedBeyondCutoff.length>0?<button type="button" className="oe-ties" aria-expanded={showTies}
        onClick={()=>setShowTies(value=>!value)}>{showTies?"Hide tied listings":"View "+tiedBeyondCutoff.length+" tied listing"+(tiedBeyondCutoff.length===1?"":"s")}</button>:null}
      {additional.length>0?<details className="oe-more"><summary>More purchased products</summary>
        <div className="oe-priority-grid oe-additional-grid">{displayedAdditional.map(card)}</div>
        {additional.length>displayedAdditional.length?<button type="button" className="oe-show-all"
          onClick={()=>setShowAllPurchased(true)}>Show all {additional.length} purchased products</button>:null}
      </details>:null}</>:<p className="oe-lead-note">No purchases in this period. Try another period to see purchased products.</p>}
    {!map.receiptsComplete||map.unmatchedUnits>0||map.excludedRefundUnits>0?<details className="oe-data-note">
      <summary>About these purchase figures</summary>
      {!map.receiptsComplete?<p>Receipt import is incomplete. Shares may change after the next successful refresh.</p>:null}
      {map.unmatchedUnits>0?<p>{map.unmatchedUnits} purchased units could not be matched to a listing.</p>:null}
      {map.excludedRefundUnits>0?<p>{map.excludedRefundUnits} refund-affected units are excluded until attribution is clear.</p>:null}
    </details>:null}
  </section>;
}
