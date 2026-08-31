"use client";

import { useState } from "react";
import { isSellerFixable } from "@/app/error-classification";
import Image from "next/image";

export type Diagnostic = { reference: string; userEmail: string; fileName: string; stage: string; outcome: string; retryCount: number; errorCode: string | null; httpStatus: number | null; message: string | null; updatedAt: string };
const stageLabel: Record<string,string> = { artwork_staging:"Receiving artwork", template_lookup:"Finding template", printify_upload:"Sending to Printify", image_registration:"Registering image", draft_creation:"Creating draft", request_validation:"Checking request" };

function standardTime(value: string) {
  const date = new Date(`${value.replace(" ", "T").replace(/Z$/i, "")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year:"numeric", month:"short", day:"numeric", hour:"numeric", minute:"2-digit", second:"2-digit" }).format(date);
}

export type LoggedFailure = { id: string; createdAt: string; area: string; severity: string; userEmail: string | null; userName: string | null; message: string; errorCode: string | null; httpStatus: number | null; url: string | null; context: string | null; alerted?: number };

export default function AdminControl({ initialActive, memberCount, initialDiagnostics, initialErrors = [] }: { initialActive: boolean; memberCount: number; initialDiagnostics: Diagnostic[]; initialErrors?: LoggedFailure[] }) {
  const [errorSearch, setErrorSearch] = useState("");
  const [errorFilter, setErrorFilter] = useState<"all"|"platform"|"seller">("all");
  const [active, setActive] = useState(initialActive);
  const [diagnosticSearch, setDiagnosticSearch] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/mastermind/admin", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ active:!active }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The access setting could not be changed.");
      setActive(!active);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The access setting could not be changed."); }
    finally { setWorking(false); }
  }

  const filteredDiagnostics = initialDiagnostics.filter((item) => `${item.reference} ${item.userEmail} ${item.fileName} ${item.errorCode ?? ""}`.toLowerCase().includes(diagnosticSearch.trim().toLowerCase()));

  return <div className="access-shell admin-access-shell"><div className="admin-dashboard">
    <div className="access-card">
      <Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" />
      <p className="mini-label">OWNER CONTROL</p>
      <h1>Mastermind testing</h1>
      <p><b>{active ? "Access is ON" : "Access is OFF"}</b><br />{memberCount} ChatGPT account{memberCount === 1 ? "" : "s"} redeemed the code.</p>
      <a className="access-link" href="/operations">Open Etsy operations</a>
      <button className={active ? "revoke-button" : "activate-button"} disabled={working} onClick={toggle}>{working ? "Updating…" : active ? "Revoke access for everyone" : "Turn mastermind access back on"}</button>
      {error && <p className="access-error" role="alert">{error}</p>}
      <p className="admin-note">Turning access off also removes saved Printify tokens for mastermind testers. Your owner test page remains available.</p>
    </div>
    <section className="diagnostics-card">
      <p className="mini-label">ERROR LOG</p>
      <h2>Everything that failed</h2>
      {/* D645 - the old copy promised an email for every area. Seller-fixable
          failures are recorded and never emailed now, so the page says what is
          actually true and becomes the place to look. */}
      <p className="diagnostics-intro">Every browser crash and failed request across Listing Factory, newest first, with who it happened to. <b>Needs Goldie</b> means something only you can fix. <b>Seller can fix</b> means the seller has already been told on their own screen. Nothing is emailed — this page is where failures are read.</p>
      <div className="diagnostics-filters" role="group" aria-label="Filter errors">
        {([["all","All"],["platform","Needs Goldie"],["seller","Seller can fix"]] as const).map(([key,label])=>(
          <button key={key} type="button" className={errorFilter===key?"diagnostics-filter is-on":"diagnostics-filter"} aria-pressed={errorFilter===key} onClick={()=>setErrorFilter(key)}>
            {label} <span>{key==="all"?initialErrors.length:initialErrors.filter((item)=>(key==="seller")===isSellerFixable(item.message)).length}</span>
          </button>
        ))}
      </div>
      {initialErrors.length > 0 && <input className="diagnostics-search" value={errorSearch} onChange={(event) => setErrorSearch(event.target.value)} placeholder="Search member, area, message or code" aria-label="Search errors" />}
      {initialErrors.length === 0 && <p className="diagnostics-empty">Nothing has failed yet.</p>}
      <div className="diagnostics-list">{initialErrors
        .filter((item) => errorFilter === "all" || (errorFilter === "seller") === isSellerFixable(item.message))
        .filter((item) => `${item.area} ${item.userEmail ?? ""} ${item.userName ?? ""} ${item.message} ${item.errorCode ?? ""}`.toLowerCase().includes(errorSearch.trim().toLowerCase()))
        .map((item) => (
        <article key={item.id} className={`diagnostic-item${item.severity === "warning" ? "" : " diagnostic-row-error"}`}>
          <div><b>{item.area}</b><span className={isSellerFixable(item.message) ? "diagnostic-tag is-seller" : "diagnostic-tag is-platform"}>{isSellerFixable(item.message) ? "Seller can fix" : "Needs Goldie"}</span><span>{item.alerted ? "Emailed · " : ""}{standardTime(item.createdAt)}</span></div>
          <dl>
            <div><dt>MEMBER</dt><dd>{item.userEmail || "Not signed in"}{item.userName ? ` · ${item.userName}` : ""}</dd></div>
            <div><dt>WHERE</dt><dd>{item.url || "—"}</dd></div>
            {item.errorCode ? <div><dt>CODE</dt><dd>{item.errorCode}</dd></div> : null}
            {item.httpStatus ? <div><dt>HTTP</dt><dd>{item.httpStatus}</dd></div> : null}
          </dl>
          <p className="diagnostic-message">{item.message}</p>
          {item.context ? <details className="diagnostic-context"><summary>Full context</summary><pre>{item.context}</pre></details> : null}
        </article>
      ))}</div>
    </section>
    <section className="diagnostics-card">
      <p className="mini-label">AUTOMATIC DIAGNOSTICS</p>
      <h2>Recent failed operations</h2>
      <p className="diagnostics-intro">Goldie records the failed stage and sanitized Printify response for 30 days. Artwork and tokens are never stored here.</p>
      {initialDiagnostics.length > 0 && <input className="diagnostics-search" value={diagnosticSearch} onChange={(event) => setDiagnosticSearch(event.target.value)} placeholder="Search reference, member, design or code" aria-label="Search diagnostics" />}
      {initialDiagnostics.length === 0 ? <div className="diagnostics-empty">No failures have been recorded.</div> : filteredDiagnostics.length === 0 ? <div className="diagnostics-empty">No diagnostics match that search.</div> : <div className="diagnostics-list">
        {filteredDiagnostics.map((item) => <article key={item.reference} className="diagnostic-item">
          <div><b>{item.reference}</b><span>{stageLabel[item.stage] ?? item.stage} · {standardTime(item.updatedAt)}</span></div>
          <dl><div><dt>Member</dt><dd>{item.userEmail}</dd></div><div><dt>Design</dt><dd>{item.fileName}</dd></div><div><dt>Retries</dt><dd>{item.retryCount}</dd></div><div><dt>Printify code</dt><dd>{item.errorCode ?? item.httpStatus ?? "None returned"}</dd></div></dl>
          <p>{item.message ?? "No response message was returned."}</p>
          <a className="account-diagnosis-link" href={`/mastermind-admin/member-audit?email=${encodeURIComponent(item.userEmail)}`}>Diagnose this member’s Printify account</a>
        </article>)}
      </div>}
    </section>
  </div></div>;
}
