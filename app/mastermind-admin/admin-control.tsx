"use client";

import { useState } from "react";

export default function AdminControl({ initialActive, memberCount }: { initialActive: boolean; memberCount: number }) {
  const [active, setActive] = useState(initialActive);
  const [working, setWorking] = useState(false);
  async function toggle() {
    setWorking(true);
    const response = await fetch("/api/mastermind/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
    if (response.ok) setActive(!active);
    setWorking(false);
  }
  return <div className="access-shell"><div className="access-card"><img src="/goldie-wordmark.webp" alt="Goldie" /><p className="mini-label">OWNER CONTROL</p><h1>Mastermind testing</h1><p><b>{active ? "Access is ON" : "Access is OFF"}</b><br />{memberCount} ChatGPT account{memberCount === 1 ? "" : "s"} redeemed the code.</p><button className={active ? "revoke-button" : "activate-button"} disabled={working} onClick={toggle}>{working ? "Updating…" : active ? "Revoke access for everyone" : "Turn mastermind access back on"}</button><p className="admin-note">Turning access off also removes saved Printify tokens for mastermind testers. Your owner test page remains available.</p></div></div>;
}
