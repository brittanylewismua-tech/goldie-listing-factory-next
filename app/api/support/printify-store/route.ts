import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

/**
 * WHICH PRINTIFY STORE DID THIS MEMBER'S DRAFTS GO INTO?
 *
 * A member reported "Product not found - this listing isn't available in the
 * selected store" on every draft she built, and said she had only connected
 * one store. Printify creates an unconnected store for most accounts on its
 * own, so "only connected one" and "only has one" are different facts, and
 * guessing between them is how a support thread goes in circles.
 *
 * This answers it from the data: every Printify store on the account, and the
 * store id each draft was actually built into.
 *
 * OWNER ONLY, AND OPERATIONAL DATA ONLY. Store names and ids, draft counts
 * and product ids. No buyer information, no artwork, no titles, no personal
 * detail about the member beyond the account being looked up.
 */
export const GET = withErrorLog("support-printify-store", async (request: Request) => {
  const caller = await getChatGPTUser();
  if (!caller || !isOwner(caller))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Pass ?email= the member's sign-in email." },
    { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  /*
    The member's own build diagnostics carry both their email and the store
    each build went into, which is exactly the pairing this question needs.
    mastermind_access and billing_customers are fallbacks.
  */
  const lookups = [
    `SELECT user_id FROM printify_diagnostics WHERE LOWER(user_email) = ? ORDER BY rowid DESC LIMIT 1`,
    `SELECT user_id FROM mastermind_access WHERE LOWER(email) = ? LIMIT 1`,
    `SELECT user_id FROM billing_customers WHERE LOWER(email) = ? LIMIT 1`,
  ];
  let userId = "";
  for (const sql of lookups) {
    if (userId) break;
    const row = await db.prepare(sql).bind(email).first<{ user_id: string }>().catch(() => null);
    userId = row?.user_id ?? "";
  }

  if (!userId)
    return NextResponse.json({ found: false,
      note: "No account found for that email. Check the address they sign in with." });

  /* Which stores does Printify actually report for this account? */
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(userId).first<{ encrypted_token: string }>();
  let stores: Array<{ id: number; title: string; salesChannel: string }> = [];
  let storeError = "";
  if (stored) {
    try {
      const token = await decryptPrintifyToken(
        stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);
      const response = await fetch("https://api.printify.com/v1/shops.json",
        { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
          signal: AbortSignal.timeout(20_000) });
      if (response.ok) {
        const rows = await response.json() as Array<Record<string, unknown>>;
        stores = rows.map(row => ({ id: Number(row.id ?? 0), title: String(row.title ?? ""),
          salesChannel: String(row.sales_channel ?? "") }));
      } else storeError = `Printify answered ${response.status}`;
    } catch (error) {
      storeError = error instanceof Error ? error.message : "could not read Printify";
    }
  }

  /* Which store did each draft actually get built into? */
  const drafts = await db.prepare(
    `SELECT response_json FROM printify_draft_results
      WHERE user_id = ? AND status = 'succeeded' ORDER BY rowid DESC LIMIT 200`)
    .bind(userId).all<{ response_json: string }>().catch(() => ({ results: [] }));

  const byStore = new Map<number, number>();
  const productIds: string[] = [];
  for (const row of (drafts.results ?? []) as Array<{ response_json: string }>) {
    try {
      const draft = JSON.parse(row.response_json) as { shopId?: number; id?: string };
      const shopId = Number(draft.shopId ?? 0);
      if (!shopId) continue;
      byStore.set(shopId, (byStore.get(shopId) ?? 0) + 1);
      if (draft.id && productIds.length < 5) productIds.push(String(draft.id));
    } catch { /* an unreadable row is not evidence */ }
  }

  const draftStores = [...byStore.entries()].map(([id, drafts]) => ({
    storeId: id, drafts,
    storeName: stores.find(store => store.id === id)?.title
      ?? "(not in the account's current store list)",
    stillOnAccount: stores.some(store => store.id === id),
  }));

  /* What her builds recorded at the time, store by store. */
  const diagnosed = await db.prepare(
    `SELECT shop_id, COUNT(*) AS builds, MAX(outcome) AS lastOutcome
       FROM printify_diagnostics WHERE user_id = ? AND shop_id IS NOT NULL
      GROUP BY shop_id`)
    .bind(userId).all<{ shop_id: number; builds: number; lastOutcome: string }>()
    .catch(() => ({ results: [] }));

  return NextResponse.json({
    found: true,
    buildsByStore: ((diagnosed.results ?? []) as Array<{ shop_id: number; builds: number }>)
      .map(row => ({ storeId: Number(row.shop_id), builds: Number(row.builds),
        storeName: stores.find(store => store.id === Number(row.shop_id))?.title
          ?? "(not in the account's current store list)" })),
    printifyConnected: Boolean(stored),
    storesOnAccount: stores,
    storeCount: stores.length,
    storeError,
    draftsBuiltInto: draftStores,
    sampleProductIds: productIds,
    /* The whole question, answered in one line. */
    verdict: draftStores.length === 0
      ? "No completed drafts recorded for this account."
      : draftStores.some(store => !store.stillOnAccount)
        ? "Drafts were built into a store that is no longer on the Printify account."
        : stores.length > 1
          ? `This account has ${stores.length} Printify stores. The drafts are in `
            + `"${draftStores[0].storeName}" - that is the store to select in Printify.`
          : "One store on the account, and the drafts are in it. The store is not the cause.",
    reminder: "Operational data only. No buyer information and no personal detail.",
  });
});
