/**
 * MONEY, IN WHOLE MINOR UNITS, ALWAYS.
 *
 * Profit is the one number in Goldie a member could act on financially, and
 * floating point is how money quietly goes wrong: 0.1 + 0.2 is not 0.3, and a
 * hundred orders of that is a figure nobody can reconcile against their own
 * bank. Every amount here is an integer count of the smallest unit of its
 * currency, and the currency travels with it so two of them can never be
 * added without agreeing.
 *
 * Etsy sends {amount, divisor, currency_code}. Printify sends plain integers
 * already in minor units. Both arrive here and become the same thing.
 */

export type Money = { minor: number; currency: string };

export const money = (minor: number, currency: string): Money =>
  ({ minor: Math.round(minor), currency: currency.toUpperCase() });

export const ZERO = (currency: string): Money => money(0, currency);

/**
 * An Etsy money object.
 *
 * The divisor is not always 100 — Etsy uses it to express currencies with
 * other subdivisions — so it is read rather than assumed. A divisor of 100
 * with amount 4200 is 4200 minor units, not 42.
 */
export function fromEtsy(value: unknown, fallbackCurrency = "USD"): Money {
  const row = (value ?? {}) as { amount?: number; divisor?: number; currency_code?: string };
  if (typeof row.amount !== "number") return ZERO(fallbackCurrency);
  const divisor = Number(row.divisor) || 100;
  /* Minor units are the amount scaled to hundredths of the major unit when the
     divisor says otherwise, so everything downstream compares like with like. */
  const minor = divisor === 100 ? row.amount : Math.round((row.amount / divisor) * 100);
  return money(minor, String(row.currency_code ?? fallbackCurrency));
}

/** Printify sends integers already in minor units. */
export const fromPrintify = (value: unknown, currency: string): Money =>
  money(typeof value === "number" ? value : 0, currency);

export function add(...amounts: Money[]): Money {
  const present = amounts.filter(Boolean);
  if (!present.length) return ZERO("USD");
  const currency = present[0].currency;
  for (const amount of present)
    if (amount.currency !== currency)
      /* Refusing is the only honest option: a total that silently mixed
         currencies would look perfectly reasonable and be wrong. */
      throw new Error(`Cannot add ${amount.currency} to ${currency}`);
  return money(present.reduce((sum, amount) => sum + amount.minor, 0), currency);
}

export const subtract = (from: Money, ...amounts: Money[]): Money =>
  add(from, ...amounts.map(amount => money(-amount.minor, amount.currency)));

/** For display and reports only. Never for arithmetic. */
export const format = (amount: Money): string =>
  `${(amount.minor / 100).toFixed(2)} ${amount.currency}`;
