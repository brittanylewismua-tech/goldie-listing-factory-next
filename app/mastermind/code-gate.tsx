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
  return <div className="access-shell"><div className="access-card"><img src="/goldie-wordmark.webp" alt="Goldie" /><p className="mini-label">MASTERMIND ACCESS</p><h1>Enter your access code</h1><p>Signed in as {email}</p><form onSubmit={redeem}><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Mastermind code" autoCapitalize="characters" autoComplete="off" /><button disabled={working || !code.trim()}>{working ? "Checking…" : "Enter Listing Factory"}</button></form>{error && <p className="access-error" role="alert">{error}</p>}</div></div>;
}
