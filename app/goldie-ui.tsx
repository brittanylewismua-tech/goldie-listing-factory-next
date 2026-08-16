"use client";

import type { ReactNode } from "react";

export function GoldieStatus({tone="neutral",children}:{tone?:"neutral"|"success"|"attention";children:ReactNode}){
  return <span className={`goldie-status ${tone}`}>{children}</span>;
}

export function GoldieButton({children,tone="primary",className="",...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{tone?:"primary"|"secondary"}){
  return <button className={`goldie-button ${tone} ${className}`.trim()} {...props}>{children}</button>;
}

export function WorkflowMomentum({current,total,label}:{current:number;total:number;label:string}){
  const completed=Math.max(0,current-1),percent=Math.round((completed/total)*100);
  return <section className="workflow-momentum" aria-label={`${percent}% of this batch workflow complete`}>
    <div><GoldieStatus tone={completed?"success":"neutral"}>{completed?"✓ Saved":"Autosave on"}</GoldieStatus><span>{label}</span><b>{completed} of {total} steps complete</b></div>
    <div className="momentum-track" aria-hidden="true"><span style={{width:`${percent}%`}}/></div>
  </section>;
}

export function GoldieInsight({children}:{children:ReactNode}){
  return <aside className="goldie-insight" aria-label="Goldie insight"><span aria-hidden="true">G</span><div><b>Goldie noticed</b><p>{children}</p></div></aside>;
}

export function ActionReceipt({items}:{items:Array<{value:string;label:string}>}){
  return <section className="action-receipt" aria-label="Completed work">{items.map(item=><div key={item.label}><span aria-hidden="true">✓</span><p><b>{item.value}</b><small>{item.label}</small></p></div>)}</section>;
}

export type BatchReceipt={publishedCount:number;etsyUrls:string[];completedAt:string};

export function OutcomeReceipt({receipt,productName,shippingProfile,imageCount,sizeGuideName,tagCount,mockupCount,variantCount,minutesSaved,onNewBatch,onDuplicate}:{receipt:BatchReceipt;productName:string;shippingProfile:string;imageCount:number;sizeGuideName?:string;tagCount:number;mockupCount:number;variantCount:number;minutesSaved:number;onNewBatch:()=>void;onDuplicate:()=>void}){
  return <section className="outcome-receipt" aria-live="polite">
    <div className="receipt-celebration" aria-hidden="true"><span>✓</span></div>
    <p className="mini-label">BATCH COMPLETE</p>
    <h2>{receipt.publishedCount} {receipt.publishedCount===1?"listing is":"listings are"} live on Etsy.</h2>
    <p>Goldie finished the batch and verified the handoff. Here is exactly what happened.</p>
    <div className="receipt-value-strip"><div><b>{tagCount}</b><span>tags generated</span></div><div><b>{mockupCount}</b><span>mockups prepared</span></div><div><b>{variantCount}</b><span>variant prices approved</span></div><div><b>{Math.floor(minutesSaved/60)}h {minutesSaved%60}m</b><span>estimated setup time saved</span></div></div>
    <div className="receipt-grid">
      <article><span>Published</span><b>{receipt.publishedCount} Etsy {receipt.publishedCount===1?"listing":"listings"}</b></article>
      <article><span>Product</span><b>{productName||"Printify product"}</b></article>
      <article><span>Shipping</span><b>{shippingProfile||"Selected Etsy profile"}</b></article>
      <article><span>Images</span><b>{imageCount} Printify {imageCount===1?"image":"images"}{sizeGuideName?" + size guide":""}</b></article>
    </div>
    {receipt.etsyUrls.length>0&&<div className="receipt-links">{receipt.etsyUrls.map((url,index)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">Open Etsy listing {index+1} ↗</a>)}</div>}
    <div className="receipt-actions"><GoldieButton onClick={onDuplicate}>Duplicate this workflow</GoldieButton><GoldieButton tone="secondary" onClick={onNewBatch}>Choose another product</GoldieButton><a href="/batches">View batch history</a></div>
    <small>Completed {new Date(receipt.completedAt).toLocaleString()}</small>
  </section>;
}
