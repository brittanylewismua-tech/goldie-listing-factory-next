"use client";
import { useEffect, useState } from "react";
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string };
export default function BatchesPage() {
  const [batches,setBatches] = useState<Batch[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(() => { fetch("/api/batches").then(response => response.json()).then(data => setBatches(data.batches || [])).finally(() => setLoading(false)); }, []);
  function resume(id:string) { window.location.href = `/?batch=${encodeURIComponent(id)}`; }
  async function remove(batch:Batch) {
    if (!window.confirm(`Remove “${batch.product_title || batch.setup_name || "Untitled batch"}” from Goldie history? This does not delete products from Printify or listings from Etsy.`)) return;
    const response=await fetch(`/api/batches?id=${encodeURIComponent(batch.id)}`,{method:"DELETE"});
    if(response.ok)setBatches(current=>current.filter(item=>item.id!==batch.id));
  }
  return <main className="management-page">
    <nav className="management-nav"><a href="/">Listing Factory</a><a className="active" href="/batches">Batch History</a><a href="/keywords">Keyword Banks</a><a href="/mockups">Mockup Sets</a><a href="/usage">Usage + Plan</a></nav>
    <header><p className="mini-label">BATCH HISTORY</p><h1>Pick up exactly where you left off.</h1><p>Goldie saves each batch, its product, listing work, results, and any errors. Closing the page never hides a completed Printify draft.</p></header>
    <section className="batch-history">
      {loading ? <p>Loading saved batches…</p> : !batches.length ? <div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><a href="/">Start a batch</a></div> : batches.map(batch => <article key={batch.id}><div><span className={`batch-status ${batch.status}`}>{batch.status.replace("_"," ")}</span><h2>{batch.product_title || batch.setup_name || "Untitled batch"}</h2><p>{batch.setup_name || "Custom product"} · {batch.design_count} {batch.design_count === 1 ? "design" : "designs"}</p></div><div><small>Last saved {new Date(`${batch.updated_at.replace(" ","T")}Z`).toLocaleString()}</small><span className="batch-history-actions"><button onClick={() => resume(batch.id)}>{batch.status === "complete" ? "Open results" : "Resume batch"} →</button><button className="remove-batch" onClick={()=>void remove(batch)}>Remove from history</button></span></div></article>)}
    </section>
  </main>;
}
