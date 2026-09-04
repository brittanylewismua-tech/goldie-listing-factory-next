"use client";
import { useEffect, useRef, useState } from "react";
import { printSideLabel } from "./print-sides";

type Draft = { clientId:string; id?:string; name:string; title?:string; status:string; previewUrl?:string; editorUrl?:string; error?:string; productName?:string;artworkSummary?:Record<string,Array<{name:string;colors:string[]}>> };
type Design = { id:string; name:string; title:string; tags:string[]; previewUrl:string; sizeGuideName?:string };
type Props = { drafts:Draft[]; files:Design[]; selections:Record<string,number[]>; defaultIndices:number[]; preparedMockupCounts:Record<string,number>; batchSizeGuide:string; productName?:string; onRetry?:(clientId:string)=>void; onEdit:(phase:"details"|"mockups")=>void; onSelectionChange?:(ids:string[])=>void; onSelectionTouched?:()=>void; handoffOnly?:boolean };

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

export default function FinalListingReview({drafts,files,selections,defaultIndices,preparedMockupCounts,batchSizeGuide,productName,onRetry,onEdit,onSelectionChange,onSelectionTouched,handoffOnly=false}:Props){
  const selectable=drafts.filter(draft=>draft.status==="Created"&&draft.id);
  /* D841 · The title-length half of this is gone. Etsy's limit is 140 and there
     is no minimum, so a 99-character title was being called "needs a look" -
     which unticked it in "select every listing that is ready" and put a
     confirmation in front of choosing it by hand, for no reason anyone could
     act on. Nothing about a 99-character title needs looking at.

     Tags stay: Etsy allows 13 and a listing using fewer is measurably worse to
     find, which is a thing she can act on. */
  const reviewNeeded=(draft:Draft)=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);return !design||design.tags.length<13};
  /* A warning is not consent. Listings that still need review arrive unticked;
     the seller can include one only after acknowledging the exact warning. */
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>selectable.filter(draft=>!reviewNeeded(draft)).map(draft=>draft.id!));
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
  /* D645 · Bundle members load in the background, so listings keep arriving after
     the page is usable. Every arrival was treated as "seen for the first time,
     so start it ticked" - which silently put back listings the seller had just
     unticked. Measured live: two listings chosen, the other four re-ticked
     themselves as their products finished loading, and the press was refused
     naming products that were no longer on screen as chosen.
     Once she has touched the selection it is hers. Later arrivals are still
     recorded as known, so they never surprise her later either - they simply
     arrive unticked. */
  const sellerChose=useRef(false);
  const availableKey=selectable.map(draft=>draft.id!).sort().join(",");
  useEffect(()=>{
    const available=availableKey?availableKey.split(","):[];
    const fresh=sellerChose.current?[]:available.filter(id=>!knownIds.current.has(id)&&!reviewNeeded(selectable.find(draft=>draft.id===id)!));
    available.forEach(id=>knownIds.current.add(id));
    setSelectedIds(current=>{
      const kept=current.filter(id=>available.includes(id));
      return fresh.length?[...new Set([...kept,...fresh])]:kept;
    });
  },[availableKey]);
  useEffect(()=>{onSelectionChange?.(selectedIds);window.dispatchEvent(new CustomEvent("goldie-publish-selection",{detail:selectedIds}))},[selectedIds,onSelectionChange]);
  function changeSelection(ids:string[]){
    /* Only the seller's own controls call this - the seeding effect above sets
       state directly - so this is exactly the moment her choice becomes hers. */
    sellerChose.current=true;
    onSelectionTouched?.();
    window.dispatchEvent(new Event("goldie-publish-selection-touched"));
    setSelectedIds(ids);
  }
  function toggle(id:string){
    if(selected.has(id)){changeSelection(selectedIds.filter(value=>value!==id));return}
    const draft=selectable.find(item=>item.id===id);
    if(draft&&reviewNeeded(draft)&&!window.confirm("This listing still needs a title or tag review. Include it in this publish anyway?"))return;
    changeSelection([...selectedIds,id]);
  }
  function contentReview(design?:Design){
    /* D841 · shortTitle is no longer a reason to hold a listing back. It is
       still reported, because a very short title is worth seeing - it just does
       not make the listing "not ready". */
    const shortTitle=!design||design.title.trim().length<60;
    const missingTags=!design||design.tags.length<13;
    return {shortTitle,missingTags,needed:missingTags};
  }
  return <section className={`final-listing-review${handoffOnly?" handoff-only":""}`}>
    <div className="final-listing-review-heading"><div>{/* D548 - "EVERY LISTING IN THIS BATCH" over a list holding one product's
        listings, on a page whose button publishes three products. It lists the
        listings of the product that is open; it says so. */}
      <p className="mini-label">{productName?`LISTINGS ON ${productName.toUpperCase()}`:"EVERY LISTING IN THIS BATCH"}</p><h3>{handoffOnly?"Review the drafts created for this batch":"Choose exactly which listings to publish"}</h3></div><span>{handoffOnly?`${selectable.length} ${selectable.length===1?"Printify draft":"Printify drafts"}`:`${selectedIds.length} of ${selectable.length} selected`}</span></div>
    {!handoffOnly&&<label className="final-select-all"><input type="checkbox" checked={allSelected} onChange={()=>changeSelection(allSelected?[]:selectable.filter(draft=>!reviewNeeded(draft)).map(draft=>draft.id!))}/><span>Select every listing that is ready</span></label>}
    <div className="final-design-groups">{groups.map(([designName,group])=>{const attention=group.filter(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);return draft.status!=="Created"||!draft.id||(selections[draft.id]??defaultIndices).length+(preparedMockupCounts[draft.id]||0)===0||contentReview(design).needed}).length;/* D562 - her words: "the checkbox panel on that last final step should be
      something that's collapsed. And when you open it, it shows the actual design
      large at the top... and then underneath that is every product with that
      design on it and the checkboxes... as it stands now, if they're doing a huge
      batch, that's gonna be a lot of things to scroll through. It's too big."
      Twenty designs across three products was sixty rows open on arrival. One
      collapsed row per design; open it and the artwork is there at a size you can
      judge, with every product carrying it underneath. */
    const productPreview=(()=>{
      for(const draft of group){
        if(draft.previewUrl)return draft.previewUrl;
      }
      return "";
    })();
    const groupSelectable=group.filter(draft=>draft.id&&!reviewNeeded(draft));
    const groupIds=groupSelectable.map(draft=>draft.id!);
    const groupAllSelected=groupIds.length>0&&groupIds.every(id=>selected.has(id));
    return <details className="final-design-group" key={designName}><summary>{productPreview?<img className="final-group-thumb" src={productPreview} alt="" decoding="async"/>:null}{/* D558 - D253 already set this rule: "a seller reviewing a batch read
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
        return readableDesignName(designName)})()}</span><b>{group.length} {group.length===1?"listing":"listings"}</b><em className={attention?(handoffOnly?"advice":"needs-attention"):"ready"}>{attention?(handoffOnly?`${attention} optional ${attention===1?"improvement":"improvements"}`:`${attention} ${attention===1?"needs":"need"} a look`):"✓ Ready"}</em>{/* D795 · The preview's review row carries its own thumbnail and its own
        checkbox. Production had neither: the artwork only appeared once the row
        was open, and the only visible control was "Select every listing that is
        ready" - under a heading that says "Choose exactly which listings to
        publish". You could not choose one without opening it first.

        The checkbox governs every selectable draft in this group, which is the
        same set the row is a group of. It stops the click from reaching the
        summary, so ticking a row does not also open it. Nothing about what
        counts as selectable, or what reviewNeeded refuses to select, changes. */}
      {!handoffOnly&&groupSelectable.length>0&&<label className="final-group-select" onClick={event=>{event.preventDefault();event.stopPropagation();changeSelection(groupAllSelected?selectedIds.filter(id=>!groupIds.includes(id)):[...new Set([...selectedIds,...groupSelectable.map(draft=>draft.id!)])])}}>
        <input type="checkbox" readOnly checked={groupAllSelected} aria-label={`Publish ${group.length===1?"this listing":"these listings"}`}/>
      </label>}</summary>{productPreview?<div className="final-product-preview"><img src={productPreview} alt="Product with this design" decoding="async"/></div>:null}<div className="final-listing-grid">{group.map(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name),selectedCount=draft.id?(selections[draft.id]??defaultIndices).length:defaultIndices.length,mockupCount=draft.id?preparedMockupCounts[draft.id]||0:0,hasPhoto=selectedCount+mockupCount>0,publishable=draft.status==="Created"&&hasPhoto,review=contentReview(design),reviewMessage=review.shortTitle&&review.missingTags?"Title and tags need review":review.shortTitle?"Title needs review":"Tags need review";return <article className={`final-listing-card ${publishable?(review.needed?"review-needed":""):"failed"}`} key={`${draft.productName||"product"}:${draft.clientId}`}>
      {!handoffOnly&&(draft.id&&draft.status==="Created"?<label className="final-listing-select" aria-label={`Select ${design?.title||draft.title||draft.name} for publishing`}><input type="checkbox" checked={selected.has(draft.id)} onChange={()=>toggle(draft.id!)}/></label>:<span className="final-listing-select-placeholder"/>)}{draft.previewUrl?<img src={draft.previewUrl} alt={`Preview for ${design?.title||draft.title||draft.name}`} decoding="async"/>:design?<img src={design.previewUrl} alt={`Preview for ${design.title||design.name}`} decoding="async"/>:<span className="final-listing-no-image">No preview</span>}
      <div>{mixedProducts&&<small className="final-product-name">{draft.productName||"Saved product"}</small>}<b>{design?.title||draft.title||draft.name}</b><small>{(design?.title||draft.title||draft.name).length}/140 characters · {design?.tags?.length||0}/13 tags · {selectedCount+mockupCount} {selectedCount+mockupCount===1?"photo":"photos"}{design?.sizeGuideName||batchSizeGuide?" · size guide ready":""}</small>{draft.artworkSummary&&<div className="final-artwork-summary" aria-label="Artwork and print locations">{Object.entries(draft.artworkSummary).flatMap(([side,items])=>items.map((item,index)=><span key={`${side}:${index}`}><b>{printSideLabel(side)} · {item.name}</b><small>{item.colors.length?item.colors.join(", "):"All remaining colors"}</small></span>))}</div>}<span className={!publishable?"needs-attention":review.needed?"content-review":"ready"}>{!publishable?(draft.status!=="Created"?`! ${draft.error||"Draft needs attention"}`:"! Add at least one listing photo"):review.needed?`! ${reviewMessage} · review before publishing in Printify`:handoffOnly?"✓ Ready in Printify":"✓ Ready for final publish"}</span></div>
      <div className="final-listing-links">{draft.status!=="Created"?<button onClick={()=>onRetry?.(draft.clientId)||window.dispatchEvent(new CustomEvent("goldie-retry-listing",{detail:draft.clientId}))}>Retry this listing</button>:<><button onClick={()=>onEdit("details")}>Edit title</button><button onClick={()=>onEdit("mockups")}>Edit images</button></>}{draft.editorUrl&&<a href={draft.editorUrl} target="_blank" rel="noopener noreferrer">View in Printify ↗</a>}</div>
    </article>})}</div></details>})}</div>
  </section>
}
