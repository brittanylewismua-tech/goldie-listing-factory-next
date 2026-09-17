/**
 * WHEN THE NEXT SCAN COMES BACK.
 *
 * The allowance is a rolling day, not a calendar one: a scan returns when the
 * oldest of the consumed ten ages out, which is rarely midnight. A member
 * shown "0 scans left today" with no time has to guess, and midnight is the
 * guess they will make.
 *
 * Phrased relatively because the exact minute is not the point and a clock
 * time invites a member to sit and wait for it.
 */
export function nextScanAt(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const minutes = Math.round((at - now) / 60_000);
  if (minutes <= 0) return "any moment now";
  if (minutes < 60) return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in about ${days} day${days === 1 ? "" : "s"}`;
}
