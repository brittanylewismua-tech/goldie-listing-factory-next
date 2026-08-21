"use client";
import { useEffect, useState } from "react";

type Draft = { clientId:string; id?:string; name:string; title?:string; status:string; previewUrl?:string; editorUrl?:string; error?:string; productName?:string };
type Design = { id:string; name:string; title:string; tags:string[]; previewUrl:string; sizeGuideName?:string };
type Props = { drafts:Draft[]; files:Design[]; selections:Record<string,number[]>; defaultIndices:number[]; preparedMockupCounts:Record<string,number>; batchSizeGuide:string; onRetry?:(clientId:string)=>void; onEdit:(phase:"details"|"mockups")=>void };

export default function FinalListingReview({drafts,files,selections,defaultIndices,preparedMockupCounts,batchSizeGuide,onRetry,onEdit}:Props){
  const selectable=drafts.filter(draft=>draft.status==="Created"&&draft.id);
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>selectable.map(draft=>draft.id!));
  const selected=new Set(selectedIds),allSelected=selectable.length>0&&selectable.every(draft=>selected.has(draft.id!));
  const groups=[...drafts.reduce((map,draft)=>{const key=draft.name||draft.clientId;map.set(key,[...(map.get(key)||[]),draft]);return map},new Map<string,Draft[]>()).entries()];
  useEffect(()=>{const available=selectable.map(draft=>draft.id!);setSelectedIds(current=>[...new Set([...current.filter(id=>available.includes(id)),...available])])},[drafts]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent("goldie-publish-selection",{detail:selectedIds}))},[selectedIds]);
  function changeSelection(ids:string[]){setSelectedIds(ids)}
  function toggle(id:string){changeSelection(selected.has(id)?selectedIds.filter(value=>value!==id):[...selectedIds,id])}
  function contentReview(design?:Design){
    const shortTitle=!design||design.title.trim().length<100;
    const missingTags=!design||design.tags.length<13;
    return {shortTitle,missingTags,needed:shortTitle||missingTags};
  }
  return <section className="final-listing-review">
    <div className="final-listing-review-heading"><div><p className="mini-label">EVERY LISTING IN THIS BATCH</p><h3>Choose exactly which listings to publish</h3></div><span>{selectedIds.length} of {selectable.length} selected</span></div>
    <label className="final-select-all"><input type="checkbox" checked={allSelected} onChange={()=>changeSelection(allSelected?[]:selectable.map(draft=>draft.id!))}/><span>{allSelected?"Clear selection":"Select every successful listing"}</span></label>
    <div className="final-design-groups">{groups.map(([designName,group])=>{const attention=group.filter(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name);return draft.status!=="Created"||!draft.id||(selections[draft.id]??defaultIndices).length+(preparedMockupCounts[draft.id]||0)===0||contentReview(design).needed}).length;return <details className="final-design-group" key={designName} open={groups.length<=3||attention>0}><summary><span>{designName}</span><b>{group.length} {group.length===1?"listing":"listings"}</b><em className={attention?"needs-attention":"ready"}>{attention?`${attention} need a look`:"✓ Ready"}</em></summary><div className="final-listing-grid">{group.map(draft=>{const design=files.find(file=>file.id===draft.clientId)||files.find(file=>file.name===draft.name),selectedCount=draft.id?(selections[draft.id]??defaultIndices).length:defaultIndices.length,mockupCount=draft.id?preparedMockupCounts[draft.id]||0:0,hasPhoto=selectedCount+mockupCount>0,publishable=draft.status==="Created"&&hasPhoto,review=contentReview(design),reviewMessage=review.shortTitle&&review.missingTags?"Title and tags need review":review.shortTitle?"Title needs review":"Tags need review";return <article className={`final-listing-card ${publishable?(review.needed?"review-needed":""):"failed"}`} key={`${draft.productName||"product"}:${draft.clientId}`}>
      {draft.id&&draft.status==="Created"?<label className="final-listing-select" aria-label={`Select ${design?.title||draft.title||draft.name} for publishing`}><input type="checkbox" checked={selected.has(draft.id)} onChange={()=>toggle(draft.id!)}/></label>:<span className="final-listing-select-placeholder"/>}{draft.previewUrl?<img loading="lazy" src={draft.previewUrl} alt={`Preview for ${design?.title||draft.title||draft.name}`}/>:design?<img loading="lazy" src={design.previewUrl} alt={`Preview for ${design.title||design.name}`}/>:<span className="final-listing-no-image">No preview</span>}
      <div><small className="final-product-name">{draft.productName||"Saved product"}</small><b>{design?.title||draft.title||draft.name}</b><small>{(design?.title||draft.title||draft.name).length}/140 characters · {design?.tags?.length||0}/13 tags · {selectedCount+mockupCount} photos{design?.sizeGuideName||batchSizeGuide?" · size guide ready":""}</small><span className={!publishable?"needs-attention":review.needed?"content-review":"ready"}>{!publishable?(draft.status!=="Created"?`! ${draft.error||"Draft needs attention"}`:"! Add at least one listing photo"):review.needed?`! ${reviewMessage} · publishing is still available`:"✓ Ready for final publish"}</span></div>
      <div className="final-listing-links">{draft.status!=="Created"?<button onClick={()=>onRetry?.(draft.clientId)||window.dispatchEvent(new CustomEvent("goldie-retry-listing",{detail:draft.clientId}))}>Retry this listing</button>:<><button onClick={()=>onEdit("details")}>Edit title</button><button onClick={()=>onEdit("mockups")}>Edit images</button></>}{draft.editorUrl&&<a href={draft.editorUrl} target="_blank" rel="noopener noreferrer">View in Printify ↗</a>}</div>
    </article>})}</div></details>})}</div>
  </section>
}
