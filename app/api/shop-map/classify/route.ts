import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";
import { reserveSpend, settleSpend, failSpend } from "@/app/spend-guard";
import { recordVisionCall } from "@/app/vision-telemetry";
import {
  CLASSIFIER_MODEL, BATCH_SIZE, MAX_CALLS_PER_BUILD, MEMBER_DAILY_DOLLARS,
  CONSERVATIVE_RESERVATION,
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
/** Read what the last build produced. Free, and never calls a provider. */
export const GET = withErrorLog("shop-map-classify-read", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);

  const list = await db.prepare(
    `SELECT niches_json, built_at FROM shop_map_niche_list WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).first<{ niches_json: string; built_at: number }>()
    .catch(() => null);
  const rows = await db.prepare(
    `SELECT primary_niche, secondary_niche, confidence, COUNT(*) AS n
       FROM shop_map_classifications WHERE user_id = ? AND shop_id = ?
      GROUP BY primary_niche, secondary_niche, confidence`)
    .bind(user.userId, shopId)
    .all<{ primary_niche: string; secondary_niche: string; confidence: string; n: number }>()
    .catch(() => ({ results: [] }));
  const byNiche = new Map<string, number>();
  let secondaries = 0;
  for (const row of ((rows.results ?? []) as Array<Record<string, unknown>>)) {
    const primary = String(row.primary_niche ?? "");
    byNiche.set(primary, (byNiche.get(primary) ?? 0) + Number(row.n));
    if (String(row.secondary_niche ?? "")) secondaries += Number(row.n);
  }
  return NextResponse.json({
    canonicalNiches: (() => {
      try { return JSON.parse(list?.niches_json ?? "[]") as string[]; } catch { return []; }
    })(),
    builtAt: list?.built_at ?? null,
    primaryCounts: [...byNiche.entries()].map(([niche, listings]) => ({ niche, listings }))
      .sort((a, b) => b.listings - a.listings),
    secondaryAssignments: secondaries,
  });
});

export const POST = withErrorLog("shop-map-classify", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  /*
    THE PROVIDER ALREADY IN THE APPLICATION.

    FAL_KEY is configured and metered; ANTHROPIC_API_KEY is not, and waiting
    for one would have blocked the feature on a credential nobody was going
    to add. The Anthropic adapter stays in the codebase, disabled, so it can
    be switched on later without rebuilding any of this.
  */
  const key = process.env.FAL_KEY ?? "";
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

  /* The whole ceiling is held until Gemini's real cost is known. */
  const reservation = await reserveSpend({ workloadKey: "nicheClassifier",
    userId: user.userId, fingerprint: `${shopId}:${changed.length}:${CONSERVATIVE_RESERVATION}` });
  if (!reservation.allowed)
    return NextResponse.json({ error: reservation.message, reason: reservation.reason },
      { status: 429 });

  let calls = 0;
  let billed = 0;
  const ask = async (prompt: string, body: string, maxTokens: number) => {
    if (calls >= MAX_CALLS_PER_BUILD) throw new Error("call budget exhausted");
    calls += 1;
    const began = Date.now();
    /*
      The same endpoint Listing Factory already uses, with no image_urls.
      Text-only is simply the absence of that field, so no new pathway and
      no new credential are involved.
    */
    const response = await fetch("https://fal.run/openrouter/router/vision", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL, temperature: 0, max_tokens: maxTokens,
        system_prompt: prompt, prompt: body,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await response.json() as {
      output?: string; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      detail?: string; error?: { message?: string } };
    const usage = payload.usage ?? {};
    /* fal reports the charge directly; there is no token arithmetic to do. */
    billed += Number(usage.cost ?? 0);
    await recordVisionCall({ userId: user.userId, purpose: "classify",
      model: CLASSIFIER_MODEL,
      usage: { input_tokens: Number(usage.prompt_tokens ?? 0),
        output_tokens: Number(usage.completion_tokens ?? 0) },
      milliseconds: Date.now() - began, attempts: 1, validJson: response.ok,
      failure: payload.error?.message ?? payload.detail ?? "" });
    if (!response.ok)
      throw new Error(payload.error?.message ?? payload.detail ?? `provider ${response.status}`);
    return String(payload.output ?? "");
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

    /*
      NO PARTIAL VOCABULARY.

      The niche list is written only once assignment has actually produced
      something. A vocabulary stored beside a failed assignment would leave
      the shop with category names and no listings in them, which reads as a
      map that lost its contents rather than a build that did not finish.
    */
    if (!stored) {
      await failSpend(reservation.id, { billed });
      return NextResponse.json({
        error: "No listing could be assigned, so no niche list was stored.",
        calls, spent: Number(billed.toFixed(5)),
        canonicalProposed: canonical.niches,
        refusedAssignments: refused.slice(0, 20),
      }, { status: 502 });
    }

    await db.prepare(
      `INSERT INTO shop_map_niche_list (user_id, shop_id, niches_json, built_at)
       VALUES (?,?,?,?)
       ON CONFLICT(user_id, shop_id) DO UPDATE SET
         niches_json = excluded.niches_json, built_at = excluded.built_at`)
      .bind(user.userId, shopId, JSON.stringify(canonical.niches), now).run();

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
