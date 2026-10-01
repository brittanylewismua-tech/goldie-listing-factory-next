"use client";
import type { PurchasePriorityMap } from "@/app/shop-map-purchase-priorities";
import type { ProductDirection } from "@/app/shop-map-product-expansion";

const money=(minor:number,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(minor/100);
const percent=(share:number)=>share>0&&share<.005?"<1%":`${Math.round(share*100)}%`;

export default function PurchasePriorities({map,directions=[]}:{map:PurchasePriorityMap;directions?:ProductDirection[]}){
  const byListing=new Map(directions.map(row=>[row.listingId,row]));
  const lead=map.priorities[0];
  const leadDirection=lead?byListing.get(lead.listingId):null;
  const period=`last ${map.days} days`;
  const sharePhrase=map.shareLabel==="Share of shop purchases"?"your shop’s purchases":"matched purchases";
  const refreshed=map.refreshedAt
    ? new Date(map.refreshedAt*1000).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})
    : null;
  return <section className="shop-map-purchases" aria-labelledby="shop-map-purchases-title">
    <div className="shop-map-purchases-head">
      <div><p className="mini-label">PURCHASE-LED PRIORITIES</p>
        <h2 id="shop-map-purchases-title">Where to focus next</h2>
        {lead?<p className="shop-map-purchases-leadline"><b>{lead.title}</b> · {lead.unitsPurchased} purchased units ({percent(lead.share)} {map.shareLabel.toLowerCase()}).
          {leadDirection?.kind==="test"?<span> Next test: {leadDirection.proposedChange}</span>:null}
        </p>:<p>Build out what your customers are already buying.</p>}</div>
    </div>
    {map.totalUnits===0
      ? <div className="shop-map-purchases-empty">
          <strong>No purchases in this period.</strong>
          <p>Try the other period to look for a purchased product to build from. Favorites are separate early response, not purchases.</p>
        </div>
      : <>
        <p className="shop-map-purchases-summary">
          {map.totalUnits} units purchased across {map.totalOrders} recorded transaction{map.totalOrders===1?"":"s"} in the {period}.
          The product with the most unit votes leads the next build decision.
        </p>
        <div className="shop-map-purchases-grid">
          {map.priorities.map((row,index)=><article key={row.listingId} className={row.rank===1?"purchase-lead":""}>
            <span className="shop-map-purchases-rank">Priority {row.rank}</span>
            <div className="shop-map-purchases-product">
              {row.imageUrl?<img src={row.imageUrl} alt="" width={82} height={82} loading="lazy"/>:
                <span className="shop-map-purchases-image-missing" aria-label="Listing image unavailable">G</span>}
              <div><h3>{row.title}</h3><small>{row.state==="sold_out"?"Sold out · historical purchases":row.state==="inactive"?"Inactive · historical purchases":""}</small></div>
            </div>
            <p className="shop-map-purchases-votes"><strong>{row.unitsPurchased}</strong> units purchased</p>
            <p className="shop-map-purchases-share">{percent(row.share)} {map.shareLabel.toLowerCase()} · {row.orders} recorded transaction{row.orders===1?"":"s"}</p>
            <p className="shop-map-purchases-revenue">Product revenue: {row.productRevenueMinor!==null&&row.currency?money(row.productRevenueMinor,row.currency):"Unavailable across currencies"}</p>
            <p className="shop-map-purchases-guidance">{row.rank===1
              ? `This product accounts for ${percent(row.share)} of ${sharePhrase} in the ${period}. Give this product direction the most attention in your next build.`
              : `Keep this purchased product visible at its actual strength while building from the leader.`}</p>
            {byListing.has(row.listingId)?(()=>{
              const direction=byListing.get(row.listingId)!;
              return <div className="shop-map-purchases-analysis">
                <strong>{direction.kind==="test"?"Next specific test":"Product review"}</strong>
                {direction.retainedCharacteristic?<p>Keep: {direction.retainedCharacteristic}.</p>:null}
                {direction.proposedChange?<p>Change: {direction.proposedChange}</p>:null}
                <p>Catalog check: {direction.catalogCoverage}</p>
                <p>Why now: {direction.whyNow}.</p>
                {direction.researchQuestion?<p>Next step: {direction.researchQuestion}</p>:null}
                {direction.relatedListingId?<a href={`https://www.etsy.com/listing/${direction.relatedListingId}`} target="_blank" rel="noopener noreferrer">See existing listing ↗</a>:null}
              </div>;
            })():<p className="shop-map-purchases-analysis">Checking this product image and related catalog before suggesting a next test.</p>}
          </article>)}
        </div>
        <p className="shop-map-purchases-remaining">{map.remainingUnits} other purchased unit{map.remainingUnits===1?"":"s"} in the {period} remain outside these leading cards.</p>
      </>}
    {!map.receiptsComplete&&<p className="shop-map-purchases-caveat">Receipt import is incomplete. Shares use recorded matched purchases and may change after the next successful sales refresh.</p>}
    {map.unmatchedUnits>0&&<p className="shop-map-purchases-caveat">{map.unmatchedUnits} purchased unit{map.unmatchedUnits===1?"":"s"} could not be matched to a listing and are shown separately.</p>}
    {map.excludedRefundUnits>0&&<p className="shop-map-purchases-caveat">Some receipt-level refunds cannot be assigned to individual items. {map.excludedRefundUnits} affected unit{map.excludedRefundUnits===1?" is":"s are"} excluded from this ranking until their attribution is clear.</p>}
    <small className="shop-map-purchases-refresh">{refreshed?`Last successful sales refresh: ${refreshed}`:"Sales refresh time unavailable"}</small>
  </section>;
}
