import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";
import { reserveSpend, settleSpend, failSpend } from "@/app/spend-guard";
import { costOf } from "@/app/vision-extraction";
import { recordVisionCall } from "@/app/vision-telemetry";
import {
  CLASSIFIER_MODEL, BATCH_SIZE, MAX_CALLS_PER_BUILD, MEMBER_DAILY_DOLLARS,
  CANONICAL_PROMPT, ASSIGN_PROMPT, compact, parseCanonical, parseAssignments,
  estimateCost, type ListingInput,
} from "@/app/niche-classifier";

/**
 * THE CLASSIFIER BUILD.
 *
 * Reservation first, then the canonical list, then assignment against it.
 * Nothing reaches the provider until the spend guard has agreed the whole
 * build fits — a run that stops halfway through because it crossed a ceiling
 * leaves a shop with half a vocabulary, which is worse than not starting.
 *
 * TEXT ONLY. No image is sent, and there is no per-listing call.
 */
export const POST = withErrorLog("shop-map-classify", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const key = (env as unknown as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY ?? "";
  if (!key)
    return NextResponse.json({ error: "No provider key is configured.", spent: 0 },
      { status: 503 });

  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);
  const now = Math.floor(Date.now() / 1_000);

  await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_classifications (
    user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, listing_id INTEGER NOT NULL,
    primary_niche TEXT NOT NULL DEFAULT '', secondary_niche TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '', built_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, shop_id, listing_id))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_niche_list (
    user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, niches_json TEXT NOT NULL,
    built_at INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id))`).run();

  /* ---------------------------------------------------- what needs classifying */
  const listingRows = await db.prepare(
    `SELECT listing_id, title, tags, shop_section FROM shop_map_listings
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; title: string; tags: string; shop_section: string }>();
  const all: ListingInput[] = (listingRows.results ?? []).map(row => ({
    listingId: Number(row.listing_id), title: String(row.title ?? ""),
    tags: (() => { try { return JSON.parse(row.tags || "[]") as string[]; } catch { return []; } })(),
    shopSection: String(row.shop_section ?? ""), wording: "",
  }));

  const hashOf = (listing: ListingInput) =>
    `${listing.title}|${listing.tags.join(",")}|${listing.shopSection}`;
  const held = await db.prepare(
    `SELECT listing_id, content_hash FROM shop_map_classifications
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).all<{ listing_id: number; content_hash: string }>();
  const cached = new Map((held.results ?? []).map(row =>
    [Number(row.listing_id), String(row.content_hash)]));

  /* An unchanged listing is never reclassified. */
  const changed = all.filter(listing => cached.get(listing.listingId) !== hashOf(listing));
  if (!changed.length)
    return NextResponse.json({ ok: true, changed: 0, spent: 0,
      note: "Every listing is already classified against its current content." });

  const estimate = estimateCost(changed.length);
  if (estimate.dollars > MEMBER_DAILY_DOLLARS)
    return NextResponse.json({ error: `A build of ${changed.length} listings is `
      + `estimated at $${estimate.dollars}, over the $${MEMBER_DAILY_DOLLARS} member limit.` },
      { status: 400 });

  const reservation = await reserveSpend({ workloadKey: "nicheClassifier",
    userId: user.userId, fingerprint: `${shopId}:${changed.length}` });
  if (!reservation.allowed)
    return NextResponse.json({ error: reservation.message, reason: reservation.reason },
      { status: 429 });

  let calls = 0;
  let billed = 0;
  const ask = async (prompt: string, body: string, maxTokens: number) => {
    if (calls >= MAX_CALLS_PER_BUILD) throw new Error("call budget exhausted");
    calls += 1;
    const began = Date.now();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key,
        "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLASSIFIER_MODEL, max_tokens: maxTokens,
        system: prompt, messages: [{ role: "user", content: body }] }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await response.json() as {
      content?: Array<{ text?: string }>; usage?: Record<string, number>; error?: { message?: string } };
    const usage = payload.usage ?? {};
    billed += costOf(usage);
    await recordVisionCall({ userId: user.userId, purpose: "classify",
      model: CLASSIFIER_MODEL, usage, milliseconds: Date.now() - began,
      attempts: 1, validJson: response.ok, failure: payload.error?.message ?? "" });
    if (!response.ok) throw new Error(payload.error?.message ?? `provider ${response.status}`);
    return String(payload.content?.[0]?.text ?? "");
  };

  try {
    /* Step 1 — the vocabulary, decided once for the whole shop. */
    const canonicalText = await ask(CANONICAL_PROMPT,
      all.map(compact).join("\n").slice(0, 60_000), 1_000);
    let canonical = parseCanonical(canonicalText);
    if (!canonical.ok) {
      /* The one explicit retry the policy allows. */
      const second = await ask(CANONICAL_PROMPT + "\nReturn ONLY the JSON object.",
        all.map(compact).join("\n").slice(0, 60_000), 1_000);
      canonical = parseCanonical(second);
    }
    if (!canonical.ok) {
      await failSpend(reservation.id, { billed });
      return NextResponse.json({ error: `Canonical list unusable: ${canonical.why}`,
        calls, spent: Number(billed.toFixed(5)) }, { status: 502 });
    }

    await db.prepare(
      `INSERT INTO shop_map_niche_list (user_id, shop_id, niches_json, built_at)
       VALUES (?,?,?,?)
       ON CONFLICT(user_id, shop_id) DO UPDATE SET
         niches_json = excluded.niches_json, built_at = excluded.built_at`)
      .bind(user.userId, shopId, JSON.stringify(canonical.niches), now).run();

    /* Step 2 — assignment, against that fixed list only. */
    const byId = new Map(changed.map(listing => [listing.listingId, listing]));
    let stored = 0;
    const refused: Array<{ listingId: number; because: string }> = [];
    for (let at = 0; at < changed.length; at += BATCH_SIZE) {
      if (calls >= MAX_CALLS_PER_BUILD) break;
      const batch = changed.slice(at, at + BATCH_SIZE);
      const text = await ask(ASSIGN_PROMPT(canonical.niches),
        batch.map(compact).join("\n"), 8_000);
      const { assigned, rejected } = parseAssignments(text, canonical.niches, byId);
      refused.push(...rejected);
      for (const row of assigned) {
        const listing = byId.get(row.listingId);
        if (!listing) continue;
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
            row.confidence, row.evidence, hashOf(listing), now).run();
        stored += 1;
      }
    }

    await settleSpend(reservation.id, billed);
    return NextResponse.json({
      ok: true, calls, spent: Number(billed.toFixed(5)),
      estimated: estimate.dollars,
      canonicalNiches: canonical.niches,
      rejectedLabels: canonical.rejected,
      listingsConsidered: changed.length, assigned: stored,
      unassigned: changed.length - stored,
      refusedAssignments: refused.slice(0, 20),
    });
  } catch (error) {
    /* A billed failure still pays the ledger; the member keeps their build. */
    await failSpend(reservation.id, { billed });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "classification failed",
      calls, spent: Number(billed.toFixed(5)),
    }, { status: 502 });
  }
});
