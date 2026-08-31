"use client";
import { useEffect, useState } from "react";
import { confirmAction } from "../confirm-dialog";
import FactoryShell from "../factory-shell";
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string; display_name:string; thumbnail_url:string; published_count:number;draft_count?:number };
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
  /* D364 · Removing batches one at a time meant one confirm dialog each. A
     checkbox on every card and one Delete above them turns clearing a test run
     into a single decision. */
  const [selected,setSelected] = useState<string[]>([]);
  const [deleting,setDeleting] = useState(false);
  useEffect(() => { fetch("/api/batches").then(response => response.json()).then(data => setBatches(data.batches || [])).finally(() => setLoading(false)); }, []);
  function resume(batch:Batch) { window.location.href = `/listing-factory?batch=${encodeURIComponent(batch.id)}${batch.status==="complete"?"&open=results":""}`; }
  function toggleSelected(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}

  async function removeSelected(){
    const chosen=batches.filter(batch=>selected.includes(batch.id));
    if(!chosen.length||deleting)return;
    /* One confirmation for the whole set, naming the count — the same warning
       the single delete gives, said once. */
    if(!await confirmAction({title:`Permanently remove ${chosen.length} ${chosen.length===1?"batch":"batches"}?`,body:"This cannot be undone. Products already created in Printify are not deleted.",confirmLabel:"Remove from history",destructive:true}))return;//from Printify or listings from Etsy.`))return;
    setDeleting(true);
    const removed:string[]=[];
    for(const batch of chosen){
      const response=await fetch(`/api/batches?id=${encodeURIComponent(batch.id)}`,{method:"DELETE"});
      if(response.ok)removed.push(batch.id);
    }
    /* Only drop what the server actually deleted, so a partial failure leaves
       the rest on screen rather than pretending they are gone. */
    setBatches(current=>current.filter(item=>!removed.includes(item.id)));
    setSelected(current=>current.filter(id=>!removed.includes(id)));
    setDeleting(false);
  }

  async function remove(batch:Batch) {
    if (!await confirmAction({title:`Permanently remove “${batch.display_name || "Untitled batch"}”?`,body:"This cannot be undone. Products already created in Printify and listings already on Etsy are not deleted.",confirmLabel:"Remove from history",destructive:true})) return;
    const response=await fetch(`/api/batches?id=${encodeURIComponent(batch.id)}`,{method:"DELETE"});
    if(response.ok)setBatches(current=>current.filter(item=>item.id!==batch.id));
  }
  return <FactoryShell active="batches" title="Batch History"><div className="management-page interior-page">
    
    <header><p className="mini-label">BATCH HISTORY</p><h1>Continue where you left off.</h1><p>Your product, listing work, results, and errors are saved with each batch. Any Printify drafts you already created will still be there when you return.</p></header>
    <section className="batch-history">
      {/* D364 · Always present, so selecting is never a mode you have to enter. */}
      {!loading&&batches.length>0&&<div className="batch-history-select">
        <label className="batch-select-all"><input type="checkbox"
          checked={selected.length===batches.length&&batches.length>0}
          ref={node=>{if(node)node.indeterminate=selected.length>0&&selected.length<batches.length}}
          onChange={()=>setSelected(selected.length===batches.length?[]:batches.map(batch=>batch.id))}/>
        <span>{selected.length?`${selected.length} selected`:"Select all"}</span></label>
        {selected.length>0&&<button type="button" className="batch-delete-selected" disabled={deleting} onClick={()=>void removeSelected()}>
          {deleting?"Deleting…":`Delete ${selected.length} ${selected.length===1?"batch":"batches"}`}</button>}
      </div>}
      {loading ? <p>Loading saved batches…</p> : !batches.length ? <div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><a href="/listing-factory">Start a batch</a></div> : batches.map(batch => <article key={batch.id} className={selected.includes(batch.id)?"selected":""}><label className="batch-select"><input type="checkbox" checked={selected.includes(batch.id)} onChange={()=>toggleSelected(batch.id)} aria-label={`Select ${batch.display_name||"Untitled batch"}`}/></label>{batch.thumbnail_url?<img className="batch-history-thumbnail" src={batch.thumbnail_url} alt=""/>:<span className="batch-history-thumbnail empty" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/></svg></span>}<div className="batch-history-summary"><span className={`batch-status ${batch.status}`}>{batch.published_count>0?`${batch.published_count} PUBLISHED TO ETSY`:`DRAFT`}</span><h2>{batch.display_name || "Untitled batch"}</h2><p>{batch.product_title || "Custom product"} · {batch.design_count} {batch.design_count === 1 ? "design" : "designs"}</p></div><div className="batch-history-controls"><small>Last saved {savedLabel(batch.updated_at)}</small><span className="batch-row-actions"><button onClick={() => resume(batch)}>{batch.published_count>0 ? "Open published batch" : "Resume batch"} →</button></span><button className="remove-batch" onClick={()=>void remove(batch)}>Permanently remove from history</button></div></article>)}
    </section>
  </div></FactoryShell>;
}
