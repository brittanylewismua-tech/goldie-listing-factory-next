"use client";
import { useEffect, useState } from "react";
import { confirmAction } from "../confirm-dialog";
import {readBatchHistory,removeHistoryRows} from "../batch-history-read";
import {filterBatchHistory} from "../batch-history-filter";
import FactoryShell from "../factory-shell";
type RunChild = { batchId:string; productName:string; position:number; drafts:number; expected:number; published:number; done:boolean };
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string; display_name:string; thumbnail_url:string; published_count:number;draft_count?:number;members?:RunChild[];bundle_total?:number;expected_listing_count?:number;resume_batch_id?:string };
/* D621 - "8/27/2026, 8:31:41 AM" is a raw machine timestamp: seconds nobody
   needs, and a date she has to decode even when the batch was saved an hour ago.
   Today and yesterday are named; anything older gets a short date. Seconds are
   dropped entirely. */
function savedLabel(updatedAt: string) {
  const when = new Date(`${updatedAt.replace(" ", "T")}Z`);
  if (Number.isNaN(when.getTime())) return "recently";
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  if (when.getTime() >= midnight.getTime()) return `today at ${time}`;
  if (when.getTime() >= midnight.getTime() - dayMs) return `yesterday at ${time}`;
  const sameYear = when.getFullYear() === new Date().getFullYear();
  return `${when.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} at ${time}`;
}

export default function BatchesPage() {
  const [batches,setBatches] = useState<Batch[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  /* D364 · Removing batches one at a time meant one confirm dialog each. A
     checkbox on every card and one Delete above them turns clearing a test run
     into a single decision. */
  const [selected,setSelected] = useState<string[]>([]);
  const [deleting,setDeleting] = useState(false);
  async function loadHistory(quiet=false){if(!quiet){setLoading(true);setError("")}try{const data=await readBatchHistory<Batch>();setBatches(data.batches);setSelected(current=>current.filter(id=>data.batches.some(batch=>batch.id===id&&batch.status!=="processing")));if(quiet)setError("")}catch(value){if(!quiet)setError(value instanceof Error?value.message:"Saved history could not be loaded. Try again.")}finally{if(!quiet)setLoading(false)}}
  useEffect(() => {void loadHistory()}, []);
  useEffect(()=>{if(!batches.some(batch=>batch.status==="processing"))return;const timer=window.setInterval(()=>void loadHistory(true),3000);return()=>window.clearInterval(timer)},[batches.map(batch=>`${batch.id}:${batch.status}:${batch.draft_count||0}`).join("|")]);
  function resume(batch:Batch) { window.location.href = `/listing-factory?batch=${encodeURIComponent(batch.id)}${batch.status==="complete"?"&open=results":""}`; }
  function toggleSelected(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}

  async function removeSelected(){
    const chosen=batches.filter(batch=>selected.includes(batch.id));
    if(!chosen.length||deleting)return;
    /* One confirmation for the whole set, naming the count — the same warning
       the single delete gives, said once. */
    if(!await confirmAction({title:`Permanently remove ${chosen.length} ${chosen.length===1?"batch":"batches"}?`,body:"This cannot be undone. Products already created in Printify are not deleted.",confirmLabel:"Remove from history",destructive:true}))return;//from Printify or listings from Etsy.`))return;
    setDeleting(true);
    const result=await removeHistoryRows(chosen.map(batch=>batch.id));
    const removed=result.confirmed;
    if(result.uncertain)setError("Some removals could not be confirmed. Reload history before trying again.");
    /* Only drop what the server actually deleted, so a partial failure leaves
       the rest on screen rather than pretending they are gone. */
    setBatches(current=>current.filter(item=>!removed.includes(item.id)));
    setSelected(current=>current.filter(id=>!removed.includes(id)));
    setDeleting(false);
  }

  async function remove(batch:Batch) {
    if (!await confirmAction({title:`Permanently remove “${batch.display_name || "Untitled batch"}”?`,body:"This cannot be undone. Products already created in Printify and listings already on Etsy are not deleted.",confirmLabel:"Remove from history",destructive:true})) return;
    const result=await removeHistoryRows([batch.id]);
    if(result.confirmed.length)setBatches(current=>current.filter(item=>item.id!==batch.id));
    if(result.uncertain)setError("This removal could not be confirmed. Reload history before trying again.");
  }
  const visibleBatches=filterBatchHistory(batches,query),visibleIds=visibleBatches.filter(batch=>batch.status!=="processing").map(batch=>batch.id),visibleSelected=visibleIds.filter(id=>selected.includes(id));
  const creatingCount=batches.filter(batch=>batch.status==="processing").length;
  const expectedListings=(batch:Batch)=>batch.expected_listing_count??batch.design_count*(batch.bundle_total||1);
  const fullyPublished=(batch:Batch)=>{const expected=expectedListings(batch);return expected>0&&batch.published_count>=expected};
  const statusLabel=(batch:Batch)=>{const expected=expectedListings(batch);return batch.published_count>0?(fullyPublished(batch)?`${batch.published_count} PUBLISHED TO ETSY`:`${batch.published_count} OF ${expected} PUBLISHED TO ETSY`):batch.status==="processing"?`${batch.draft_count||0} OF ${expected} DRAFTS CREATED`:batch.status==="needs_attention"?"NEEDS ATTENTION":batch.members?.length&&batch.draft_count&&batch.draft_count<expected?`${batch.draft_count} OF ${expected} DRAFTS READY`:batch.draft_count?`${batch.draft_count} ${batch.draft_count===1?"DRAFT":"DRAFTS"} READY`:"SAVED BATCH"};
  return <FactoryShell active="batches" title="Batch History"><div className="management-page interior-page">
    
    <header><p className="mini-label">BATCH HISTORY</p><h1>Continue where you left off.</h1><p>Your products, designs, and listing work are saved here. When you reopen a batch, The Listing Factory checks that its Printify drafts still exist.</p></header>
    <section className="batch-history">
      {creatingCount>0&&<div className="batch-history-live" role="status" aria-live="polite"><span className="batch-history-live-dot" aria-hidden="true"/><div><b>{creatingCount===1?"One batch is creating Printify drafts":`${creatingCount} batches are creating Printify drafts`}</b><p>This page updates automatically. You can work elsewhere and return anytime.</p></div></div>}
      {error&&<div className="batch-restore-notice" role="alert"><p>{error}</p>{/sign in/i.test(error)&&<a href="/account/sign-in?return_to=%2Fbatches" target="_blank" rel="noopener noreferrer">Sign in to The Listing Factory ↗</a>}<button type="button" className="secondary-action" disabled={loading||deleting} onClick={()=>void loadHistory()}>Reload history</button></div>}
      {!loading&&batches.length>0&&<label className="batch-history-search"><span>Find a saved batch</span><input type="search" value={query} placeholder="Search by batch or product" onChange={event=>{setQuery(event.target.value);setSelected([])}}/><small>{query.trim()?`${visibleBatches.length} ${visibleBatches.length===1?"match":"matches"}`:`${batches.length} saved`}</small></label>}
      {/* D364 · Always present, so selecting is never a mode you have to enter. */}
      {!loading&&visibleBatches.length>0&&<div className="batch-history-select">
        <label className="batch-select-all"><input type="checkbox"
          checked={visibleSelected.length===visibleIds.length&&visibleIds.length>0}
          ref={node=>{if(node)node.indeterminate=visibleSelected.length>0&&visibleSelected.length<visibleIds.length}}
          onChange={()=>setSelected(visibleSelected.length===visibleIds.length?selected.filter(id=>!visibleIds.includes(id)):[...new Set([...selected,...visibleIds])])}/>
        <span>{selected.length?`${selected.length} selected`:"Select all"}</span></label>
        {selected.length>0&&<button type="button" className="batch-delete-selected" disabled={deleting} onClick={()=>void removeSelected()}>
          {deleting?"Deleting…":`Delete ${selected.length} ${selected.length===1?"batch":"batches"}`}</button>}
      </div>}
      {loading ? <p>Loading saved batches…</p> : !batches.length ? error?null:<div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><a href="/listing-factory">Start a batch</a></div> : !visibleBatches.length?<div className="empty-history batch-history-no-match"><h2>No matching batches</h2><p>Try a batch name or product name.</p></div>:visibleBatches.map(batch => <article key={batch.id} className={selected.includes(batch.id)?"selected":""}><label className="batch-select"><input type="checkbox" disabled={batch.status==="processing"} checked={selected.includes(batch.id)} onChange={()=>toggleSelected(batch.id)} aria-label={`Select ${batch.display_name||"Untitled batch"}`}/></label>{batch.thumbnail_url?<img className="batch-history-thumbnail" src={batch.thumbnail_url} alt=""/>:<span className="batch-history-thumbnail empty" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/></svg></span>}<div className="batch-history-summary"><span className={`batch-status ${batch.status}`}>{statusLabel(batch)}</span><h2>{batch.display_name || "Untitled batch"}</h2><p>{batch.members?.length?batch.product_title:`${batch.product_title || "Custom product"} · ${batch.design_count} ${batch.design_count === 1 ? "design" : "designs"}`}</p>{/* D871 · A bundle run is one row, and its products are its progress - not
            separate jobs with their own name, badge and Resume button. */}
          {batch.members?.length?<ul className="batch-history-members">{batch.members.map(member=><li key={member.batchId||`missing-${member.position}`} className={member.done?"done":""}><span className="member-mark" aria-hidden="true">{member.done?"✓":member.position}</span><b>{member.productName||`Product ${member.position}`}</b><small>{member.published>0?(member.published>=member.expected?`${member.published} published`:`${member.published} of ${member.expected} published`):member.drafts>0?`${member.drafts} ${member.drafts===1?"draft":"drafts"} ready`:batch.status==="processing"?"Creating drafts…":"Not started yet"}</small></li>)}</ul>:null}</div><div className="batch-history-controls"><small>Last saved {savedLabel(batch.updated_at)}</small><span className="batch-row-actions"><button onClick={() => resume(batch)}>{batch.status==="processing"?"View progress":batch.members?.length
              /* D871 · One action for the run, and it opens where the work
                 stopped rather than where it started. */
              ?(fullyPublished(batch)?"Open published bundle":"Resume bundle")
              :fullyPublished(batch) ? "Open published batch" : "Resume batch"} →</button></span><button className="remove-batch" disabled={batch.status==="processing"} title={batch.status==="processing"?"Wait for draft creation to finish before removing this batch.":undefined} onClick={()=>void remove(batch)}>Permanently remove from history</button></div></article>)}
    </section>
  </div></FactoryShell>;
}
