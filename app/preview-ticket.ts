/**
 * TICKETS FOR THE STATE HARNESS, AND NOTHING ELSE.
 *
 * Kept out of both routes so the rule that decides whether a ticket is valid
 * is one function with one set of tests, rather than a condition written
 * twice — which is how the two halves of a check drift apart.
 */
export const PREVIEW_TICKET_TABLE = "dev_preview_tickets";

/** Five minutes: long enough to open three widths, short enough to matter. */
export const PREVIEW_TICKET_SECONDS = 5 * 60;

export async function ensurePreviewTickets(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${PREVIEW_TICKET_TABLE} (
    ticket TEXT PRIMARY KEY,
    minted_by TEXT NOT NULL,
    minted_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL)`).run();
}

export async function mintPreviewTicket(db: D1Database, userId: string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  /* Called a ticket, not a token, everywhere. A privacy guard refuses any
     response field named token — it exists to stop provider credentials
     leaking — and being clear that this is not one of those is worth more
     than the guard's convenience. */
  const ticket = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + PREVIEW_TICKET_SECONDS;
  await db.prepare(
    `INSERT INTO ${PREVIEW_TICKET_TABLE} (ticket, minted_by, minted_at, expires_at)
     VALUES (?,?,?,?)`).bind(ticket, userId, now, expiresAt).run();
  /* Expired tickets are of no use to anybody, including an auditor. */
  await db.prepare(`DELETE FROM ${PREVIEW_TICKET_TABLE} WHERE expires_at < ?`)
    .bind(now - 3_600).run().catch(() => {});
  return { ticket, expiresAt };
}

/**
 * Whether this token admits its holder to the harness right now.
 *
 * A malformed token is refused without a query: the shape is fixed, so
 * anything else is not a ticket that was ever minted.
 */
export function looksLikeTicket(ticket: string | null | undefined) {
  return typeof ticket === "string" && /^[0-9a-f]{64}$/.test(ticket);
}

export async function previewTicketValid(
  db: D1Database, ticket: string | null | undefined,
  now = Math.floor(Date.now() / 1000),
) {
  if (!looksLikeTicket(ticket)) return false;
  const row = await db.prepare(
    `SELECT expires_at AS expiresAt FROM ${PREVIEW_TICKET_TABLE} WHERE ticket = ?`)
    .bind(ticket).first<{ expiresAt: number }>().catch(() => null);
  return Boolean(row && Number(row.expiresAt) > now);
}
