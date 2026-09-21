/**
 * HOW CURRENT IS THE MONEY ON SCREEN?
 *
 * The month's figures are computed from imported sales, and the import is not
 * on a clock — it happens when the shop is reconciled. So the figure can be
 * days old while looking exactly like a figure computed a minute ago.
 *
 * The system already knew this: the financial view refuses profit with
 * "Stale sources: ledger, payments, receipts…" as its first reason. None of
 * that reached the member, who saw a revenue figure for September and a
 * sentence about production costs — true, but not the first thing that was
 * wrong with the number.
 *
 * A figure is only as current as its least current input, so the oldest
 * source is what is reported. The source names are ours and never appear:
 * a member does not need to know there is a table called own-reviews to
 * understand that their sales were last brought in on Tuesday.
 */

/** A figure is only as current as the oldest thing it was built from. */
export function salesAsOf(sources: Array<{ refreshedAt: number }>): number {
  const times = sources.map(row => Number(row.refreshedAt)).filter(at => at > 0);
  return times.length ? Math.min(...times) : 0;
}

export const REQUIRED_FINANCIAL_SOURCES = ["ledger", "receipts", "printify", "refunds"];

export function financialAsOf(sources: Array<{ source: string; refreshedAt: number; lastError?: string }>): number {
  const required = REQUIRED_FINANCIAL_SOURCES.map(name => sources.find(row => row.source === name));
  if (required.some(row => !row || row.lastError || !(row.refreshedAt > 0))) return 0;
  return salesAsOf(required as Array<{ refreshedAt: number }>);
}

/** The same day a source is called stale elsewhere. One rule, one place. */
export const STALE_AFTER_SECONDS = 86_400;

export function isStale(asOf: number, nowSeconds: number): boolean {
  return asOf > 0 && nowSeconds - asOf > STALE_AFTER_SECONDS;
}

export function dayInShopTimezone(atSeconds: number, timezone: string): string {
  if (!atSeconds) return "";
  try {
    return new Intl.DateTimeFormat("en-GB",
      { day: "numeric", month: "long", timeZone: timezone || "UTC" })
      .format(new Date(atSeconds * 1_000));
  } catch {
    /* An unusable timezone must not cost the member the sentence. */
    return new Intl.DateTimeFormat("en-GB",
      { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(atSeconds * 1_000));
  }
}

/**
 * The sentence shown beneath the month's money. Empty when there is nothing
 * honest to say — no imported sales at all is a different state, and the
 * empty card says that in its own words.
 */
export function freshnessNote(
  { asOf, nowSeconds, timezone }:
  { asOf: number; nowSeconds: number; timezone: string },
): string {
  if (!asOf) return "";
  const day = dayInShopTimezone(asOf, timezone);
  if (!isStale(asOf, nowSeconds))
    return `Worked out from your sales up to ${day}.`;
  return `Worked out from your sales up to ${day}. Anything sold since then `
    + `is not in this figure yet.`;
}
