"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type DataView = {
  yours?: Record<string, number>;
  removed?: string[];
  kept?: { say: string; why: string }[];
  note?: string;
};
type Usage = {
  plan?: { key?: string; name?: string };
  billing?: { active?: boolean; subscription?: { status?: string; currentPeriodEnd?: number;
    cancelAtPeriodEnd?: number } };
};

/*
  RAW FIELD NAMES WERE BEING SHOWN TO THE MEMBER.

  The counts came straight from the API and rendered as "designAnalyses",
  "capturedArtwork", "etsyShops" — internal identifiers, in camelCase, on an
  account page. That is styled database output, not an interface.

  Unknown keys are humanised rather than hidden, so a new count added to the
  API appears as readable words instead of disappearing from the page.
*/
const COUNT_LABELS: Record<string, string> = {
  scans: "design scans",
  designAnalyses: "stored design analyses",
  nicheWatches: "niches watched",
  shopWatches: "shops watched",
  capturedArtwork: "print files kept",
  etsyShops: "Etsy shops connected",
  printifyShops: "Printify shops connected",
  batches: "saved batches",
  keywordBanks: "keyword banks",
};
const labelFor = (key: string) => COUNT_LABELS[key]
  ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, first => first.toLowerCase());

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
          {/*
            ACCESS COMES FROM THE PLAN, NOT FROM STRIPE.

            A first version keyed this on `billing.active` and told an account
            with full access that it had "No active plan" — the plan was
            "Owner testing", which needs no subscription. Billing describes a
            subscription; the plan describes what the member can actually do,
            and that is what this line is about.
          */}
          {loaded && (
            <div className="acc-line">
              <span>Access</span>
              <b>{usage?.plan?.name || "Not established"}</b>
            </div>
          )}
          {loaded && usage?.billing?.subscription?.status && (
            <div className="acc-line">
              <span>Subscription</span>
              <b>
                {usage.billing.subscription.status === "active" ? "Active"
                  : usage.billing.subscription.status === "canceled" ? "Cancelled"
                    : usage.billing.subscription.status}
                {usage.billing.subscription.currentPeriodEnd
                  ? ` · ${usage.billing.subscription.cancelAtPeriodEnd ? "ends" : "renews"} `
                    + when(usage.billing.subscription.currentPeriodEnd)
                  : ""}
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
                <li key={name}><b>{count.toLocaleString()}</b> <span>{labelFor(name)}</span></li>
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
