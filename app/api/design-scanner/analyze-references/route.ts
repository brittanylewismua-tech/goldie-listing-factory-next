import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import {
  ANALYSIS_MODEL, ANALYSIS_PROMPT, ANALYSIS_VERSION, parseAnalysis,
  REFERENCE_DAILY_IMAGES, REFERENCE_DAILY_DOLLARS,
} from "@/app/reference-analysis";
import { referenceIngestionMayRun } from "@/app/spend-guard";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { isFresh } from "@/app/reference-images";

/**
 * ANALYSE REFERENCE IMAGES, INSIDE THE BUDGET THAT WAS ALREADY APPROVED.
 *
 * 100 images a day, $0.25 a day, one analysis per image identity per analysis
 * version, and a hard stop rather than an overspend. No pairwise call ever:
 * each image is looked at once, on its own, and comparison happens afterwards
 * in deterministic code that has no model in it.
 *
 * Images are fetched at analysis time and not kept. What persists is the
 * structured result.
 */
export const maxDuration = 300;

type Row = {
  listingId: number; imageId: number | null; imageUrl: string;
  retrievedAt: number; title: string; tags: string;
};

export const POST = withErrorLog("design-scanner-analyze-references", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const url = new URL(request.url);
  const phrase = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.max(1, Math.min(REFERENCE_DAILY_IMAGES,
    Number(url.searchParams.get("limit")) || 25));

  await db.prepare(`CREATE TABLE IF NOT EXISTS reference_analysis (
    image_id INTEGER NOT NULL,
    analysis_version INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL,
    provider_cost REAL NOT NULL DEFAULT 0,
    analyzed_at INTEGER NOT NULL,
    PRIMARY KEY (image_id, analysis_version))`).run();

  /* The shared guard, not a local counter: reference ingestion must never
     compete with customer scans for the same daily ceiling. */
  const allowed = await referenceIngestionMayRun();
  if (!allowed.allowed)
    return NextResponse.json({ error: allowed.because, analysed: 0 }, { status: 429 });

  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  const corpus = await db.prepare(
    `SELECT r.listing_id AS listingId, r.image_id AS imageId, r.image_url AS imageUrl,
            r.retrieved_at AS retrievedAt, r.title AS title, r.tags AS tags,
            a.shop_id AS shopId
       FROM reference_images r
       JOIN (SELECT DISTINCT listing_id, shop_id FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?) a
         ON a.listing_id = r.listing_id
      WHERE r.outcome = 'recovered' AND r.image_url <> '' AND r.image_id IS NOT NULL`)
    .bind(since)
    .all<Row & { shopId: number }>();

  let pool = corpus.results ?? [];
  /* Restricted to one niche cohort when asked, so a measurement run spends the
     budget on images a comparison will actually use. */
  if (phrase) {
    const { terms } = normalizeNiche(phrase);
    const candidates: Candidate[] = pool.map(row => ({
      listingId: Number(row.listingId), shopId: Number(row.shopId),
      title: String(row.title ?? ""), tags: String(row.tags ?? "").split("|").filter(Boolean),
    }));
    const keep = new Set(intersect(candidates, new Set(candidates.map(c => c.listingId)), terms)
      .members.map(member => member.listingId));
    pool = pool.filter(row => keep.has(Number(row.listingId)));
  }

  const done = await db.prepare(
    `SELECT image_id AS imageId FROM reference_analysis WHERE analysis_version = ?`)
    .bind(ANALYSIS_VERSION).all<{ imageId: number }>();
  const analysed = new Set((done.results ?? []).map(row => Number(row.imageId)));

  /* An image already analysed at this version is never analysed again, for
     any member, and a stale URL is refreshed before it is fetched rather than
     used past Etsy's six-hour rule. */
  const todo = pool.filter(row => !analysed.has(Number(row.imageId)));
  const stale = todo.filter(row => !isFresh(Number(row.retrievedAt), now)).length;
  const runnable = todo.filter(row => isFresh(Number(row.retrievedAt), now)).slice(0, limit);

  const key = process.env.FAL_KEY ?? "";
  if (!key) return NextResponse.json({ error: "FAL_KEY is not configured." }, { status: 500 });

  let spent = 0;
  let stored = 0;
  const failures: string[] = [];

  for (const row of runnable) {
    if (spent >= REFERENCE_DAILY_DOLLARS) {
      failures.push("stopped at the daily reference ceiling");
      break;
    }
    let payload: { output?: string; usage?: { cost?: number };
      detail?: string; error?: { message?: string } };
    try {
      const response = await fetch("https://fal.run/openrouter/router/vision", {
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANALYSIS_MODEL, temperature: 0, max_tokens: 400,
          system_prompt: ANALYSIS_PROMPT,
          prompt: "Describe how this design is constructed.",
          image_urls: [row.imageUrl],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      payload = await response.json() as typeof payload;
      if (!response.ok) {
        failures.push(payload.error?.message ?? payload.detail ?? `provider ${response.status}`);
        spent += Number(payload.usage?.cost ?? 0);
        continue;
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "call failed");
      continue;
    }
    spent += Number(payload.usage?.cost ?? 0);
    const parsed = parseAnalysis(String(payload.output ?? ""));
    if (!parsed.ok) { failures.push(parsed.why); continue; }
    await db.prepare(
      `INSERT INTO reference_analysis
         (image_id, analysis_version, listing_id, model, payload_json, provider_cost, analyzed_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(image_id, analysis_version) DO NOTHING`)
      .bind(Number(row.imageId), ANALYSIS_VERSION, Number(row.listingId), ANALYSIS_MODEL,
        JSON.stringify(parsed.ingredients), Number(payload.usage?.cost ?? 0), now)
      .run();
    stored += 1;
  }

  return NextResponse.json({
    niche: phrase || null,
    poolConsidered: pool.length,
    alreadyAnalysed: pool.length - todo.length,
    staleUrlsSkipped: stale,
    attempted: runnable.length,
    stored,
    measuredCost: Number(spent.toFixed(5)),
    costPerImage: stored ? Number((spent / stored).toFixed(5)) : null,
    dailyCeiling: REFERENCE_DAILY_DOLLARS,
    failures: failures.slice(0, 5),
    analysisVersion: ANALYSIS_VERSION,
  });
});

/**
 * What is actually stored, so the no-content guarantee can be inspected rather
 * than trusted. Counts and category distributions only.
 */
export const GET = withErrorLog("design-scanner-analysis-read", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const rows = await db.prepare(
    `SELECT payload_json AS payload, provider_cost AS cost FROM reference_analysis
      WHERE analysis_version = ?`)
    .bind(ANALYSIS_VERSION).all<{ payload: string; cost: number }>()
    .catch(() => ({ results: [] as Array<{ payload: string; cost: number }> }));

  const spread = new Map<string, Map<string, number>>();
  let cost = 0;
  let longest = 0;
  for (const row of rows.results ?? []) {
    cost += Number(row.cost) || 0;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(row.payload) as Record<string, unknown>; } catch { continue; }
    for (const [field, value] of Object.entries(parsed)) {
      if (typeof value === "string") longest = Math.max(longest, value.length);
      const bucket = spread.get(field) ?? new Map<string, number>();
      const key = typeof value === "number" ? "(number)" : String(value);
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
      spread.set(field, bucket);
    }
  }
  return NextResponse.json({
    analyses: (rows.results ?? []).length,
    measuredCost: Number(cost.toFixed(5)),
    /* If any stored value were a phrase rather than a category, it would show
       up here as a long string and as a distribution with no repeats. */
    longestStoredValue: longest,
    distribution: [...spread.entries()].map(([field, values]) => ({
      field, distinct: values.size,
      values: [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    })),
  });
});
