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
  return <aside className="goldie-insight" aria-label="Helpful information"><span aria-hidden="true">G</span><div><b>Good to know</b><p>{children}</p></div></aside>;
}

export function ActionReceipt({items}:{items:Array<{value:string;label:string}>}){
  return <section className="action-receipt" aria-label="Completed work">{items.map(item=><div key={item.label}><span aria-hidden="true">✓</span><p><b>{item.value}</b><small>{item.label}</small></p></div>)}</section>;
}

export type BatchReceipt={publishedCount:number;etsyUrls:string[];completedAt:string};

export function OutcomeReceipt({goalLine,receipt,productName,shippingProfile,imageCount,sizeGuideName,tagCount,variantCount,minutesSaved,nextBundleProduct,bundleComplete,onNextBundleProduct,onNewBatch}:{goalLine?:string;receipt:BatchReceipt;productName:string;shippingProfile:string;imageCount:number;sizeGuideName?:string;tagCount:number;variantCount:number;minutesSaved:number;nextBundleProduct?:string;bundleComplete?:boolean;onNextBundleProduct?:()=>void;onNewBatch:()=>void}){
  return <section className="outcome-receipt" aria-live="polite">
    <div className="receipt-celebration" aria-hidden="true"><span>✓</span></div>
    <p className="mini-label">BATCH COMPLETE</p>
    <h2>{receipt.publishedCount} {receipt.publishedCount===1?"listing is":"listings are"} live on Etsy.</h2>
    {/* D342 · Peak-end: this is the moment the work becomes real, so the goal
        belongs here as recognition of what was just finished rather than as a
        reminder of what is outstanding. Same number as the sidebar, different
        register. Shown only when the seller turned the goal on. */}
    {goalLine&&<p className="receipt-goal">{goalLine}</p>}
    <p>Your batch is finished. Here is a quick summary of what Goldie completed.</p>
    <div className="receipt-value-strip"><div><b>{receipt.publishedCount}</b><span>Etsy {receipt.publishedCount===1?"listing":"listings"} published</span></div><div><b>{tagCount}</b><span>tags generated</span></div><div><b>{variantCount}</b><span>variant prices approved</span></div><div><b>{Math.floor(minutesSaved/60)}h {minutesSaved%60}m</b><span>estimated setup time saved</span></div></div>
    <div className="receipt-grid">
      <article><span>Published</span><b>{receipt.publishedCount} Etsy {receipt.publishedCount===1?"listing":"listings"}</b></article>
      <article><span>Product</span><b>{productName||"Printify product"}</b></article>
      <article><span>Shipping</span><b>{shippingProfile||"Selected Etsy profile"}</b></article>
      <article><span>Images</span><b>{imageCount} Printify {imageCount===1?"image":"images"}{sizeGuideName?" + size guide":""}</b></article>
    </div>
    {receipt.etsyUrls.length>0&&<div className="receipt-links">{/* D481 - one numbered link per listing does not survive contact with a real
     batch: fifty designs meant fifty identical links called "Open Etsy listing
     37". A single listing still gets its own link because that is the useful
     thing to open; more than one goes to her listings. */}{receipt.etsyUrls.length===1?<a href={receipt.etsyUrls[0]} target="_blank" rel="noopener noreferrer">Open your new Etsy listing ↗</a>:<a href="https://www.etsy.com/your/shops/me/tools/listings" target="_blank" rel="noopener noreferrer">Open your Etsy listings ↗</a>}</div>}
    {nextBundleProduct&&onNextBundleProduct&&<div className="bundle-next-note"><b>Next in your bundle: {nextBundleProduct}</b><span>Your designs and titles will carry forward. You will review this product’s pricing, shipping, description, Etsy details, and images separately.</span></div>}
    {bundleComplete&&<div className="bundle-complete-note">✓ Every product in this bundle is complete.</div>}
    {/* D481 - "Duplicate this workflow" offered a third way to do what Batch
     History and saved products already do, on the one screen where the next
     step should be obvious. */}<div className="receipt-actions">{nextBundleProduct&&onNextBundleProduct&&<GoldieButton onClick={onNextBundleProduct}>Continue bundle with {nextBundleProduct}</GoldieButton>}<GoldieButton tone={nextBundleProduct?"secondary":"primary"} onClick={onNewBatch}>{nextBundleProduct?"Stop here":"Choose another product"}</GoldieButton><a href="/batches">View batch history</a></div>
    <small>Completed {new Date(receipt.completedAt).toLocaleString()}</small>
  </section>;
}
