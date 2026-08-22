"use client";
import { useEffect, useState } from "react";
import ManagementNav from "../management-nav";
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string; display_name:string; thumbnail_url:string; published_count:number };
export default function BatchesPage() {
  const [batches,setBatches] = useState<Batch[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(() => { fetch("/api/batches").then(response => response.json()).then(data => setBatches(data.batches || [])).finally(() => setLoading(false)); }, []);
  function resume(batch:Batch) { window.location.href = `/listing-factory?batch=${encodeURIComponent(batch.id)}${batch.status==="complete"?"&open=results":""}`; }
  async function remove(batch:Batch) {
    if (!window.confirm(`Permanently remove “${batch.display_name || "Untitled batch"}” from Batch History? This cannot be undone. This does not delete products from Printify or listings from Etsy.`)) return;
    const response=await fetch(`/api/batches?id=${encodeURIComponent(batch.id)}`,{method:"DELETE"});
    if(response.ok)setBatches(current=>current.filter(item=>item.id!==batch.id));
  }
  return <main className="management-page">
    <ManagementNav active="batches"/>
    <header><p className="mini-label">BATCH HISTORY</p><h1>Continue where you left off.</h1><p>Your product, listing work, results, and errors are saved with each batch. Any Printify drafts you already created will still be there when you return.</p></header>
    <section className="batch-history">
      {loading ? <p>Loading saved batches…</p> : !batches.length ? <div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><a href="/listing-factory">Start a batch</a></div> : batches.map(batch => <article key={batch.id}>{batch.thumbnail_url?<img className="batch-history-thumbnail" src={batch.thumbnail_url} alt=""/>:<span className="batch-history-thumbnail empty" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/></svg></span>}<div className="batch-history-summary"><span className={`batch-status ${batch.status}`}>{batch.published_count>0?`${batch.published_count} PUBLISHED`:`DRAFTS READY · 0 PUBLISHED`}</span><h2>{batch.display_name || "Untitled batch"}</h2><p>{batch.product_title || "Custom product"} · {batch.design_count} {batch.design_count === 1 ? "design" : "designs"}</p></div><div className="batch-history-controls"><small>Last saved {new Date(`${batch.updated_at.replace(" ","T")}Z`).toLocaleString()}</small><span className="batch-history-actions"><button onClick={() => resume(batch)}>{batch.published_count>0 ? "Open published batch" : "Resume batch"} →</button></span><button className="remove-batch" onClick={()=>void remove(batch)}>Permanently remove from history</button></div></article>)}
    </section>
  </main>;
}
