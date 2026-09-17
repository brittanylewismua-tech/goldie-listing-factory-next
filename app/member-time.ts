/**
 * TIMES IN THE MEMBER'S TERMS.
 *
 * Its own module, and free of the Workers runtime, so the rule that decides
 * what a member reads can be tested directly rather than through a route.
 */
/*
  A TIME A PERSON CAN READ, NOT A TIMESTAMP.

  This rendered the raw value straight into member-facing copy: "One becomes
  available again at 2026-09-18T02:15:29.000Z". That is a machine's answer to
  a human's question, and the same mistake as showing a member the name of a
  database column — which this product has now made three times.
*/
export function whenFreed(at: string | null, now = Date.now()) {
  if (!at) return "shortly";
  const gap = new Date(at).getTime() - now;
  if (!Number.isFinite(gap) || gap <= 0) return "shortly";
  const minutes = Math.round(gap / 60_000);
  if (minutes < 2) return "in about a minute";
  if (minutes < 60) return `in about ${minutes} minutes`;
  const hours = Math.round(gap / 3_600_000);
  if (hours <= 1) return "in about an hour";
  if (hours < 24) return `in about ${hours} hours`;
  return "tomorrow";
}
