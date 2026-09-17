/**
 * A MONTH A PERSON CAN READ.
 *
 * Its own module, free of the DOM, so the rule is testable directly rather
 * than through a component node cannot import.
 */
/*
  D1668 · "2026-09" IS A MACHINE'S MONTH.

  The month sat under the shop name in that form on the live page. It is the
  same defect as the database column names on the account page, the UTC
  timestamp in the scanner's refusal and Stripe's own status strings: an
  internal value passed straight into member-facing copy because nothing
  stood between them. Fifth instance, so the fix is a function rather than an
  inline template.

  An unparseable value is shown as it came rather than replaced with a guess,
  because a wrong month is worse than an odd-looking one.
*/
export function monthName(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return value ?? "";
  const year = Number(match[1]), month = Number(match[2]);
  if (!year || month < 1 || month > 12) return value ?? "";
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
