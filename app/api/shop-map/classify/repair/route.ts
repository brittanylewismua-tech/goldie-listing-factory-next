import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";
import { reserveSpend, settleSpend, failSpend, memberUsage } from "@/app/spend-guard";
import { recordVisionCall } from "@/app/vision-telemetry";
import {
  CLASSIFIER_MODEL, BATCH_SIZE, MEMBER_DAILY_DOLLARS, ASSIGN_PROMPT,
  compact, parseCanonical, parseAssignments, estimateCost, collapseFacets,
  type ListingInput,
} from "@/app/niche-classifier";

/**
 * THE REPAIR PASS.
 *
 * The first build assigned 161 of 293 listings and every missing one was
 * recorded as "model omitted the listing" — a response-coverage failure, not
 * a taxonomy one. The repeated wording inside the unclassified set is
 * "feminist shirt", "girl power", "anti trump": niches the canonical list
 * ALREADY contains.
 *
 * So this does not rebuild the vocabulary. It asks only what is genuinely
 * missing, then assigns the listings that were skipped, and merges once at
 * the end. A repair that half-succeeds would leave the map in a third state
 * that is neither the old build nor the new one.
 *
 * IT DOES NOT CONSUME THE MEMBER'S DAILY BUILD. It spends only what is left
 * of today's dollars, and the counters are read, never reset.
 */
const MAX_REPAIR_CALLS = 3;

export const POST = withErrorLog("shop-map-classify-repair", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const key = process.env.FAL_KEY ?? "";
  if (!key) return NextResponse.json({ error: "No provider key." }, { status: 503 });

  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);
  const now = Math.floor(Date.now() / 1_000);

  /* What the first build decided. Preserved exactly. */
  const listRow = await db.prepare(
    `SELECT niches_json FROM shop_map_niche_list WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).first<{ niches_json: string }>();
  let canonical: string[] = [];
  try { canonical = JSON.parse(listRow?.niches_json ?? "[]") as string[]; } catch { /* empty */ }
  if (!canonical.length)
    return NextResponse.json({ error: "No canonical list to repair against." }, { status: 400 });

  const listingRows = await db.prepare(
    `SELECT l.listing_id, l.title, l.tags, l.shop_section
       FROM shop_map_listings l
       LEFT JOIN shop_map_classifications c
         ON c.user_id = l.user_id AND c.shop_id = l.shop_id AND c.listing_id = l.listing_id
      WHERE l.user_id = ? AND l.shop_id = ?
        AND (c.primary_niche IS NULL OR c.primary_niche = '')`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; title: string; tags: string; shop_section: string }>();
  const missing: ListingInput[] = (listingRows.results ?? []).map(row => ({
    listingId: Number(row.listing_id), title: String(row.title ?? ""),
    tags: (() => { try { return JSON.parse(row.tags || "[]") as string[]; } catch { return []; } })(),
    shopSection: String(row.shop_section ?? ""), wording: "",
  }));
  if (!missing.length)
    return NextResponse.json({ ok: true, repaired: 0, note: "Nothing is unclassified." });

  /*
    Only what today's ceiling has left. The counters are read, not reset, and
    the build allowance is untouched because this is not a new build.
  */
  const usage = await memberUsage(user.userId, "nicheClassifier");
  const spentToday = await db.prepare(
    `SELECT COALESCE(SUM(COALESCE(actual_cost, reserved_cost)), 0) AS spend
       FROM spend_reservations
      WHERE user_id = ? AND workload = 'nicheClassifier'
        AND state IN ('held','settled','failed-billed')
        AND created_at >= datetime('now', '-1 day')`)
    .bind(user.userId).first<{ spend: number }>();
  const remaining = MEMBER_DAILY_DOLLARS - Number(spentToday?.spend ?? 0);
  const estimate = estimateCost(missing.length);
  if (estimate.dollars > remaining)
    return NextResponse.json({
      error: `A repair of ${missing.length} listings is estimated at `
        + `$${estimate.dollars}, and only $${remaining.toFixed(4)} of today's `
        + `$${MEMBER_DAILY_DOLLARS} remains. It will fit after the rolling allowance resets.`,
      remaining: Number(remaining.toFixed(4)), estimated: estimate.dollars,
      resetsAt: usage.oldestLeavesWindowAt,
    }, { status: 429 });

  /* Reserved against the dollar ledger only. No build is consumed. */
  const reservation = await reserveSpend({ workloadKey: "nicheClassifier",
    userId: user.userId, consumesAllowance: false,
    fingerprint: `repair:${shopId}:${missing.length}` });
  if (!reservation.allowed)
    return NextResponse.json({ error: reservation.message, reason: reservation.reason },
      { status: 429 });

  let calls = 0;
  let billed = 0;
  const ask = async (prompt: string, body: string, maxTokens: number) => {
    if (calls >= MAX_REPAIR_CALLS) throw new Error("repair call budget exhausted");
    calls += 1;
    const began = Date.now();
    const response = await fetch("https://fal.run/openrouter/router/vision", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: CLASSIFIER_MODEL, temperature: 0,
        max_tokens: maxTokens, system_prompt: prompt, prompt: body }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await response.json() as {
      output?: string; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      detail?: string; error?: { message?: string } };
    billed += Number(payload.usage?.cost ?? 0);
    await recordVisionCall({ userId: user.userId, purpose: "classify-repair",
      model: CLASSIFIER_MODEL,
      usage: { input_tokens: Number(payload.usage?.prompt_tokens ?? 0),
        output_tokens: Number(payload.usage?.completion_tokens ?? 0) },
      milliseconds: Date.now() - began, attempts: 1, validJson: response.ok,
      failure: payload.error?.message ?? payload.detail ?? "" });
    if (!response.ok)
      throw new Error(payload.error?.message ?? payload.detail ?? `provider ${response.status}`);
    return String(payload.output ?? "");
  };

  try {
    /* 1 — only what is genuinely missing from the existing vocabulary. */
    const repairPrompt =
      "These listings could not be placed in the shop's existing niche list:\n"
      + canonical.map(niche => `- ${niche}`).join("\n")
      + "\n\nReturn JSON {\"niches\":[\"...\"]} containing ONLY niches that are genuinely "
      + "missing from that list and are needed for these listings. Return an empty array if "
      + "the existing list already covers them.\n"
      + "Never return a product or garment type, gendered garment grouping, generic gift "
      + "language, an incomplete fragment, a synonym of an existing niche, one subject split "
      + "by design format, or one split by who it is for.";
    const extraText = await ask(repairPrompt,
      missing.map(compact).join("\n").slice(0, 40_000), 600);
    const extra = parseCanonical(extraText);
    const proposed = extra.ok ? extra.niches : [];
    const merged = [...new Set([...canonical, ...proposed])];

    /* 2 — assign the skipped listings against the combined list. */
    const byId = new Map(missing.map(listing => [listing.listingId, listing]));
    const staged: Array<{ listingId: number; primary: string; secondary: string;
      confidence: string; evidence: string; hash: string }> = [];
    const refused: Array<{ listingId: number; because: string }> = [];
    for (let at = 0; at < missing.length; at += BATCH_SIZE) {
      if (calls >= MAX_REPAIR_CALLS) break;
      const batch = missing.slice(at, at + BATCH_SIZE);
      const text = await ask(ASSIGN_PROMPT(merged), batch.map(compact).join("\n"), 8_000);
      const result = parseAssignments(text, merged, byId);
      refused.push(...result.rejected);
      for (const row of result.assigned) {
        const listing = byId.get(row.listingId);
        if (!listing) continue;
        staged.push({ ...row,
          hash: `${listing.title}|${listing.tags.join(",")}|${listing.shopSection}` });
      }
    }

    if (!staged.length) {
      await failSpend(reservation.id, { billed });
      return NextResponse.json({ error: "The repair assigned nothing; no change was made.",
        calls, spent: Number(billed.toFixed(5)), refused: refused.slice(0, 20) }, { status: 502 });
    }

    /*
      MERGED ONCE, AFTER EVERYTHING SUCCEEDED.

      A repair that writes as it goes leaves the map in a third state that is
      neither the old build nor the new one, and nobody could tell which
      listings came from which pass.
    */
    for (const row of staged)
      await db.prepare(
        `INSERT INTO shop_map_classifications
           (user_id, shop_id, listing_id, primary_niche, secondary_niche,
            confidence, evidence, content_hash, built_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, shop_id, listing_id) DO UPDATE SET
           primary_niche = excluded.primary_niche,
           secondary_niche = excluded.secondary_niche,
           confidence = excluded.confidence, evidence = excluded.evidence,
           content_hash = excluded.content_hash, built_at = excluded.built_at`)
        .bind(user.userId, shopId, row.listingId, row.primary, row.secondary,
          row.confidence, row.evidence, row.hash, now).run();

    /* The repair's own vocabulary is stored beside the original, not over it. */
    await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_niche_repairs (
      user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, added_json TEXT NOT NULL,
      built_at INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id, built_at))`).run();
    await db.prepare(
      `INSERT INTO shop_map_niche_repairs (user_id, shop_id, added_json, built_at)
       VALUES (?,?,?,?)`)
      .bind(user.userId, shopId, JSON.stringify(proposed), now).run();

    const counts = new Map<string, number>();
    for (const row of staged) counts.set(row.primary, (counts.get(row.primary) ?? 0) + 1);
    const collapse = collapseFacets(merged, counts);

    await db.prepare(
      `INSERT INTO shop_map_niche_list (user_id, shop_id, niches_json, built_at)
       VALUES (?,?,?,?)
       ON CONFLICT(user_id, shop_id) DO UPDATE SET
         niches_json = excluded.niches_json, built_at = excluded.built_at`)
      .bind(user.userId, shopId, JSON.stringify(merged), now).run();

    await settleSpend(reservation.id, billed);
    return NextResponse.json({
      ok: true, calls, spent: Number(billed.toFixed(5)),
      estimated: estimate.dollars, remainingBefore: Number(remaining.toFixed(4)),
      nichesAdded: proposed, canonicalNow: merged,
      collapseSuggestions: collapse.merged,
      considered: missing.length, repaired: staged.length,
      stillUnclassified: missing.length - staged.length,
      refused: refused.slice(0, 20),
      /* The build allowance is untouched: this was not a new build. */
      buildsUsedToday: usage.used, buildLimit: usage.limit,
    });
  } catch (error) {
    await failSpend(reservation.id, { billed });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "repair failed",
      calls, spent: Number(billed.toFixed(5)),
    }, { status: 502 });
  }
});
