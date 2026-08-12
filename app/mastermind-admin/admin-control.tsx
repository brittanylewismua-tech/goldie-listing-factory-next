"use client";

import { useState } from "react";

type Diagnostic = { reference: string; userEmail: string; fileName: string; stage: string; outcome: string; retryCount: number; errorCode: string | null; httpStatus: number | null; message: string | null; updatedAt: string };
const stageLabel: Record<string,string> = { artwork_staging:"Receiving artwork", template_lookup:"Finding template", printify_upload:"Sending to Printify", image_registration:"Registering image", draft_creation:"Creating draft", request_validation:"Checking request" };

export default function AdminControl({ initialActive, memberCount, initialDiagnostics }: { initialActive: boolean; memberCount: number; initialDiagnostics: Diagnostic[] }) {
  const [active, setActive] = useState(initialActive);
  const [diagnosticSearch, setDiagnosticSearch] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/mastermind/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The access setting could not be changed.");
      setActive(!active);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The access setting could not be changed."); }
    finally { setWorking(false); }
  }
  const filteredDiagnostics = initialDiagnostics.filter((item) => `${item.reference} ${item.userEmail} ${item.fileName} ${item.errorCode ?? ""}`.toLowerCase().includes(diagnosticSearch.trim().toLowerCase()));
  return <div className="access-shell admin-access-shell"><div className="admin-dashboard"><div className="access-card"><img src="/goldie-wordmark.webp" alt="Goldie" /><p className="mini-label">OWNER CONTROL</p><h1>Mastermind testing</h1><p><b>{active ? "Access is ON" : "Access is OFF"}</b><br />{memberCount} ChatGPT account{memberCount === 1 ? "" : "s"} redeemed the code.</p><button className={active ? "revoke-button" : "activate-button"} disabled={working} onClick={toggle}>{working ? "Updating…" : active ? "Revoke access for everyone" : "Turn mastermind access back on"}</button>{error && <p className="access-error" role="alert">{error}</p>}<p className="admin-note">Turning access off also removes saved Printify tokens for mastermind testers. Your owner test page remains available.</p></div><section className="diagnostics-card"><p className="mini-label">AUTOMATIC DIAGNOSTICS</p><h2>Recent failed operations</h2><p className="diagnostics-intro">Goldie records the failed stage and sanitized Printify response for 30 days. Artwork and tokens are never stored here.</p>{initialDiagnostics.length > 0 && <input className="diagnostics-search" value={diagnosticSearch} onChange={(event)=>setDiagnosticSearch(event.target.value)} placeholder="Search reference, member, design or code" aria-label="Search diagnostics" />}{initialDiagnostics.length === 0 ? <div className="diagnostics-empty">No failures have been recorded.</div> : filteredDiagnostics.length === 0 ? <div className="diagnostics-empty">No diagnostics match that search.</div> : <div className="diagnostics-list">{filteredDiagnostics.map((item)=><article key={item.reference} className="diagnostic-item"><div><b>{item.reference}</b><span>{stageLabel[item.stage] ?? item.stage} · {item.updatedAt}</span></div><dl><div><dt>Member</dt><dd>{item.userEmail}</dd></div><div><dt>Design</dt><dd>{item.fileName}</dd></div><div><dt>Retries</dt><dd>{item.retryCount}</dd></div><div><dt>Printify code</dt><dd>{item.errorCode ?? item.httpStatus ?? "None returned"}</dd></div></dl><p>{item.message ?? "No response message was returned."}</p></article>)}</div>}</section></div></div>;
}
