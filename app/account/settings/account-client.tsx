"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type DataView = {
  yours?: Record<string, number>;
  removed?: string[];
  kept?: { say: string; why: string }[];
  note?: string;
};
type Usage = { plan?: { name?: string }; billing?: { active?: boolean; expiresAt?: number | null };
  owner?: boolean };

const when = (seconds?: number | null) => {
  if (!seconds) return "";
  const days = Math.round((seconds * 1000 - Date.now()) / 86_400_000);
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  return `${Math.abs(days)} days ago`;
};

export default function AccountClient({ email }: { email: string }) {
  const [data, setData] = useState<DataView | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [held, plan] = await Promise.all([
          fetch("/api/account/data?action=account-deletion"),
          fetch("/api/usage"),
        ]);
        if (held.ok) setData(await held.json() as DataView);
        if (plan.ok) setUsage(await plan.json() as Usage);
        if (!held.ok && !plan.ok)
          setError("Your account details could not be loaded just now. Nothing has changed.");
      } catch {
        setError("Your account details could not be loaded just now. Nothing has changed.");
      } finally { setLoaded(true); }
    })();
  }, []);

  const rows = Object.entries(data?.yours ?? {}).filter(([, count]) => count > 0);

  return <main className="account p-grid">
    <div className="p-page">
      <header className="p-head">
        <h1>Account</h1>
        <p>Who you are signed in as, what your access covers, and what is held about you.</p>
      </header>

      {error && <p className="p-notice p-notice-bad" role="alert">{error}</p>}

      <section className="acc-group">
        <h2 className="acc-heading">Signed in</h2>
        <div className="acc-card">
          <div className="acc-line"><span>Email</span><b>{email}</b></div>
          {!loaded && <div className="p-skeleton p-skeleton-line" style={{ width: "50%" }} />}
          {loaded && (
            <div className="acc-line">
              <span>Access</span>
              <b>
                {usage?.owner ? "Owner"
                  : usage?.billing?.active ? (usage.plan?.name || "Active")
                    : "No active plan"}
                {usage?.billing?.expiresAt
                  ? ` · renews ${when(usage.billing.expiresAt)}` : ""}
              </b>
            </div>
          )}
          <Link className="acc-link" href="/usage">Plan and limits</Link>
        </div>
      </section>

      <section className="acc-group">
        <h2 className="acc-heading">Your data</h2>
        <div className="acc-card">
          {!loaded && <>
            <div className="p-skeleton p-skeleton-line" style={{ width: "70%" }} />
            <div className="p-skeleton p-skeleton-line" style={{ width: "55%" }} />
          </>}
          {loaded && rows.length > 0 && (
            <ul className="acc-counts">
              {rows.map(([name, count]) => (
                <li key={name}><b>{count.toLocaleString()}</b> <span>{name}</span></li>
              ))}
            </ul>
          )}
          {loaded && rows.length === 0 && (
            <p className="acc-none">Nothing is held about you yet beyond your sign-in.</p>
          )}
          {loaded && data?.kept && data.kept.length > 0 && (
            <details className="acc-detail">
              <summary>What would be kept, and why</summary>
              <ul>{data.kept.map(entry => (
                <li key={entry.say}>{entry.say} <em>({entry.why})</em></li>
              ))}</ul>
            </details>
          )}
          {/*
            DELETION IS NOT SELF-SERVE DURING THE BETA, AND SAYS SO.

            The plan, the scoped SQL, the confirmation phrase and the
            recent-authentication rule all exist and are tested. What is
            deliberately not wired is the button: an irreversible bulk delete
            running unattended is the one thing that should not ship on the
            strength of a code review. Pretending otherwise with a disabled
            control would be worse than saying it plainly.
          */}
          {loaded && data?.note && <p className="acc-note">{data.note}</p>}
        </div>
      </section>

      <div className="acc-signout">
        <Link href="/account/sign-out">Sign out</Link>
      </div>
    </div>
  </main>;
}
