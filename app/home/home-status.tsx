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
    profitMinor: number | null; profitAvailable: boolean };
  niches?: Array<{ phrase: string; newly: number }>;
  scansLeft?: { remaining: number; limit: number };
  factory?: { openDrafts: number };
  trademark?: { marks: number; loading: boolean };
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

  if (blocks.connections?.needs)
    lines.push(<a key="conn" className="status-line act" href="/connections">
      {blocks.connections.say}</a>);

  if (blocks.thisMonth)
    lines.push(<a key="month" className="status-line" href="/shop-map">
      This month: {money(blocks.thisMonth.revenueMinor, blocks.thisMonth.currency)} from{" "}
      {blocks.thisMonth.orders} order{blocks.thisMonth.orders === 1 ? "" : "s"}
      {/* Profit that cannot be evidenced says so rather than showing a number
          that looks complete. */}
      {blocks.thisMonth.profitAvailable
        ? ` · profit ${money(blocks.thisMonth.profitMinor ?? 0, blocks.thisMonth.currency)}`
        : " · profit unavailable"}
    </a>);

  if (blocks.niches?.length)
    lines.push(<a key="niches" className="status-line" href="/market-watch">
      New evidence in {blocks.niches.map(niche => niche.phrase).join(", ")}
    </a>);

  if (blocks.factory)
    lines.push(<a key="factory" className="status-line" href="/batches">
      {blocks.factory.openDrafts} draft{blocks.factory.openDrafts === 1 ? "" : "s"} in progress
    </a>);

  if (blocks.scansLeft)
    lines.push(<a key="scans" className="status-line" href="/design-scanner">
      {blocks.scansLeft.remaining} of {blocks.scansLeft.limit} scans left today
    </a>);

  if (blocks.trademark?.loading)
    lines.push(<span key="tm" className="status-line quiet">
      The trademark register is still loading, so checks are not complete searches yet.
    </span>);

  if (!lines.length) return null;
  return <section className="status-strip">{lines}</section>;
}
