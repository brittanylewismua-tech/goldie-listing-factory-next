"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * THE MEMBER'S WAY OUT OF "PROFIT UNAVAILABLE".
 *
 * One card per order Shop Map could not price, each saying plainly why, and
 * offering only the corrections the evidence supports.
 *
 * WHAT THIS REFUSES TO DO. It does not guess a cost. It does not offer a
 * Printify order that is not plausibly the same sale. It does not let a
 * member-entered figure or a saved estimate ever be labelled as verified —
 * every amount carries its basis, visibly, for as long as it exists.
 */
type Order = {
  receiptId: number;
  orderDate: number;
  revenueMinor: number;
  currency: string;
  costBasis: "printify-verified" | "manually-confirmed" | "estimated" | "unavailable";
  productionCostMinor: number | null;
  why: string | null;
  reasonCode: string | null;
  actions: string[];
  linkCandidate: { printifyOrderId: string; costMinor: number; currency: string;
    createdAt: number } | null;
  otherCandidates: number;
};

type Payload = {
  month: string;
  verdict: { label: string; headline: string; accuracy: string; profitAvailable: boolean };
  currency: { ok: boolean; because?: string; currency?: string };
  orders: Order[];
  familyRules: Array<{ family: string; baseCostMinor: number }>;
  error?: string;
};

const BASIS_LABEL: Record<Order["costBasis"], string> = {
  "printify-verified": "From Printify",
  "manually-confirmed": "You entered this",
  estimated: "Your estimate",
  unavailable: "Not known",
};

const money = (minor: number | null, currency: string) =>
  minor === null ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" })
        .format(minor / 100);

const day = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toLocaleDateString(undefined,
    { day: "numeric", month: "short", year: "numeric" }) : "";

const memberError = (value?: string) =>
  value && !/(D1_|SQLITE|\bSQL\b|stack|exception)/i.test(value)
    ? value
    : "Production costs could not be loaded right now. Reload the page to try again.";

export default function CostsClient({ signedInEmail }: { signedInEmail: string }) {
  void signedInEmail;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shop-map/production-cost");
      const body = await response.json() as Payload;
      if (!response.ok) setError(memberError(body.error));
      else { setData(body); setCurrency(body.currency?.currency ?? "USD"); }
    } catch { setError("These orders could not be loaded."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (receiptId: number, kind: "manual" | "link") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/shop-map/production-cost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "manual"
          ? { receiptId, kind: "manual", amount, currency }
          : { receiptId, kind: "link" }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) setError(memberError(body.error));
      else {
        setEditing(null); setConfirming(false); setAmount("");
        await load();
      }
    } catch { setError("That could not be saved."); }
    finally { setBusy(false); }
  };

  if (error && !data)
    return <main className="costs"><h1>Production costs</h1>
      <p className="error" role="alert">{error}</p><button type="button" className="back" onClick={()=>void load()}>Try again</button></main>;
  if (!data) return <main className="costs"><h1>Production costs</h1><p role="status">Loading your order costs…</p></main>;

  const unresolved = data.orders.filter(order => order.costBasis === "unavailable");

  return (
    <main className="costs">
      <button className="back" onClick={() => { window.location.href = "/shop-map"; }}>
        ← Shop Map
      </button>
      <h1>Production costs</h1>
      <p className="lede">
        Review what each order cost to produce. Missing costs must be resolved before
        Shop Map can report a complete profit figure.
      </p>

      <section className="verdict">
        <h2>{unresolved.length?`${unresolved.length} ${unresolved.length===1?"order needs":"orders need"} a production cost`:"Production costs recorded"}</h2>
        <p>{data.verdict.accuracy}</p>
      </section>

      {!data.currency.ok && <p className="error">{data.currency.because}</p>}

      {unresolved.length === 0 && (
        <p className="empty">
          Every order this month has a production cost. Nothing needs your
          attention here.
        </p>
      )}

      {data.orders.map(order => (
        <article className="order" key={order.receiptId}>
          <div className="head">
            <span className="ref">Etsy order #{order.receiptId}</span>
            <span className="money">{money(order.revenueMinor, order.currency)}</span>
          </div>
          <p className="when">{day(order.orderDate)}</p>

          <span className="basis" data-basis={order.costBasis}>
            {BASIS_LABEL[order.costBasis]}
            {order.productionCostMinor !== null
              ? ` · ${money(order.productionCostMinor, order.currency)}`
              : ""}
          </span>

          {order.why && <p className="why">{order.why}</p>}

          {order.costBasis === "unavailable" && (
            <>
              <div className="actions">
                {order.linkCandidate && (
                  <button className="primary" disabled={busy} aria-busy={busy}
                    onClick={() => void save(order.receiptId, "link")}>
                    Use the Printify order from {day(order.linkCandidate.createdAt)}
                    {" "}({money(order.linkCandidate.costMinor, order.linkCandidate.currency)})
                  </button>
                )}
                <button onClick={() => {
                  setEditing(editing === order.receiptId ? null : order.receiptId);
                  setConfirming(false);
                }}>
                  Enter what it cost
                </button>
              </div>

              {editing === order.receiptId && (
                <div className="entry">
                  <label htmlFor={`amount-${order.receiptId}`}>
                    What did it cost you to make?
                  </label>
                  <div className="row">
                    <input id={`amount-${order.receiptId}`} type="text" inputMode="decimal"
                      placeholder="0.00" value={amount}
                      onChange={event => { setAmount(event.target.value); setConfirming(false); }} />
                    <select aria-label="Currency" value={currency}
                      onChange={event => { setCurrency(event.target.value); setConfirming(false); }}>
                      {["USD", "GBP", "EUR", "CAD", "AUD"].map(code =>
                        <option key={code} value={code}>{code}</option>)}
                    </select>
                  </div>

                  {/* Confirmed before it is saved: a typo here changes a profit
                      figure the member will rely on. */}
                  {!confirming ? (
                    <div className="actions">
                      <button className="primary" disabled={!amount.trim()}
                        onClick={() => setConfirming(true)}>Continue</button>
                      <button onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <p className="confirm">
                        Save <strong>{amount} {currency}</strong> as what order
                        #{order.receiptId} cost you to make? Shop Map will label this
                        as a figure you entered, not one it verified, and you can
                        change it later.
                      </p>
                      <div className="actions">
                        <button className="primary" disabled={busy} aria-busy={busy}
                          onClick={() => void save(order.receiptId, "manual")}>
                          {busy ? "Saving…" : "Yes, save it"}
                        </button>
                        <button onClick={() => setConfirming(false)}>Back</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </article>
      ))}

      {/*
        D1712 · Saving a production cost is the one thing a member does TO
        their money on this page, and neither its failure nor its progress
        was announced. A screen reader user pressed save and heard nothing at
        all — not the error, not the saving state, not the result.
      */}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
