/**
 * ASKING FOR SALES DATA ONLY WHEN SALES DATA IS WHAT THE MEMBER WANTED.
 *
 * Shop Map needs `transactions_r`, and nobody has granted it: the connect flow
 * has always asked for listings and shops, which is everything the Listing
 * Factory needs and nothing more. Adding the scope to that flow would make
 * every member re-authorise before they could publish a listing, to enable a
 * feature they may never open.
 *
 * So the scope is asked for by the feature that needs it, at the moment it is
 * needed, and the existing connection keeps working the whole time. If the
 * member declines, they still have a shop connected and a Listing Factory that
 * works; they simply do not have profit numbers.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection } from "@/app/api/etsy/client";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** What the Listing Factory has always needed. */
export const BASE_SCOPES = "listings_r listings_w shops_r shops_w";
/** What Shop Map adds: receipts, transactions, payments, the ledger. */
export const SHOP_MAP_SCOPES = `${BASE_SCOPES} transactions_r`;

export async function ensureScopeColumn(): Promise<void> {
  /*
    CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists, and
    this codebase has lost deploys to that. A column added after the table
    shipped has to be stated as an ALTER, and the only tolerated error is the
    one that means it is already there.
  */
  for (const column of ["scopes TEXT", "scopes_checked_at TEXT"]) {
    try {
      await db().prepare(`ALTER TABLE etsy_connections ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
    }
  }
  /* The shop a Shop Map authorisation was started for, carried server-side so
     the callback can refuse an authorisation that came back for another. */
  try {
    await db().prepare(`ALTER TABLE etsy_oauth_states ADD COLUMN target_shop_id INTEGER`).run();
  } catch (error) {
    if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
  }
}

export type Capability = {
  connected: boolean;
  shopId: number | null;
  shopName: string;
  canReadSales: boolean;
  /** Why we believe that: what the grant said, or what Etsy answered. */
  evidence: "granted" | "probed" | "legacy-unknown" | "none";
};

/**
 * Can this member's connection read receipts?
 *
 * Grants made from now on record what Etsy actually returned, which is the
 * reliable answer. Connections made before that have no record, so rather
 * than assume either way the question is put to Etsy once and the answer is
 * stored — a 403 on a single receipt read is cheap and unambiguous.
 */
export async function salesCapability(userId: string, shopId?: number): Promise<Capability> {
  await ensureScopeColumn();
  /* A shop may be asked about by name without being the active one: Shop Map
     is per shop, and the shop it reports on is not necessarily the shop the
     Listing Factory publishes to. */
  const row = shopId
    ? await db()
      .prepare(
        `SELECT shop_id, shop_name, scopes FROM etsy_connections
          WHERE user_id = ? AND shop_id = ?`)
      .bind(userId, shopId)
      .first<{ shop_id: number; shop_name: string; scopes: string | null }>()
    : await db()
      .prepare(
        `SELECT shop_id, shop_name, scopes FROM etsy_connections
          WHERE user_id = ? AND is_active = 1`)
      .bind(userId)
      .first<{ shop_id: number; shop_name: string; scopes: string | null }>();

  if (!row) return { connected: false, shopId: null, shopName: "", canReadSales: false, evidence: "none" };
  const base = { connected: true, shopId: Number(row.shop_id), shopName: String(row.shop_name ?? "") };

  if (row.scopes)
    return {
      ...base,
      canReadSales: row.scopes.split(/\s+/).includes("transactions_r"),
      evidence: "granted",
    };

  /* No record of the grant: ask Etsy rather than guess. Only for the active
     connection, because the probe borrows the active token and asking it
     about another shop proves nothing about that shop's grant. */
  if (shopId && shopId !== Number(row.shop_id)) return { ...base, canReadSales: false, evidence: "legacy-unknown" };
  try {
    const connection = await etsyConnection(userId);
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${connection.shopId}/receipts?limit=1`,
      {
        headers: {
          /*
            KEY AND SECRET, NOT THE KEY.

            An authenticated Etsy call wants `key:secret` in x-api-key. Sending
            the bare key answers 403 "Shared secret is required in x-api-key
            header" — which reads exactly like a refused permission and is
            nothing of the kind. It cost a false negative on a grant that had
            just been made.
          */
          "x-api-key": etsyApiCredential(),
          authorization: `Bearer ${connection.token}`,
        },
        signal: AbortSignal.timeout(15_000),
      });

    if (response.ok) {
      await db()
        .prepare(
          `UPDATE etsy_connections SET scopes = ?, scopes_checked_at = ?
            WHERE user_id = ? AND is_active = 1`)
        .bind(SHOP_MAP_SCOPES, new Date().toISOString(), userId)
        .run();
      return { ...base, canReadSales: true, evidence: "probed" };
    }

    /*
      A REFUSAL IS ONLY RECORDED WHEN ETSY SAYS IT IS ABOUT PERMISSION.

      Anything else — a bad header, a rate limit, a shop with no receipts yet —
      would otherwise be written down as "this member cannot use the feature",
      and the stored answer would stop the question ever being asked again.
    */
    const said = await response.text();
    const aboutScope = /scope|permission|not authorized|unauthorized/i.test(said);
    if (aboutScope)
      await db()
        .prepare(
          `UPDATE etsy_connections SET scopes = ?, scopes_checked_at = ?
            WHERE user_id = ? AND is_active = 1`)
        .bind(BASE_SCOPES, new Date().toISOString(), userId)
        .run();
    return { ...base, canReadSales: false, evidence: aboutScope ? "probed" : "legacy-unknown" };
  } catch {
    /* An unreachable Etsy is not proof of a missing scope, so nothing is
       stored and the member is asked to connect rather than told they cannot. */
    return { ...base, canReadSales: false, evidence: "legacy-unknown" };
  }
}

/** Record what a completed authorisation actually granted. */
export async function rememberGrantedScopes(
  userId: string, shopId: number, scopes: string,
): Promise<void> {
  await ensureScopeColumn();
  await db()
    .prepare(
      `UPDATE etsy_connections SET scopes = ?, scopes_checked_at = ?
        WHERE user_id = ? AND shop_id = ?`)
    .bind(scopes, new Date().toISOString(), userId, shopId)
    .run();
}
