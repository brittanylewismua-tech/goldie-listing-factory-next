"use client";
import { useEffect, useState } from "react";
import GoldieWordmark from "../goldie-wordmark";
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string; display_name:string; thumbnail_url:string };
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
    <nav className="management-nav"><GoldieWordmark/><a href="/listing-factory">Listing Factory</a><a className="active" href="/batches">Batch History</a><a href="/keywords">Keyword Banks</a><a href="/mockups">Mockup Sets</a><a href="/usage">Usage + Plan</a></nav>
    <header><p className="mini-label">BATCH HISTORY</p><h1>Continue where you left off.</h1><p>Your product, listing work, results, and errors are saved with each batch. Any Printify drafts you already created will still be there when you return.</p></header>
    <section className="batch-history">
      {loading ? <p>Loading saved batches…</p> : !batches.length ? <div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><a href="/listing-factory">Start a batch</a></div> : batches.map(batch => <article key={batch.id}>{batch.thumbnail_url?<img className="batch-history-thumbnail" src={batch.thumbnail_url} alt=""/>:<span className="batch-history-thumbnail empty" aria-hidden="true">{batch.display_name.slice(0,1).toUpperCase()}</span>}<div className="batch-history-summary"><span className={`batch-status ${batch.status}`}>{batch.status==="draft"?"Printify drafts":batch.status.replace("_"," ")}</span><h2>{batch.display_name || "Untitled batch"}</h2><p>{batch.product_title || "Custom product"} · {batch.design_count} {batch.design_count === 1 ? "design" : "designs"}</p></div><div className="batch-history-controls"><small>Last saved {new Date(`${batch.updated_at.replace(" ","T")}Z`).toLocaleString()}</small><span className="batch-history-actions"><button onClick={() => resume(batch)}>{batch.status === "complete" ? "Open finished batch" : "Resume batch"} →</button></span><button className="remove-batch" onClick={()=>void remove(batch)}>Permanently remove from history</button></div></article>)}
    </section>
  </main>;
}
