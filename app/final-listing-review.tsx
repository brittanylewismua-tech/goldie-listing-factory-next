"use client";

type Draft = { clientId:string; id?:string; name:string; title?:string; status:string; previewUrl?:string; editorUrl?:string };
type Design = { id:string; name:string; title:string; tags:string[]; previewUrl:string; sizeGuideName?:string };
type Props = { drafts:Draft[]; files:Design[]; selections:Record<string,number[]>; defaultIndices:number[]; preparedMockupCounts:Record<string,number>; batchSizeGuide:string; onEdit:(phase:"details"|"mockups")=>void };

export default function FinalListingReview({drafts,files,selections,defaultIndices,preparedMockupCounts,batchSizeGuide,onEdit}:Props){
  return <section className="final-listing-review">
    <div className="final-listing-review-heading"><div><p className="mini-label">EVERY LISTING IN THIS BATCH</p><h3>Review all {drafts.length} listings before publishing</h3></div><span>Nothing is live yet</span></div>
    <div className="final-listing-grid">{drafts.map(draft=>{const design=files.find(file=>file.id===draft.clientId),selectedCount=draft.id?(selections[draft.id]??defaultIndices).length:defaultIndices.length,mockupCount=draft.id?preparedMockupCounts[draft.id]||0:0,hasPhoto=selectedCount+mockupCount>0,ready=draft.status==="Created"&&hasPhoto;return <article className={`final-listing-card ${ready?"":"failed"}`} key={draft.clientId}>
      {draft.previewUrl?<img src={draft.previewUrl} alt={`Preview for ${design?.title||draft.title||draft.name}`}/>:design?<img src={design.previewUrl} alt={`Preview for ${design.title||design.name}`}/>:<span className="final-listing-no-image">No preview</span>}
      <div><b>{design?.title||draft.title||draft.name}</b><small>{design?.tags?.length||0} tags · {selectedCount} Printify images · {mockupCount} lifestyle mockups{design?.sizeGuideName||batchSizeGuide?" · size guide ready":""}</small><span className={ready?"ready":"needs-attention"}>{ready?"✓ Ready for final publish":draft.status!=="Created"?"! Draft needs attention":"! Add at least one listing photo"}</span></div>
      <div className="final-listing-links"><button onClick={()=>onEdit("details")}>Edit titles</button><button onClick={()=>onEdit("mockups")}>Edit images</button>{draft.editorUrl&&<a href={draft.editorUrl} target="_blank" rel="noopener noreferrer">View in Printify ↗</a>}</div>
    </article>})}</div>
  </section>
}
