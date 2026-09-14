/**
 * NAMING A CONNECTION WITHOUT LETTING THE BROWSER NAME IT.
 *
 * Shop Map has to ask Etsy for sales permission against one particular saved
 * connection — not "the active one", because activating a shop is what
 * decides where the Listing Factory publishes, and a permission request must
 * never move that.
 *
 * The obvious way to say which connection is to put the shop id in the URL,
 * and that is exactly what must not happen: a shop id in a query string is a
 * number anybody can change. Instead the server issues an opaque handle for a
 * connection it has already confirmed belongs to the signed-in member, and the
 * handle is the only thing the browser ever carries.
 */
import { env } from "cloudflare:workers";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Long enough to walk through Etsy, short enough to be worthless if leaked. */
const MINUTES = 20;

export async function ensureTargetTable(): Promise<void> {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_auth_targets (
      handle TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      shop_name TEXT NOT NULL DEFAULT '',
      expires_at INTEGER NOT NULL
    )`),
    db().prepare(`DELETE FROM shop_map_auth_targets WHERE expires_at <= unixepoch()`),
  ]);
}

const opaque = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Issue a handle for a connection, having checked it is this member's.
 *
 * Returns null rather than throwing when the shop is not theirs, because the
 * caller is enumerating their own connections and a miss means the row is
 * gone, not that something is wrong.
 */
export async function issueTarget(
  userId: string, shopId: number,
): Promise<{ handle: string; shopName: string } | null> {
  await ensureTargetTable();
  const row = await db()
    .prepare(`SELECT shop_name FROM etsy_connections WHERE user_id = ? AND shop_id = ?`)
    .bind(userId, shopId)
    .first<{ shop_name: string }>();
  if (!row) return null;

  const handle = opaque();
  await db()
    .prepare(
      `INSERT INTO shop_map_auth_targets (handle, user_id, shop_id, shop_name, expires_at)
       VALUES (?,?,?,?, unixepoch() + ?)`)
    .bind(handle, userId, shopId, String(row.shop_name ?? ""), MINUTES * 60)
    .run();
  return { handle, shopName: String(row.shop_name ?? "") };
}

/** Resolve a handle, and only for the member it was issued to. */
export async function readTarget(
  userId: string, handle: string,
): Promise<{ shopId: number; shopName: string } | null> {
  await ensureTargetTable();
  const row = await db()
    .prepare(
      `SELECT shop_id, shop_name FROM shop_map_auth_targets
        WHERE handle = ? AND user_id = ? AND expires_at > unixepoch()`)
    .bind(handle, userId)
    .first<{ shop_id: number; shop_name: string }>();
  return row ? { shopId: Number(row.shop_id), shopName: String(row.shop_name ?? "") } : null;
}
