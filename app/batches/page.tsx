"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Batch = { id:string; status:string; step:string; setup_name:string; product_title:string; design_count:number; created_at:string; updated_at:string };
export default function BatchesPage() {
  const [batches,setBatches] = useState<Batch[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(() => { fetch("/api/batches").then(response => response.json()).then(data => setBatches(data.batches || [])).finally(() => setLoading(false)); }, []);
  function resume(id:string) { window.location.href = `/?batch=${encodeURIComponent(id)}`; }
  return <main className="management-page">
    <nav className="management-nav"><Link href="/">Listing Factory</Link><Link className="active" href="/batches">Batch History</Link><Link href="/keywords">Keyword Banks</Link><Link href="/mockups">Mockup Sets</Link><Link href="/usage">Usage + Plan</Link></nav>
    <header><p className="mini-label">BATCH HISTORY</p><h1>Pick up exactly where you left off.</h1><p>Goldie saves each batch, its product, listing work, results, and any errors. Closing the page never hides a completed Printify draft.</p></header>
    <section className="batch-history">
      {loading ? <p>Loading saved batches…</p> : !batches.length ? <div className="empty-history"><h2>No saved batches yet</h2><p>Your first batch appears here as soon as you add designs.</p><Link href="/">Start a batch</Link></div> : batches.map(batch => <article key={batch.id}><div><span className={`batch-status ${batch.status}`}>{batch.status.replace("_"," ")}</span><h2>{batch.product_title || batch.setup_name || "Untitled batch"}</h2><p>{batch.setup_name || "Custom product"} · {batch.design_count} {batch.design_count === 1 ? "design" : "designs"}</p></div><div><small>Last saved {new Date(`${batch.updated_at.replace(" ","T")}Z`).toLocaleString()}</small><button onClick={() => resume(batch.id)}>{batch.status === "complete" ? "Open results" : "Resume batch"} →</button></div></article>)}
    </section>
  </main>;
}
