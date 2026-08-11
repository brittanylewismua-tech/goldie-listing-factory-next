"use client";

import { useState } from "react";

export default function AdminControl({ initialActive, memberCount }: { initialActive: boolean; memberCount: number }) {
  const [active, setActive] = useState(initialActive);
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
  return <div className="access-shell"><div className="access-card"><img src="/goldie-wordmark.webp" alt="Goldie" /><p className="mini-label">OWNER CONTROL</p><h1>Mastermind testing</h1><p><b>{active ? "Access is ON" : "Access is OFF"}</b><br />{memberCount} ChatGPT account{memberCount === 1 ? "" : "s"} redeemed the code.</p><button className={active ? "revoke-button" : "activate-button"} disabled={working} onClick={toggle}>{working ? "Updating…" : active ? "Revoke access for everyone" : "Turn mastermind access back on"}</button>{error && <p className="access-error" role="alert">{error}</p>}<p className="admin-note">Turning access off also removes saved Printify tokens for mastermind testers. Your owner test page remains available.</p></div></div>;
}
