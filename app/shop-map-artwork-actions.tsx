"use client";
import {useState} from "react";
import type {WinningPatternMap} from "./shop-map-patterns";
import type {PurchasePriorityMap} from "./shop-map-purchase-priorities";
import {purchasedPatternSupport} from "./shop-map-supporting-patterns";
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

export function ArtworkRecommendations({map,purchasePriorities=null,marketProof=[]}:{
  map:WinningPatternMap;purchasePriorities?:PurchasePriorityMap|null;marketProof?:ArtworkMarketProof[];
}){
  const [copied,setCopied]=useState("");
  const [copyFailed,setCopyFailed]=useState("");
  const rows=purchasedPatternSupport(map,purchasePriorities);
  if(!rows.length)return null;
  const proofByKey=new Map(marketProof.map(row=>[row.patternKey,row]));
  const copyPrompt=async(key:string,prompt:string)=>{
    try{
      await navigator.clipboard.writeText(prompt);
      setCopied(key);setCopyFailed("");
      window.setTimeout(()=>setCopied(current=>current===key?"":current),1600);
    }catch{setCopyFailed(key)}
  };
  return <section className="shop-map-recommendations">
    <div className="shop-map-section-head"><h2>Go deeper</h2></div>
    <div className="shop-map-recommendation-list">
      {rows.map(({pattern:row,source})=>{
        const proof=proofByKey.get(row.key);
        const sourceSentence=source&&purchasePriorities
          ?`Purchased listing #${source.listingId} ("${source.title}") received ${source.unitsPurchased} units across ${source.orders} recorded transactions in the last ${purchasePriorities.days} days (${Math.round(source.share*100)}% ${purchasePriorities.shareLabel.toLowerCase()}). Its title identifies the record; inspect its actual imagery for creative meaning.`
          :`No purchased product in the selected period is linked to this visual observation. Treat it as background research, not a build priority.`;
        const prompt=`${sourceSentence} Its analyzed artwork contributes to the shared visual observation "${row.label}" (${row.customerPercent}% of ${map.basisLabel}; ${row.catalogPercent}% of active analyzed artworks). That catalog comparison is supporting context and must not rerank the purchased products. Research the exact source product's visible characteristics and one distinct original variation in an already supported production format. Check existing versions, product feasibility, and relevant Etsy organic-demand evidence before recommending a test. If the needed evidence is missing, name the focused question instead. Do not infer artwork from SEO titles or tags, invent a buyer identity, claim stock decreases are purchases, copy Etsy phrases, or prescribe a listing quota.`;
        return <details key={row.key} className="shop-map-mirrorbot">
          <summary>{row.label} · {source?"WINNER RESEARCH":"VISUAL RESEARCH"}</summary>
          <div>
            {source?<p>Start with purchased listing #{source.listingId}: {source.unitsPurchased} units in the last {purchasePriorities?.days??90} days.</p>:null}
            <p>{prompt}</p>
            <div className="shop-map-mirrorbot-actions">
              <button type="button" onClick={()=>void copyPrompt(row.key,prompt)}>{copied===row.key?"Copied":copyFailed===row.key?"Copy failed — select the prompt text":"Copy MirrorBot prompt"}</button>
              <a href={MIRRORBOT_URL} target="_blank" rel="noreferrer">Open MirrorBot ↗</a>
            </div>
            <p>Copy the prompt, then paste it into MirrorBot. Opening it does not transfer this context.</p>
            {proof?<div className="shop-map-market-proof">
              <div><span>SAVED-WATCH STOCK MOVEMENT</span>
                <a href={`/market-watch?tab=niches&keyword=${encodeURIComponent(proof.phrase)}`}>See watch observations →</a></div>
              <p>{proof.sellingListings>0
                ?`The matching saved watch recorded ${proof.observedSold30} observed stock decreases across ${proof.sellingListings} listings in 30 days. Inspect source observations before treating these as purchases.`
                :`${proof.moving} listings show stock movement in the matching saved watch.`}</p>
              {!!proof.productFamilies?.length&&<p>Observed product types: {proof.productFamilies.slice(0,2).map(item=>`${familyLabel(item.family)} (${item.sold30} stock decreases)`).join(" · ")}.</p>}
            </div>:null}
          </div>
        </details>;
      })}
    </div>
  </section>;
}
