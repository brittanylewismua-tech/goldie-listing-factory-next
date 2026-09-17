import { addMoney, subtractMoney, minorUnits, zeroMoney, formatMoney, type Money } from "./shop-map-money.ts";

/**
 * A MONTHLY SUMMARY THAT CAN BE DEFENDED LINE BY LINE.
 *
 * The temptation in a seller dashboard is to show one big number. The
 * problem is that the number is only ever as good as its coverage, and a
 * profit figure computed from 35% of orders is not a small version of the
 * truth — it is a different number wearing the same label.
 *
 * So nothing here produces a profit unless every component of it was
 * actually observed, and coverage is reported beside every total rather than
 * buried. A partial month says so.
 */
export type ReceiptLine = {
  receiptId: number;
  /* What the buyer paid, from the receipt. */
  gross: Money;
  /* Etsy's own fee figures, from the payments endpoint. Absent when the
     payment record could not be read. */
  fees: Money | null;
  net: Money | null;
  /* What Printify charged to make and ship it. Absent when the order could
     not be matched. */
  productionCost: Money | null;
  when: number;
};

export type Coverage = {
  receipts: number;
  withFees: number;
  withProduction: number;
  /* Orders where BOTH sides are known. Only these can produce profit. */
  complete: number;
  completeShare: number;
};

export type MonthlySummary = {
  month: string;
  currency: string;
  coverage: Coverage;
  /* Always computable: it is the receipts themselves. */
  grossRevenue: Money;
  /* Computable only over the orders where the figure exists, and labelled
     with how many that was. */
  etsyFees: { amount: Money; overReceipts: number } | null;
  productionCost: { amount: Money; overReceipts: number } | null;
  /*
    PROFIT IS REFUSED UNLESS COVERAGE IS COMPLETE.

    A profit over the complete cohort is a true statement about that cohort,
    so it is offered only with the cohort's size attached, and only when the
    cohort is the whole month. Anything less is reported as unavailable with
    the reason, because a seller reading "profit" will not mentally discount
    it by the coverage they did not see.
  */
  profit: { amount: Money; basis: "complete-month" } | null;
  profitUnavailableBecause: string;
};

export const monthKeyOf = (seconds: number) =>
  new Date(seconds * 1_000).toISOString().slice(0, 7);

/**
 * Summarize one month.
 *
 * Currency is taken from the receipts and never converted: adding two
 * currencies would produce a number in no currency at all.
 */
export function summarizeMonth(month: string, lines: ReceiptLine[]): MonthlySummary {
  const inMonth = lines.filter(line => monthKeyOf(line.when) === month);
  const currency = inMonth[0]?.gross.currency ?? "USD";

  /* A month holding two currencies cannot be summed. Saying so is the only
     honest option; picking one would silently drop the other. */
  const currencies = new Set(inMonth.map(line => line.gross.currency));
  if (currencies.size > 1)
    return {
      month, currency: [...currencies].join("/"),
      coverage: { receipts: inMonth.length, withFees: 0, withProduction: 0,
        complete: 0, completeShare: 0 },
      grossRevenue: zeroMoney(currency), etsyFees: null, productionCost: null, profit: null,
      profitUnavailableBecause:
        `This month holds ${currencies.size} currencies (${[...currencies].join(", ")}). `
        + `They will not be added together.`,
    };

  const withFees = inMonth.filter(line => line.fees);
  const withProduction = inMonth.filter(line => line.productionCost);
  const complete = inMonth.filter(line => line.fees && line.productionCost);
  const coverage: Coverage = {
    receipts: inMonth.length,
    withFees: withFees.length,
    withProduction: withProduction.length,
    complete: complete.length,
    completeShare: inMonth.length ? complete.length / inMonth.length : 0,
  };

  const grossRevenue = inMonth.length
    ? addMoney(...inMonth.map(line => line.gross))
    : zeroMoney(currency);

  const etsyFees = withFees.length
    ? { amount: addMoney(...withFees.map(line => line.fees!)), overReceipts: withFees.length }
    : null;
  const productionCost = withProduction.length
    ? { amount: addMoney(...withProduction.map(line => line.productionCost!)),
        overReceipts: withProduction.length }
    : null;

  if (!inMonth.length)
    return { month, currency, coverage, grossRevenue, etsyFees, productionCost,
      profit: null, profitUnavailableBecause: "No orders in this month." };

  if (complete.length !== inMonth.length)
    return {
      month, currency, coverage, grossRevenue, etsyFees, productionCost, profit: null,
      profitUnavailableBecause:
        `${complete.length} of ${inMonth.length} orders have both Etsy fees and production `
        + `cost. A profit over part of the month would read as a profit for the month.`,
    };

  /* Every order complete: gross minus fees minus production is a real figure. */
  const profitAmount = subtractMoney(
    addMoney(...complete.map(line => line.gross)),
    addMoney(...complete.map(line => line.fees!)),
    addMoney(...complete.map(line => line.productionCost!)));

  return {
    month, currency, coverage, grossRevenue, etsyFees, productionCost,
    profit: { amount: profitAmount, basis: "complete-month" },
    profitUnavailableBecause: "",
  };
}

/** A line the member could read, with the coverage attached to the claim. */
export function describe(summary: MonthlySummary): string[] {
  const lines = [
    `${summary.month}: ${formatMoney(summary.grossRevenue)} across `
    + `${summary.coverage.receipts} orders`,
  ];
  if (summary.etsyFees)
    lines.push(`Etsy fees ${formatMoney(summary.etsyFees.amount)} `
      + `(over ${summary.etsyFees.overReceipts} of ${summary.coverage.receipts} orders)`);
  if (summary.productionCost)
    lines.push(`Production ${formatMoney(summary.productionCost.amount)} `
      + `(over ${summary.productionCost.overReceipts} of ${summary.coverage.receipts} orders)`);
  lines.push(summary.profit
    ? `Profit ${formatMoney(summary.profit.amount)} — every order in the month accounted for`
    : `Profit not available. ${summary.profitUnavailableBecause}`);
  return lines;
}

export { minorUnits, formatMoney };
