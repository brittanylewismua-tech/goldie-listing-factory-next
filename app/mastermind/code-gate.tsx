"use client";

import { useState } from "react";
import Image from "next/image";

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
  return <div className="access-shell"><div className="access-card"><Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" /><p className="mini-label">MASTERMIND BETA</p><h1>Enter your beta code</h1><p>Your free 48-hour beta begins when you enter the code. It includes up to 20 AI lifestyle mockups.</p><p>Signed in as {email}</p><form onSubmit={redeem}><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Mastermind beta code" autoCapitalize="characters" autoComplete="off" /><button disabled={working || !code.trim()}>{working ? "Checking…" : "Start my 48-hour beta"}</button></form>{error && <p className="access-error" role="alert">{error}</p>}</div></div>;
}
