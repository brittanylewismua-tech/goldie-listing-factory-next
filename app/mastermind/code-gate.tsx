"use client";

import { useState } from "react";

export default function CodeGate({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function redeem(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    const response = await fetch("/api/mastermind/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = await response.json() as { accepted?: boolean; error?: string };
    if (response.ok && result.accepted) window.location.reload();
    else { setError(result.error || "That access code was not accepted."); setWorking(false); }
  }
  return <main className="beta-shell"><div className="beta-orb beta-orb-one"/><div className="beta-orb beta-orb-two"/><div className="beta-brand" aria-label="Goldie Listing Factory"><span>Gold<span className="beta-i">ı<i>✦</i></span>e</span><b>LISTING FACTORY</b></div><section className="beta-card"><p className="beta-eyebrow">PRIVATE MASTERMIND BETA</p><h1>Enter your beta code.</h1><p className="beta-intro">Create up to 10 listings. Access stays open until Brittany closes testing.</p><form className="beta-form" onSubmit={redeem}><label htmlFor="mastermind-code">Mastermind beta code</label><input id="mastermind-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter your code" autoCapitalize="characters" autoComplete="off" autoFocus/><button className="beta-primary" disabled={working || !code.trim()}>{working ? "Checking your code…" : "Start my beta"}</button></form><p className="beta-account">Signed in as <b>{email}</b></p>{error && <p className="beta-error" role="alert">{error}</p>}</section><p className="beta-powered">POWERED BY GOLDIE AI · © 2026 BE A WOLF BIZ</p></main>;
}
