"use client";

import { useEffect, useState } from "react";

/**
 * The status strip. Every block is optional and absent when it has nothing to
 * say — an empty counter takes the same space as a real answer and tells the
 * member less than a blank.
 */
type Blocks = {
  connections?: { needs: string | null; say?: string; activeShop?: string; shops?: string[] };
  thisMonth?: { revenueMinor: number; currency: string; orders: number;
    stale?: boolean; asOfDay?: string;
    profitMinor: number | null; profitAvailable: boolean };
  niches?: Array<{ phrase: string; newly: number }>;
  scansLeft?: { remaining: number; limit: number };
  factory?: { openDrafts: number };
  trademark?: { marks: number; loading: boolean };
};

/* The API sends "15 September" (en-GB, day then month). A status strip is
   read at a glance, so it is shortened rather than reformatted from a
   timestamp the client does not have. */
const MONTHS: Record<string, string> = { January: "Jan", February: "Feb", March: "Mar",
  April: "Apr", May: "May", June: "Jun", July: "Jul", August: "Aug",
  September: "Sep", October: "Oct", November: "Nov", December: "Dec" };
const shortDay = (day: string) => {
  const parts = day.trim().split(/\s+/);
  if (parts.length !== 2) return day;
  const [number, month] = parts;
  return MONTHS[month] ? `${MONTHS[month]} ${number}` : day;
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" })
    .format(minor / 100);

export default function HomeStatus() {
  const [blocks, setBlocks] = useState<Blocks | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/home");
        if (response.ok) setBlocks(((await response.json()) as { blocks: Blocks }).blocks);
      } catch { /* the doors below still work */ }
    })();
  }, []);

  if (!blocks) return null;
  const lines: React.ReactNode[] = [];

  /*
    ONE FACT PER BOX, WITH ITS LABEL ABOVE IT.

    These were single running sentences — "This month: $71.00 from 3 orders ·
    profit unavailable · worked out 15 September" — set in one weight, wrapped
    mid-clause at every width, with "worked out 15 September" reading as a
    phrase the member had to decode and "profit unavailable" reading as a
    failure rather than a missing input. Each box now has a quiet label, the
    number it is about, and, when there is one, a plain note underneath.
  */
  const box = (key: string, href: string, label: string, value: React.ReactNode,
    note?: React.ReactNode, act = false) =>
    <a key={key} className={`status-line${act ? " act" : ""}`} href={href}>
      <span className="status-body">
        <span className="status-label">{label}</span>
        <b className="status-value">{value}</b>
        {note ? <span className="status-note">{note}</span> : null}
      </span>
    </a>;

  if (blocks.connections?.needs)
    lines.push(box("conn", "/connections", "Connection",
      blocks.connections.say ?? "Needs attention", "Open Connections to fix it.", true));

  if (blocks.thisMonth)
    lines.push(box("month", "/shop-map", "This month",
      <>{money(blocks.thisMonth.revenueMinor, blocks.thisMonth.currency)}
        <small> from {blocks.thisMonth.orders} order{blocks.thisMonth.orders === 1 ? "" : "s"}</small></>,
      <>
        {blocks.thisMonth.profitAvailable
          ? `Profit ${money(blocks.thisMonth.profitMinor ?? 0, blocks.thisMonth.currency)}.`
          /* Not "profit unavailable": that names the gap without naming what
             closes it. Production costs are what is missing. */
          : "Profit needs your production costs."}
        {blocks.thisMonth.stale && blocks.thisMonth.asOfDay
          ? ` Data through ${shortDay(blocks.thisMonth.asOfDay)}.`
          : ""}
      </>));

  if (blocks.niches?.length)
    lines.push(box("niches", "/market-watch", "Market Watch",
      `New evidence in ${blocks.niches.map(niche => niche.phrase).join(", ")}`));

  if (blocks.factory)
    lines.push(box("factory", "/batches", "Listing Factory",
      `${blocks.factory.openDrafts} draft${blocks.factory.openDrafts === 1 ? "" : "s"} in progress`));

  if (blocks.scansLeft)
    lines.push(box("scans", "/design-scanner", "Design Scanner",
      `${blocks.scansLeft.remaining} of ${blocks.scansLeft.limit} scans left`, "Resets daily."));

  if (blocks.trademark?.loading)
    lines.push(<span key="tm" className="status-line quiet">
      <span className="status-body">
        <span className="status-label">Trademark Checker</span>
        <b className="status-value">Register still loading</b>
        <span className="status-note">Checks are not complete searches yet.</span>
      </span>
    </span>);

  if (!lines.length) return null;
  return <section className="status-strip">{lines}</section>;
}
