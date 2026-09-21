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
/*
  D1681 · "1 shops watched" AND "1 Etsy shops connected".

  The labels were fixed plurals, and these counts are very often one — one
  Etsy shop is the normal case, not the edge. Each label carries both forms;
  the singular is only used when the count is exactly one.
*/
const COUNT_LABELS: Record<string, { one: string; many: string }> = {
  scans: { one: "design scan", many: "design scans" },
  designAnalyses: { one: "stored design analysis", many: "stored design analyses" },
  nicheWatches: { one: "keyword tracked", many: "keywords tracked" },
  shopWatches: { one: "shop watched", many: "shops watched" },
  capturedArtwork: { one: "print file kept", many: "print files kept" },
  etsyShops: { one: "Etsy shop connected", many: "Etsy shops connected" },
  printifyShops: { one: "Printify shop connected", many: "Printify shops connected" },
  batches: { one: "saved batch", many: "saved batches" },
  keywordBanks: { one: "keyword bank", many: "keyword banks" },
};
const labelFor = (key: string, count: number) => {
  const known = COUNT_LABELS[key];
  if (known) return count === 1 ? known.one : known.many;
  /* An unknown key is still humanised rather than dropped, so a count added
     to the API later reads as words instead of vanishing. */
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, first => first.toLowerCase());
};

const when = (seconds?: number | null) => {
  if (!seconds) return "";
  const days = Math.round((seconds * 1000 - Date.now()) / 86_400_000);
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  return `${Math.abs(days)} days ago`;
};

/*
  DELETION, IN THE MEMBER'S HANDS.

  Deliberately several steps rather than one red button: the preview is already
  above this, the phrase has to be typed exactly, and the server independently
  requires recent authentication. None of those is a formality — each one is a
  place where somebody who did not mean this can stop.

  The success state is the important one. "Your data has been removed" with
  nothing under it is a reassurance; the counts are what make it a statement.
*/
function DeleteAccount({ counts, onDone }: { counts: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ removed: { say: string; changed: number }[];
    /* What could not be carried out, and what is kept on purpose. With forty
       steps a partial failure is real, and a member told "your data has been
       removed" when some of it was not has been misled about the one thing
       they cannot check for themselves. */
    incomplete?: { say: string }[]; kept?: string[];
    /*
      Whether the deletion actually finished, as distinct from whether the
      request ran. A partial run must not render as the success confirmation:
      the member is the one person who cannot check, so the difference is on
      the screen rather than in the wording alone.
    */
    complete?: boolean; resumed?: boolean;
    say: string } | null>(null);

  if (done) return (
    <div className={done.complete === false ? "acc-deleted acc-deleted-partial" : "acc-deleted"}
      role="status">
      {done.complete === false && <b className="acc-deleted-heading">Deletion unfinished</b>}
      <b>{done.say}</b>
      {done.removed.length > 0 && (
        <ul>{done.removed.map(step => (
          <li key={step.say}>{step.say} <em>({step.changed.toLocaleString()})</em></li>
        ))}</ul>
      )}
      {(done.incomplete ?? []).length > 0 && (
        <div className="acc-incomplete">
          <b>This could not be removed</b>
          <ul>{done.incomplete!.map(step => <li key={step.say}>{step.say}</li>)}</ul>
          <p>
            It has been recorded. Asking again resumes from here and attempts only
            these — nothing already removed is touched a second time.
          </p>
        </div>
      )}
      {(done.kept ?? []).length > 0 && (
        <div className="acc-kept">
          <b>Kept, because it has to be</b>
          <ul>{done.kept!.map(line => <li key={line}>{line}</li>)}</ul>
          <p>Billing records are kept for the period the law requires.</p>
        </div>
      )}
      <p>Your connections are switched off and their keys destroyed. Sign out to finish.</p>
      <Link href="/account/sign-out">Sign out</Link>
    </div>
  );

  return <div className="acc-delete">
    {!open && (
      <button type="button" className="acc-delete-open" onClick={() => setOpen(true)}>
        Delete my data
      </button>
    )}
    {open && (
      <div className="acc-delete-confirm">
        <b>This cannot be undone.</b>
        <p>
          Everything listed above is removed{counts > 0 ? "" : ""}, and your Etsy and
          Printify connections are switched off with their keys destroyed. Type{" "}
          <code>DELETE MY DATA</code> to confirm.
        </p>
        <input
          className="p-input"
          value={phrase}
          onChange={event => setPhrase(event.target.value)}
          placeholder="DELETE MY DATA"
          aria-label="Type DELETE MY DATA to confirm"
          autoComplete="off"
        />
        {error && <p className="p-notice p-notice-bad" role="alert">{error}</p>}
        <div className="acc-delete-actions">
          <button type="button" className="p-button p-button-quiet"
            onClick={() => { setOpen(false); setPhrase(""); setError(""); }}>
            Keep my data
          </button>
          <button type="button" className="p-button acc-delete-go"
            disabled={busy || phrase.trim() !== "DELETE MY DATA"}
            onClick={async () => {
              setBusy(true); setError("");
              try {
                const response = await fetch("/api/account/delete", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phrase }),
                });
                const answer = await response.json() as {
                  deleted?: boolean; removed?: { say: string; changed: number }[];
                  /* D1651 · The route sends these and the component dropped
                     them on the floor, so the success message said "listed
                     below" above nothing at all. A promise of a list is
                     worse than no list. */
                  incomplete?: { say: string }[]; kept?: string[];
                  complete?: boolean; resumed?: boolean;
                  say?: string; error?: string };
                if (!response.ok || !answer.deleted) {
                  setError(answer.error || "That did not go through. Nothing was changed.");
                  return;
                }
                setDone({ removed: answer.removed ?? [],
                  incomplete: answer.incomplete ?? [], kept: answer.kept ?? [],
                  complete: answer.complete !== false, resumed: Boolean(answer.resumed),
                  say: answer.say ?? "Your data has been removed." });
                onDone();
              } catch {
                setError("That did not go through. Nothing was changed.");
              } finally { setBusy(false); }
            }}>
            {busy ? "Removing…" : "Delete my data"}
          </button>
        </div>
      </div>
    )}
  </div>;
}

/*
  STRIPE'S WORDS ARE NOT THE MEMBER'S WORDS.

  Two statuses were translated and every other one fell through to the raw
  identifier, so a member whose card failed read "past_due" on their own
  account page, and one in a trial read "trialing". The fourth time this
  product has shown somebody an internal value because nothing stood between
  them — after three database column names and a UTC timestamp.

  An unknown status is made readable rather than dropped, so a status Stripe
  adds later appears as words instead of vanishing or leaking.
*/
const SUBSCRIPTION_LABELS: Record<string, string> = {
  active: "Active",
  canceled: "Cancelled",
  trialing: "In trial",
  past_due: "Payment overdue",
  unpaid: "Unpaid",
  incomplete: "Not finished setting up",
  incomplete_expired: "Setup expired",
  paused: "Paused",
};

export function subscriptionLabel(status: string) {
  return SUBSCRIPTION_LABELS[status]
    ?? status.replace(/_/g, " ").replace(/^./, first => first.toUpperCase());
}

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
        <p>Your sign-in, subscription, and saved data.</p>
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
                {subscriptionLabel(usage.billing.subscription.status)}
                {usage.billing.subscription.currentPeriodEnd
                  /* D1681 · "Cancelled · ends 8 days ago" — a date already
                     past does not "end", it ended. `when` renders both
                     directions, so the verb has to follow it. */
                  ? ` · ${usage.billing.subscription.cancelAtPeriodEnd
                      ? (usage.billing.subscription.currentPeriodEnd * 1000 < Date.now()
                        ? "ended" : "ends")
                      : (usage.billing.subscription.currentPeriodEnd * 1000 < Date.now()
                        ? "expired" : "renews")} `
                    + when(usage.billing.subscription.currentPeriodEnd)
                  : ""}
              </b>
            </div>
          )}
          <Link className="acc-link" href="/usage">Usage and limits</Link>
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
                <li key={name}><b>{count.toLocaleString()}</b> <span>{labelFor(name, Number(count))}</span></li>
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
                <li key={entry.say}>{entry.say}</li>
              ))}</ul>
            </details>
          )}
          {loaded && <DeleteAccount counts={rows.length} onDone={() => setData({ yours: {} })} />}
        </div>
      </section>

      <div className="acc-signout">
        <Link href="/account/sign-out">Sign out</Link>
      </div>
    </div>
  </main>;
}
