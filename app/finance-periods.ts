/**
 * THREE PERIODS, BECAUSE ONE COVERAGE NUMBER WOULD LIE.
 *
 * Printify returns 23 orders, the oldest from April 2025. Etsy holds years of
 * receipts. Dividing one by the other produces a reconciliation coverage of a
 * few per cent and presents it as a failure of the matcher — when in fact the
 * production history simply does not exist for most of that time and never
 * will.
 *
 * So coverage is only ever quoted inside the period where both sources could
 * possibly agree. Outside it, the honest statement is that production cost is
 * unavailable, not that reconciliation is poor.
 */
export type PeriodKind = "before-printify" | "printify-coverage" | "prospective-goldie";

export type Period = {
  kind: PeriodKind;
  from: number;
  to: number;
  label: string;
  /* Whether a profit figure is even possible in this period. */
  productionCostPossible: boolean;
  why: string;
};

/*
  When Goldie began capturing exact identity at publish time. Before this,
  matching depends on whatever identifiers happened to survive; after it,
  every listing carries its blueprint, product and taxonomy by construction.
*/
export const GOLDIE_FINANCIAL_EPOCH = Math.floor(Date.parse("2026-09-14T00:00:00Z") / 1_000);

export function periodsFor(
  { earliestPrintifyOrder, now }: { earliestPrintifyOrder: number | null; now: number },
): Period[] {
  const periods: Period[] = [];
  /* With no Printify order at all there is no coverage period to speak of. */
  const boundary = earliestPrintifyOrder ?? now;

  periods.push({
    kind: "before-printify", from: 0, to: Math.max(0, boundary - 1),
    label: "Before Printify history",
    productionCostPossible: false,
    why: "Printify does not retain orders from this period, so production cost "
      + "cannot be recovered for these sales. This is a limit of the source, not a gap in matching.",
  });

  if (earliestPrintifyOrder)
    periods.push({
      kind: "printify-coverage", from: earliestPrintifyOrder,
      to: Math.min(now, GOLDIE_FINANCIAL_EPOCH - 1),
      label: "Printify coverage period",
      productionCostPossible: true,
      why: "Both sources exist here, so reconciliation coverage measured in this "
        + "period is a real measurement of the matcher.",
    });

  periods.push({
    kind: "prospective-goldie", from: GOLDIE_FINANCIAL_EPOCH, to: now,
    label: "Prospective Goldie period",
    productionCostPossible: true,
    why: "Exact identity is captured at publish time from here on, so this period "
      + "is the one expected to reach complete profit and stay there.",
  });

  return periods.filter(period => period.to >= period.from);
}

export const periodOf = (atSeconds: number, periods: Period[]) =>
  periods.find(period => atSeconds >= period.from && atSeconds <= period.to) ?? null;

/**
 * A month that has not finished is partial, whatever its coverage looks like.
 *
 * The current month will always be missing sales that have not happened yet,
 * and the first month of a period is usually missing the part before the
 * period began. Neither is a data problem, and neither should read as one.
 */
export function partialReason(
  { month, monthFrom, monthTo, now, periodFrom }:
  { month: string; monthFrom: number; monthTo: number; now: number; periodFrom: number },
): string {
  if (monthTo > now) return `${month} has not finished yet.`;
  if (periodFrom > monthFrom)
    return `${month} began before this period's data exists, so part of it cannot be covered.`;
  return "";
}
