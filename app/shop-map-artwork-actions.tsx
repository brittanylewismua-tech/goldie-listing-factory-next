"use client";
import {useState} from "react";
import type {WinningPatternMap} from "./shop-map-patterns";
import {familyLabel} from "./design-reach";

export type ArtworkMarketProof={
  patternKey:string;
  phrase:string;
  sellingListings:number;
  observedSold30:number;
  moving:number;
  productFamilies:Array<{family:string;sold30:number}>;
};

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";

export function ArtworkNextBuild({map}:{map:WinningPatternMap}){
  const rows=map.patterns.filter(row=>row.gapPoints>0).slice(0,3);
  if(!rows.length)return null;
  return <section className="shop-map-next-build">
    <div className="shop-map-section-head"><div>
      <p className="mini-label">WHERE TO BUILD NEXT</p>
      <h2>Build on the artwork customers are rewarding.</h2>
      <p>These are catalog comparisons; purchase-ranked products determine the build order.</p>
    </div></div>
    <div className="shop-map-next-build-grid">
      {rows.map((row,index)=>{
        const example=map.listings.find(listing=>row.listingIds.includes(listing.listingId));
        return <article key={row.key}>
          <div className="shop-map-next-build-count">{String(index+1).padStart(2,"0")}</div>
          <div className="shop-map-next-build-copy">
            <div><span>{index===0?"VISUAL PATTERN":"ANOTHER PATTERN"}</span><b>{row.label}</b></div>
            <p>{row.customerPercent}% of customer response · {row.catalogPercent}% of active designs</p>
            {example?<a href={`https://www.etsy.com/listing/${example.listingId}`} target="_blank" rel="noopener noreferrer">See a proven listing ↗</a>:null}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

export function ArtworkRecommendations({map,marketProof=[]}:{
  map:WinningPatternMap;marketProof?:ArtworkMarketProof[];
}){
  const [copied,setCopied]=useState("");
  const rows=map.patterns.slice(0,4);
  if(!rows.length)return null;
  const proofByKey=new Map(marketProof.map(row=>[row.patternKey,row]));
  const copyPrompt=async(key:string,prompt:string)=>{
    try{
      await navigator.clipboard.writeText(prompt);
      setCopied(key);
      window.setTimeout(()=>setCopied(current=>current===key?"":current),1600);
    }catch{}
  };
  return <section className="shop-map-recommendations">
    <div className="shop-map-section-head"><h2>Go deeper</h2></div>
    <div className="shop-map-recommendation-list">
      {rows.map(row=>{
        const move=row.gapPoints>0?"EXPLORE VARIATION":row.gapPoints<0?"REVIEW COVERAGE":"MAINTAIN";
        const proof=proofByKey.get(row.key);
        const prompt=`My Etsy shop has a proven product concept: "${row.label}". It accounts for ${row.customerPercent}% of ${map.basisLabel}, while ${row.catalogPercent}% of active designs carry it. Research the buyer identity, emotional tensions, language, occasions, and visual mechanisms behind this actual artwork concept. ${row.gapPoints>0?"Suggest distinct variations worth testing within demonstrated demand.":row.gapPoints<0?"Help me compare availability, selling time, and exposure before deciding whether another variation is warranted.":"Suggest how to maintain the winner and test only a variation with a clear buyer reason."} Ground every idea in Etsy organic demand. Do not infer artwork from SEO titles or tags, copy existing Etsy phrases, or prescribe an arbitrary listing count.`;
        return <details key={row.key} className="shop-map-mirrorbot">
          <summary>{row.label} · {move}</summary>
          <div>
            <p>{prompt}</p>
            <div className="shop-map-mirrorbot-actions">
              <button type="button" onClick={()=>void copyPrompt(row.key,prompt)}>{copied===row.key?"Copied":"Copy MirrorBot prompt"}</button>
              <a href={MIRRORBOT_URL} target="_blank" rel="noreferrer">Open MirrorBot ↗</a>
            </div>
            {proof?<div className="shop-map-market-proof">
              <div><span>MARKET RADAR SUPPORT</span>
                <a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(proof.phrase)}`}>See market evidence →</a></div>
              <p>{proof.sellingListings>0
                ?`In the matching saved watch, ${proof.sellingListings} listings sold ${proof.observedSold30} observed units in 30 days.`
                :`${proof.moving} listings show selling movement in the matching saved watch.`}</p>
              {!!proof.productFamilies?.length&&<p>Observed product types: {proof.productFamilies.slice(0,2).map(item=>`${familyLabel(item.family)} (${item.sold30} units)`).join(" · ")}.</p>}
            </div>:null}
          </div>
        </details>;
      })}
    </div>
  </section>;
}
