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

  const parameters = new URL(request.url).searchParams;
  const email = (parameters.get("email") ?? "").trim().toLowerCase();
  /*
    Support arrives with a name, not a sign-in address. A partial search over
    the addresses already recorded against builds finds the account without
    anyone having to know how the member signs in.
  */
  const search = (parameters.get("q") ?? "").trim().toLowerCase();
  if (!email && !search)
    return NextResponse.json({ error: "Pass ?email= or ?q= a name fragment." }, { status: 400 });

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
  let matchedEmail = email;
  if (email)
    for (const sql of lookups) {
      if (userId) break;
      const row = await db.prepare(sql).bind(email).first<{ user_id: string }>().catch(() => null);
      userId = row?.user_id ?? "";
    }

  /* Searching by name returns the candidates rather than picking one: two
     members could share a first name, and acting on the wrong account is
     worse than asking which. */
  if (!userId && search) {
    const candidates = await db.prepare(
      `SELECT DISTINCT user_id, user_email FROM printify_diagnostics
        WHERE LOWER(user_email) LIKE ? ORDER BY rowid DESC LIMIT 10`)
      .bind(`%${search}%`).all<{ user_id: string; user_email: string }>()
      .catch(() => ({ results: [] }));
    const rows = (candidates.results ?? []) as Array<{ user_id: string; user_email: string }>;
    if (rows.length === 1) { userId = rows[0].user_id; matchedEmail = rows[0].user_email; }
    else if (rows.length > 1)
      return NextResponse.json({ found: false, matches: rows.map(row => row.user_email),
        note: "More than one account matches. Re-run with ?email= one of these." });
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
    account: matchedEmail,
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
