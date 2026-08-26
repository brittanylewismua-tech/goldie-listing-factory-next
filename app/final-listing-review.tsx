"use client";
import { useEffect, useRef, useState } from "react";

type Draft = { clientId:string; id?:string; name:string; title?:string; status:string; previewUrl?:string; editorUrl?:string; error?:string; productName?:string };
type Design = { id:string; name:string; title:string; tags:string[]; previewUrl:string; sizeGuideName?:string };
type Props = { drafts:Draft[]; files:Design[]; selections:Record<string,number[]>; defaultIndices:number[]; preparedMockupCounts:Record<string,number>; batchSizeGuide:string; productName?:string; onRetry?:(clientId:string)=>void; onEdit:(phase:"details"|"mockups")=>void };

/* D253 · The Publish page grouped listings under the raw upload filename, so a
   seller reviewing a batch read "ChatGPT Image Aug 21, 2026, 05_32_41 PM (2).png"
   as the heading over their own listing. D138 removed exactly this from the
   mockup grid and it survived here. Prefer the design's own title; otherwise
   tidy the filename rather than printing it verbatim. */
/* D270 · Every Publish row printed the product name, so a single-product batch
   repeated "GILDAN HOODIE" once per listing under a header that already reads
   "CURRENT PRODUCT · GILDAN HOODIE". It earns its place only when a batch
   really does mix products. */
function batchHasMixedProducts(drafts: Array<{ productName?: string }>): boolean {
  return new Set(drafts.map((d) => d.productName || "")).size > 1;
}

function readableDesignName(name: string): string {
  const base = (name || "").replace(/\.[a-z0-9]+$/i, "");
  const tidy = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return tidy || name || "Untitled design";
}

export default function FinalListingReview({drafts,files,selections,defaultIndices,preparedMockupCounts,batchSizeGuide,productName,onRetry,onEdit}:Props){
  const selectable=drafts.filter(draft=>draft.status==="Created"&&draft.id);
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>selectable.map(draft=>draft.id!));
  const selected=new Set(selectedIds),allSelected=selectable.length>0&&selectable.every(draft=>selected.has(draft.id!));
  const mixedProducts=batchHasMixedProducts(drafts);
  const groups=[...drafts.reduce((map,draft)=>{const key=draft.name||draft.clientId;map.set(key,[...(map.get(key)||[]),draft]);return map},new Map<string,Draft[]>()).entries()];
  /* D560 - this re-added every available id whenever `drafts` changed identity,
     which was fine while drafts was one batch's array and fatal once D559 started
     building the list across the bundle on every render: the effect ran
     constantly and put back anything she unticked, so the boxes could not be
     cleared at all. Measured live - 6 of 6 selected, untick, still 6 of 6.
     A listing that appears for the first time starts selected; after that her
     choice stands. */
  const knownIds=useRef<Set<string>>(new Set());
  const availableKey=selectable.map(draft=>draft.id!).sort().join(",");
  useEffect(()=>{
    const available=availableKey?availableKey.split(","):[];
    const fresh=available.filter(id=>!knownIds.current.has(id));
    available.forEach(id=>knownIds.current.add(id));
    setSelectedIds(current=>{
      const kept=current.filter(id=>available.includes(id));
      return fresh.length?[...new Set([...kept,...fresh])]:kept;
    });
  },[availableKey]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent("goldie-publish-selection",{detail:selectedIds}))},[selectedIds]);
  function changeSelection(ids:string[]){setSelectedIds(ids)}
  function toggle(id:string){changeSelection(selected.has(id)?selectedIds.filter(value=>value!==id):[...selectedIds,id])}
  function contentReview(design?:Design){
    const shortTitle=!design||design.title.trim().length<100;
    const missingTags=!design||design.tags.length<13;
    return {shortTitle,missingTags,needed:shortTitle||missingTags};
  }
  return <section className="final-listing-review">
    <div className="final-listing-review-heading"><div>{/* D548 - "EVERY LISTING IN THIS BATCH" over a list holding one product's
        listings, on a page whose button publishes three products. It lists the
        listings of the product that is open; it says so. */}
      <p className="mini-label">{productName?`LISTINGS ON ${productName.toUpperCase()}`:"EVERY LISTING IN THIS BATCH"}</p><h3>Choose exactly which listings to publish</h3></div><span>{selectedIds.length} of {selectable.length} selected</span></div>
    <label className="final-select-all"><input type="checkbox" checked={allSelected} onChange={()=>changeSelection(allSelected?[]:selectable.map(draft=>draft.id!))}/><span>Select every successful listing</span></label>
    <div className="final-design-groups">{groups.map(([designName,group])=>{const attention=group.filter(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);return draft.status!=="Created"||!draft.id||(selections[draft.id]??defaultIndices).length+(preparedMockupCounts[draft.id]||0)===0||contentReview(design).needed}).length;/* D562 - her words: "the checkbox panel on that last final step should be
      something that's collapsed. And when you open it, it shows the actual design
      large at the top... and then underneath that is every product with that
      design on it and the checkboxes... as it stands now, if they're doing a huge
      batch, that's gonna be a lot of things to scroll through. It's too big."
      Twenty designs across three products was sixty rows open on arrival. One
      collapsed row per design; open it and the artwork is there at a size you can
      judge, with every product carrying it underneath. */
    const artwork=(()=>{
      for(const draft of group){
        const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);
        if(design?.previewUrl)return design.previewUrl;
      }
      return "";
    })();
    return <details className="final-design-group" key={designName}><summary>{/* D558 - D253 already set this rule: "a seller reviewing a batch read
        'ChatGPT Image Aug 21, 2026, 05_32_41 PM (2).png' as the heading over their
        own listing. Prefer the design's own title; otherwise tidy the filename."
        The rule was applied to the listing rows and not to the heading above them,
        so the raw upload name is still what sits over her titled listing. */}
      <span>{(()=>{
        /* D560 - one design becomes one listing per product, so a group can hold a
           hoodie, a tee and a crewneck with three different titles. Naming the
           group after the first one labelled a tee "Bride Hoodie". A mixed group
           is named by its design; a single listing keeps D253's rule. */
        /* D561 - D560 sent mixed groups straight to the filename, and in a bundle
           every group is mixed - so her publish screen went back to reading
           "ChatGPT Image Aug 21, 2026, 05 32 42 PM (4)", the exact thing D253
           forbade and she showed me. A title identifies the artwork far better
           than an upload name; the rows underneath carry each product and its own
           title, so they disambiguate. The filename is the last resort. */
        for(const draft of group){
          const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);
          const named=design?.title?.trim()||draft.title?.trim();
          if(named)return named;
        }
        return readableDesignName(designName)})()}</span><b>{group.length} {group.length===1?"listing":"listings"}</b><em className={attention?"needs-attention":"ready"}>{attention?`${attention} ${attention===1?"needs":"need"} a look`:"✓ Ready"}</em></summary>{artwork?<div className="final-design-art"><img src={artwork} alt={`Design ${readableDesignName(designName)}`} loading="lazy" decoding="async"/></div>:null}<div className="final-listing-grid">{group.map(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name),selectedCount=draft.id?(selections[draft.id]??defaultIndices).length:defaultIndices.length,mockupCount=draft.id?preparedMockupCounts[draft.id]||0:0,hasPhoto=selectedCount+mockupCount>0,publishable=draft.status==="Created"&&hasPhoto,review=contentReview(design),reviewMessage=review.shortTitle&&review.missingTags?"Title and tags need review":review.shortTitle?"Title needs review":"Tags need review";return <article className={`final-listing-card ${publishable?(review.needed?"review-needed":""):"failed"}`} key={`${draft.productName||"product"}:${draft.clientId}`}>
      {draft.id&&draft.status==="Created"?<label className="final-listing-select" aria-label={`Select ${design?.title||draft.title||draft.name} for publishing`}><input type="checkbox" checked={selected.has(draft.id)} onChange={()=>toggle(draft.id!)}/></label>:<span className="final-listing-select-placeholder"/>}{draft.previewUrl?<img loading="lazy" src={draft.previewUrl} alt={`Preview for ${design?.title||draft.title||draft.name}`}/>:design?<img loading="lazy" src={design.previewUrl} alt={`Preview for ${design.title||design.name}`}/>:<span className="final-listing-no-image">No preview</span>}
      <div>{mixedProducts&&<small className="final-product-name">{draft.productName||"Saved product"}</small>}<b>{design?.title||draft.title||draft.name}</b><small>{(design?.title||draft.title||draft.name).length}/140 characters · {design?.tags?.length||0}/13 tags · {selectedCount+mockupCount} {selectedCount+mockupCount===1?"photo":"photos"}{design?.sizeGuideName||batchSizeGuide?" · size guide ready":""}</small><span className={!publishable?"needs-attention":review.needed?"content-review":"ready"}>{!publishable?(draft.status!=="Created"?`! ${draft.error||"Draft needs attention"}`:"! Add at least one listing photo"):review.needed?`! ${reviewMessage} · publishing is still available`:"✓ Ready for final publish"}</span></div>
      <div className="final-listing-links">{draft.status!=="Created"?<button onClick={()=>onRetry?.(draft.clientId)||window.dispatchEvent(new CustomEvent("goldie-retry-listing",{detail:draft.clientId}))}>Retry this listing</button>:<><button onClick={()=>onEdit("details")}>Edit title</button><button onClick={()=>onEdit("mockups")}>Edit images</button></>}{draft.editorUrl&&<a href={draft.editorUrl} target="_blank" rel="noopener noreferrer">View in Printify ↗</a>}</div>
    </article>})}</div></details>})}</div>
  </section>
}
