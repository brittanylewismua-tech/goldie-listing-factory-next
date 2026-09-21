/**
 * A MONTH IS A PLACE, NOT JUST A NUMBER.
 *
 * An order at 11pm on 31 January in Los Angeles is a February order to a
 * server running in UTC. Silently using the server's timezone would move
 * revenue between months for reasons the seller cannot see and cannot
 * reproduce against their own Etsy dashboard.
 *
 * So the shop's timezone is required. Without it, no monthly figure is shown
 * at all — a monthly total computed in the wrong zone is not a rounding
 * error, it is the wrong month.
 */
export type MonthWindow = { month: string; from: number; to: number; timezone: string };

/** Offset in seconds for a timezone at a given instant, DST included. */
export function offsetSeconds(timezone: string, atSeconds: number): number {
  const date = new Date(atSeconds * 1_000);
  /* Formatting the same instant in both zones and subtracting is the only
     way to get a real offset without shipping a timezone database. */
  const asUtc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const asLocal = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return Math.round((asLocal.getTime() - asUtc.getTime()) / 1_000);
}

export function isKnownTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try { new Date().toLocaleString("en-US", { timeZone: timezone }); return true; }
  catch { return false; }
}

/**
 * The exact instants a month begins and ends in the shop's timezone.
 *
 * The offset is resolved separately at each boundary, so a month containing a
 * daylight-saving change is still exactly that month: one boundary may sit at
 * -08:00 and the other at -07:00, which is correct and is what a naive fixed
 * offset gets wrong twice a year.
 */
export function monthWindow(month: string, timezone: string): MonthWindow | null {
  if (!/^\d{4}-\d{2}$/.test(month) || !isKnownTimezone(timezone)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 1000 || monthNumber < 1 || monthNumber > 12) return null;

  const boundary = (y: number, m: number) => {
    const naive = Date.UTC(y, m - 1, 1, 0, 0, 0) / 1_000;
    /* Resolve twice: the offset itself depends on the instant. */
    const first = naive - offsetSeconds(timezone, naive);
    return naive - offsetSeconds(timezone, first);
  };

  const from = boundary(year, monthNumber);
  const to = monthNumber === 12 ? boundary(year + 1, 1) : boundary(year, monthNumber + 1);
  return { month, from, to: to - 1, timezone };
}

/** Which month an instant belongs to, in the shop's zone. */
export function monthOf(atSeconds: number, timezone: string): string | null {
  if (!isKnownTimezone(timezone)) return null;
  const shifted = new Date((atSeconds + offsetSeconds(timezone, atSeconds)) * 1_000);
  return shifted.toISOString().slice(0, 7);
}

export const MISSING_TIMEZONE =
  "This shop has no timezone set, so month boundaries cannot be placed. "
  + "A monthly total computed in the wrong zone is the wrong month, not a small error.";
