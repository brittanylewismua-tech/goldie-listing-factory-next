"use client";
import {useState} from "react";
import type {WinningPatternMap} from "./shop-map-patterns";

export type ArtworkMarketProof={
  patternKey:string;
  phrase:string;
  sellingListings:number;
  observedSold30:number;
  moving:number;
};

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";

export function ArtworkNextBuild({map}:{map:WinningPatternMap}){
  const rows=map.patterns.filter(row=>row.gapPoints>0).slice(0,3);
  if(!rows.length)return null;
  return <section className="shop-map-next-build">
    <div className="shop-map-section-head"><div>
      <p className="mini-label">WHERE TO BUILD NEXT</p>
      <h2>Build on the artwork customers are rewarding.</h2>
      <p>This order follows the gap between customer response and active designs.</p>
    </div></div>
    <div className="shop-map-next-build-grid">
      {rows.map((row,index)=>{
        const example=map.listings.find(listing=>row.listingIds.includes(listing.listingId));
        return <article key={row.key}>
          <div className="shop-map-next-build-count">{String(index+1).padStart(2,"0")}</div>
          <div className="shop-map-next-build-copy">
            <div><span>{index===0?"FIRST PRIORITY":"NEXT PRIORITY"}</span><b>{row.label}</b></div>
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
    <div className="shop-map-section-head"><div>
      <p className="mini-label">WHAT TO DO NEXT</p><h2>Turn the ranking into action</h2>
      <p>Each move starts with artwork Goldie has analyzed and response your shop has earned.</p>
    </div></div>
    <div className="shop-map-recommendation-list">
      {rows.map(row=>{
        const buildDeeper=row.gapPoints>0;
        const proof=proofByKey.get(row.key);
        const prompt=`My Etsy print-on-demand shop has a proven artwork concept: "${row.label}". It accounts for ${row.customerPercent}% of ${map.basisLabel}, while ${row.catalogPercent}% of active designs carry it. Suggest distinct product or message variations to test within this demonstrated demand. Ground every idea in the actual artwork concept, emotional resonance, and Etsy organic demand. Do not infer the artwork from SEO titles or tags. Do not prescribe an arbitrary number of listings.`;
        return <article key={row.key} className={`shop-map-recommendation ${buildDeeper?"underbuilt":"aligned"}`}>
          <div className="shop-map-recommendation-rank">{String(row.rank).padStart(2,"0")}</div>
          <div className="shop-map-recommendation-copy">
            <div className="shop-map-recommendation-label"><span>{row.label}</span>
              <em>{buildDeeper?"BUILD DEEPER":"PROTECT THE WINNER"}</em></div>
            <h3>{buildDeeper?"Test a variation of this proven concept":"Keep this concept working"}</h3>
            <p>{row.customerPercent}% of customer response comes from this artwork concept, compared with {row.catalogPercent}% of active designs.</p>
            <strong>{buildDeeper
              ?"Create a distinct variation that keeps the same buyer meaning, then let Etsy response decide whether to expand it."
              :"Maintain the proven listings and test a new variation only when it has a clear buyer reason."}</strong>
            {proof?<div className="shop-map-market-proof">
              <div><span>MARKET RADAR SUPPORT</span>
                <a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(proof.phrase)}`}>Open tracked keyword →</a></div>
              <p>{proof.sellingListings>0
                ?`The exact tracked phrase “${proof.phrase}” has ${proof.sellingListings} selling listings and ${proof.observedSold30} observed units sold in the last 30 days.`
                :`The exact tracked phrase “${proof.phrase}” has ${proof.moving} listings showing selling movement.`}</p>
            </div>:null}
            <details className="shop-map-mirrorbot"><summary>Go deeper with MirrorBot</summary>
              <div><p>{prompt}</p><div className="shop-map-mirrorbot-actions">
                <button type="button" onClick={()=>void copyPrompt(row.key,prompt)}>{copied===row.key?"Copied":"Copy prompt"}</button>
                <a href={MIRRORBOT_URL} target="_blank" rel="noreferrer">Open MirrorBot ↗</a>
              </div></div>
            </details>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
