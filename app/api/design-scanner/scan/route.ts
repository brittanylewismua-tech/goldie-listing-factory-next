import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { env } from "cloudflare:workers";
import {
  ANALYSIS_MODEL, ANALYSIS_PROMPT, ANALYSIS_VERSION, parseAnalysis,
} from "@/app/reference-analysis";
import {
  UPLOAD_ANALYSIS_VERSION, constructionOnly, meetsThreshold, THRESHOLD,
  type UploadIntelligence,
} from "@/app/scan-record";
import { compare } from "@/app/design-compare";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
import { relevanceOf, relevanceNotice } from "@/app/design-niche-relevance";
import { acquireLease, releaseLease, LEASE_WAIT_MS, LEASE_POLL_MS } from "@/app/work-lease";
import { decodeTinyPng } from "@/app/artwork-fingerprint";
import { measureQuality, type ImageQuality } from "@/app/image-quality";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { evidenceLine } from "@/app/evidence-window";
import { isFresh } from "@/app/reference-images";
import { reserveSpend, settleSpend, failSpend, releaseSpend, memberUsage } from "@/app/spend-guard";
import { check, withRegister, type RegisterMatch } from "@/app/trademark-check";
import { lookup, normalize, registerSize } from "@/app/trademark-register";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { classify } from "@/app/reference-recovery";

/**
 * ONE SCAN.
 *
 * Upload once, analyse once, compare deterministically, and never look at a
 * reference's words. The shape of the call budget is:
 *
 *   the member's artwork  -> ONE paid vision call, cached forever by content
 *   every reference       -> already analysed, or analysed by the ingestion
 *                            job; never during a scan
 *   the comparison        -> no model at all
 *
 * So changing only the niche re-runs the comparison and costs nothing, and
 * re-uploading the same file costs nothing. The only thing that ever costs a
 * paid call is a design this member has not scanned before.
 *
 * INTERNAL BETA: owner only.
 */
export const maxDuration = 300;
const WORKLOAD = "designScannerVision";

type Stored = { payload: string };

export const POST = withErrorLog("design-scanner-scan", async (request: Request) => {
  /* The entitlement decides, not the owner flag: a complimentary beta
     member reaches this and a Listing Factory member does not. */
  const access = await requireFeatureApi("designScanner");
  if (!access.ok) return access.response;
  const user = access.user;

  const db = (env as unknown as { DB: D1Database }).DB;
  const body = await request.json().catch(() => null) as
    { artworkHash?: string; imageDataUrl?: string; niche?: string } | null;
  const artworkHash = String(body?.artworkHash ?? "").slice(0, 128);
  const niche = String(body?.niche ?? "").trim().slice(0, 80);
  if (!artworkHash || !niche)
    return NextResponse.json({ error: "A design and a niche are both needed." }, { status: 400 });

  await db.prepare(`CREATE TABLE IF NOT EXISTS scan_uploads (
    user_id TEXT NOT NULL, artwork_hash TEXT NOT NULL, version INTEGER NOT NULL,
    payload_json TEXT NOT NULL, provider_cost REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, artwork_hash, version))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS scan_history (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, artwork_hash TEXT NOT NULL,
    niche TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS scan_history_member ON scan_history (user_id, created_at DESC)`)
    .run();

  const now = Math.floor(Date.now() / 1000);
  const started = Date.now();
  let paidCalls = 0;
  let cost = 0;

  /* ---------------------------------------------- the member's own design */
  const held = await db.prepare(
    `SELECT payload_json AS payload FROM scan_uploads
      WHERE user_id = ? AND artwork_hash = ? AND version = ?`)
    .bind(user.userId, artworkHash, UPLOAD_ANALYSIS_VERSION)
    .first<Stored>();

  let upload: UploadIntelligence | null = held
    ? JSON.parse(held.payload) as UploadIntelligence : null;
  const warm = Boolean(upload);
  /* Held across the two blocks below: the request that wins the lease is the
     one that pays, and it must release it on every exit. */
  let leaseToken = "";

  if (!upload) {
    if (!body?.imageDataUrl)
      return NextResponse.json({ error: "Send the design the first time it is scanned." },
        { status: 400 });

    /*
      ONE ANALYSIS PER DESIGN, EVEN WHEN TWO UPLOADS ARRIVE AT ONCE.

      This carried a comment claiming the reservation `fingerprint` made two
      identical uploads "collapse into one provider job". It does not — the
      fingerprint is recorded, not enforced. Measured against production: two
      simultaneous uploads of one design made TWO paid vision calls and took
      TWO of the member's ten daily scans for a single design.

      A lease decides who pays. The other request waits for the winner's stored
      analysis and comes back warm; if the winner never lands, the waiter takes
      the lease itself rather than failing.
    */
    const leaseKey = `${user.userId}|${artworkHash}|${UPLOAD_ANALYSIS_VERSION}`;
    const lease = await acquireLease("design-scan", leaseKey);
    if (lease.held) leaseToken = lease.token;
    if (!lease.held) {
      const until = Date.now() + LEASE_WAIT_MS;
      while (Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, LEASE_POLL_MS));
        const landed = await db.prepare(
          `SELECT payload_json AS payload FROM scan_uploads
            WHERE user_id = ? AND artwork_hash = ? AND version = ?`)
          .bind(user.userId, artworkHash, UPLOAD_ANALYSIS_VERSION)
          .first<Stored>().catch(() => null);
        if (landed) { upload = JSON.parse(landed.payload) as UploadIntelligence; break; }
      }
      if (!upload)
        return NextResponse.json(
          { error: "This design is already being analyzed. Try again in a moment." },
          { status: 409 });
    }
  }

  if (!upload) {
    const leaseKey = `${user.userId}|${artworkHash}|${UPLOAD_ANALYSIS_VERSION}`;
    const done = async () => { if (leaseToken) await releaseLease("design-scan", leaseKey, leaseToken).catch(() => {}); };
    const reservation = await reserveSpend({ workloadKey: WORKLOAD, userId: user.userId,
      fingerprint: `${user.userId}:${artworkHash}` });
    if (!reservation.allowed) {
      await done();
      return NextResponse.json({ error: reservation.message, limited: true }, { status: 429 });
    }

    const key = process.env.FAL_KEY ?? "";
    if (!key) {
      await releaseSpend(reservation.id);
      await done();
      return NextResponse.json({ error: "Scanning is not available right now." }, { status: 503 });
    }

    let payload: { output?: string; usage?: { cost?: number };
      detail?: string; error?: { message?: string } };
    try {
      const response = await fetch("https://fal.run/openrouter/router/vision", {
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANALYSIS_MODEL, temperature: 0, max_tokens: 500,
          /* The reference schema plus the one field only the member's own
             design is allowed to carry, for their trademark check. */
          system_prompt: ANALYSIS_PROMPT.replace('"wordCount":0}',
            '"wordCount":0,"visibleWording":""}')
            + `\n\nvisibleWording: the exact text that appears in THIS design, as one string. `
            + `This field exists only so the uploader can run their own trademark check.`,
          prompt: "Describe how this design is constructed.",
          image_urls: [body.imageDataUrl],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      payload = await response.json() as typeof payload;
      paidCalls += 1;
      cost = Number(payload.usage?.cost ?? 0);
      if (!response.ok) {
        /* Billed or not, the member keeps their scan; the money still settles. */
        await failSpend(reservation.id, { billed: cost });
        return NextResponse.json(
          { error: "That scan did not complete. It has not been counted against your daily scans." },
          { status: 502 });
      }
    } catch {
      await failSpend(reservation.id, { billed: 0 });
      await done();
      return NextResponse.json(
        { error: "That scan did not complete. It has not been counted against your daily scans." },
        { status: 502 });
    }

    const parsed = parseAnalysis(String(payload.output ?? ""));
    if (!parsed.ok) {
      await failSpend(reservation.id, { billed: cost });
      await done();
      return NextResponse.json(
        { error: "That design could not be read. It has not been counted against your daily scans." },
        { status: 502 });
    }
    let wording = "";
    try {
      const raw = JSON.parse(String(payload.output ?? "").slice(
        String(payload.output ?? "").indexOf("{"),
        String(payload.output ?? "").lastIndexOf("}") + 1)) as Record<string, unknown>;
      wording = String(raw.visibleWording ?? "").slice(0, 200);
    } catch { /* No wording is a trademark check with nothing to check. */ }

    upload = { ...parsed.ingredients, visibleWording: wording };
    await db.prepare(
      `INSERT INTO scan_uploads (user_id, artwork_hash, version, payload_json, provider_cost, created_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(user_id, artwork_hash, version) DO NOTHING`)
      .bind(user.userId, artworkHash, UPLOAD_ANALYSIS_VERSION,
        JSON.stringify(upload), cost, now).run();
    await settleSpend(reservation.id, cost);
    /* Stored and paid for. The waiters can stop watching. */
    await done();
  }

  /* --------------------------------------------------------- the cohort */
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();
  const corpus = await db.prepare(
    `SELECT r.listing_id AS listingId, a.shop_id AS shopId, r.title AS title,
            r.tags AS tags, r.image_id AS imageId, r.image_url AS imageUrl,
            r.outcome AS outcome, r.retrieved_at AS retrievedAt,
            a.intervals AS intervals, a.firstSeen AS firstSeen, a.lastSeen AS lastSeen
       FROM reference_images r
       JOIN (SELECT listing_id, shop_id, COUNT(DISTINCT interval_id) AS intervals,
                    MIN(observed_at) AS firstSeen, MAX(observed_at) AS lastSeen
               FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?
              GROUP BY listing_id, shop_id) a
         ON a.listing_id = r.listing_id`)
    .bind(since)
    .all<{ listingId: number; shopId: number; title: string; tags: string;
      imageId: number | null; imageUrl: string; outcome: string; retrievedAt: number;
      intervals: number; firstSeen: string; lastSeen: string }>();

  const { terms } = normalizeNiche(niche);
  const rows = corpus.results ?? [];
  const candidates: Candidate[] = rows.map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    title: String(row.title ?? ""), tags: String(row.tags ?? "").split("|").filter(Boolean),
  }));
  const matched = new Set(intersect(candidates,
    new Set(candidates.map(row => row.listingId)), terms).members.map(m => m.listingId));
  let cohortRows = rows.filter(row => matched.has(Number(row.listingId)));

  /* ------------------------------------------------------------- refresh */
  /* Etsy requires displayed listing information to be no more than six hours
     old. Anything past that is re-read before it is allowed to back a claim,
     and anything that no longer qualifies leaves the cohort. */
  const staleIds = cohortRows
    .filter(row => !isFresh(Number(row.retrievedAt), now))
    .map(row => Number(row.listingId));
  let etsyCalls = 0;
  const dropped: Record<string, number> = { gone: 0, inactive: 0, imageChanged: 0 };
  if (staleIds.length) {
    for (let index = 0; index < staleIds.length; index += 100) {
      const slice = staleIds.slice(index, index + 100);
      await waitForEtsyCapacity();
      try {
        const response = await fetch(
          `https://openapi.etsy.com/v3/application/listings/batch`
          + `?listing_ids=${slice.join(",")}&includes=Images`,
          { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
        await recordEtsyCall(response, "search");
        etsyCalls += 1;
        if (!response.ok) continue;
        const fresh = await response.json() as { results?: Parameters<typeof classify>[0][] };
        const answered = new Map((fresh.results ?? []).map(listing => {
          const row = classify(listing);
          return [row.listingId, row];
        }));
        for (const listingId of slice) {
          const answer = answered.get(listingId);
          const existing = cohortRows.find(row => Number(row.listingId) === listingId);
          if (!existing) continue;
          if (!answer || answer.outcome !== "recovered") {
            existing.outcome = "gone";
            dropped[answer ? "inactive" : "gone"] += 1;
            continue;
          }
          /* A changed image is a different design; its stored analysis no
             longer describes what is selling, so it leaves rather than
             standing in for artwork nobody has looked at. */
          if (Number(answer.imageId) !== Number(existing.imageId)) {
            existing.outcome = "image-changed";
            dropped.imageChanged += 1;
            continue;
          }
          existing.retrievedAt = now;
          await db.prepare(
            `UPDATE reference_images SET retrieved_at = ?, image_url = ? WHERE listing_id = ?`)
            .bind(now, answer.imageUrl, listingId).run();
        }
      } catch { /* A refresh we could not complete drops those references. */ }
    }
  }
  cohortRows = cohortRows.filter(row => row.outcome === "recovered");

  /* Analyses we already hold. A scan never pays to analyse a reference. */
  const analysed = await db.prepare(
    `SELECT image_id AS imageId, payload_json AS payload FROM reference_analysis
      WHERE analysis_version = ?`).bind(ANALYSIS_VERSION)
    .all<{ imageId: number; payload: string }>().catch(() => ({ results: [] }));
  const byImage = new Map((analysed.results ?? [])
    .map(row => [Number(row.imageId), row.payload]));

  const usable = cohortRows.filter(row => byImage.has(Number(row.imageId)));

  /* ---------------------------------------------- the per-shop cap, after */
  /* Applied to the cohort as it finally stands, never to the candidate pool:
     capping a quarter of the candidates and then shrinking is how one shop
     ends up owning half the evidence. */
  const perShopTotals = new Map<number, number>();
  for (const row of usable) perShopTotals.set(Number(row.shopId),
    (perShopTotals.get(Number(row.shopId)) ?? 0) + 1);
  const sizeAt = (allowance: number) => [...perShopTotals.values()]
    .reduce((total, holdings) => total + Math.min(holdings, allowance), 0);
  let allowance = 1;
  for (let step = 1; step <= usable.length; step += 1) {
    if (step > sizeAt(step) * 0.25) break;
    allowance = step;
  }
  const perShop = new Map<number, number>();
  const cohort = usable.filter(row => {
    const shopId = Number(row.shopId);
    const holdings = perShop.get(shopId) ?? 0;
    if (holdings >= allowance) return false;
    perShop.set(shopId, holdings + 1);
    return true;
  });

  const shape = {
    listings: cohort.length,
    shops: perShop.size,
    repeatedMovement: cohort.filter(row => Number(row.intervals) >= 2).length,
    withUsableImage: cohort.length,
  };
  const gate = meetsThreshold(shape);

  /* ---------------------------------------------------- trademark, always */
  /* Separate from the design read, and run whether or not a comparison is
     possible: a phrase that could close a shop matters even when the niche
     has no evidence yet. */
  let trademark: unknown = null;
  const phrase = upload.visibleWording.trim();
  const verdict = check(phrase);
  try {
    const [size, hits] = await Promise.all([registerSize(db), lookup(db, phrase)]);
    const ready = size.marks > 0
      && !size.files.some(file => file.state === "waiting" || file.state === "partial");
    const normalized = normalize(phrase);
    const matches: RegisterMatch[] = hits.map(hit => ({
      mark: hit.mark, owner: hit.owner, registration: hit.registration,
      classes: hit.classes, registered: hit.registered,
      exact: normalize(hit.mark) === normalized,
    }));
    trademark = withRegister(verdict, matches, ready);
  } catch {
    /* An incomplete register is never reported as a clean search. */
    trademark = withRegister(verdict, [], false);
  }

  const usage = await memberUsage(user.userId, WORKLOAD);
  const base = {
    niche, warm, paidCalls, cost: Number(cost.toFixed(5)),
    etsyRefreshCalls: etsyCalls, droppedOnRefresh: dropped,
    scansLeftToday: usage.remaining,
    milliseconds: Date.now() - started,
    trademark,
  };

  if (!gate.ok)
    return NextResponse.json({ ...base, ok: false,
      overall: "Not enough verified evidence",
      refusal: gate.refusal, cohort: shape });

  /* ------------------------------------------------------ the comparison */
  /* Construction fields only, both sides. No model call. */
  const references = cohort.map(row =>
    JSON.parse(byImage.get(Number(row.imageId))!) as Record<string, unknown>);
  /*
    MEASURED PIXELS, NOT A MODEL'S OPINION, DECIDE WHAT MAY BE CLAIMED.

    A vision model told a member that a 7px-blurred design and a near-invisible
    grey-on-white design both "stay readable at thumbnail size" and had
    contrast matching the listings that are selling. Contrast, tonal range and
    blur are arithmetic; they were never a thing to ask a model about.

    A decode that fails yields `unverified`, which blocks the positive claim
    without inventing a negative one.
  */
  let measured: ImageQuality | undefined;
  if (body?.imageDataUrl) {
    try {
      const base64 = body.imageDataUrl.slice(body.imageDataUrl.indexOf(",") + 1);
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const decoded = await decodeTinyPng(bytes.buffer as ArrayBuffer);
      if (decoded.ok) {
        const { width, height, rgb } = decoded.image;
        const rgba = new Uint8Array(width * height * 4);
        for (let index = 0, source = 0; index < rgba.length; index += 4, source += 3) {
          rgba[index] = rgb[source]; rgba[index + 1] = rgb[source + 1];
          rgba[index + 2] = rgb[source + 2]; rgba[index + 3] = 255;
        }
        measured = measureQuality({ width, height, rgba });
      }
    } catch { /* unverified is the honest answer; it blocks the claim. */ }
  }

  const alignment = compare(
    constructionOnly(upload) as never,
    references as never,
    { minimum: THRESHOLD.listings, measured });

  let earliest = Infinity, latest = 0;
  for (const row of cohort) {
    earliest = Math.min(earliest, Date.parse(row.firstSeen) / 1000);
    latest = Math.max(latest, Date.parse(row.lastSeen) / 1000);
  }
  const line = evidenceLine({
    earliest, latest, seconds: Math.max(0, latest - earliest),
    repeatedMovement: shape.repeatedMovement, attributedUnits: 0,
    shops: shape.shops, withImage: shape.withUsableImage, withReview: 0,
    listings: shape.listings,
  });

  /*
    SUBJECT AND CONSTRUCTION ARE DIFFERENT QUESTIONS.

    Measured: "Vintage Tractor Parts Since 1947" scanned against bachelorette
    returned output identical to "Bride Squad Bachelorette Party" — same
    verdict, same scope, same supporting points. Both are built the same way,
    so the visual comparison was right; what was wrong was that a member reads
    "shares visual patterns with listings moving in this niche" as "this fits
    the niche", and nothing anywhere said otherwise.
  */
  const relevance = relevanceOf(String(upload?.visibleWording ?? ""), terms);
  const notice = relevanceNotice(relevance, niche);

  const id = crypto.randomUUID();
  const result = { ...base, ok: true,
    overall: alignment.overall, working: alignment.working,
    opportunity: alignment.opportunity,
    /* When the design is not about the niche, the re-scoping comes first and
       the construction sentence follows it. */
    scope: notice ? `${notice} ${alignment.scope}` : alignment.scope,
    subject: { verdict: relevance.verdict, matched: relevance.matched,
      because: relevance.because },
    /* Kept separate from niche relevance in the result model as well as in the
       wording: construction and subject are different questions. */
    imageQuality: measured
      ? { contrast: measured.contrast, sharpness: measured.sharpness,
          thumbnailReadable: measured.thumbnailReadable,
          notes: measured.notes }
      : { contrast: "unverified", sharpness: "unverified",
          thumbnailReadable: "unverified",
          notes: ["This design's readability could not be verified."] },
    evidence: line, scanId: id };
  await db.prepare(
    `INSERT INTO scan_history (id, user_id, artwork_hash, niche, result_json, created_at)
     VALUES (?,?,?,?,?,?)`)
    .bind(id, user.userId, artworkHash, niche, JSON.stringify(result), now).run();

  return NextResponse.json(result);
});

/** A member's own scan history. Reopening a saved result is free. */
export const GET = withErrorLog("design-scanner-history", async () => {
  /* The entitlement decides, not the owner flag: a complimentary beta
     member reaches this and a Listing Factory member does not. */
  const access = await requireFeatureApi("designScanner");
  if (!access.ok) return access.response;
  const user = access.user;
  const db = (env as unknown as { DB: D1Database }).DB;
  const rows = await db.prepare(
    `SELECT id, niche, result_json AS result, created_at AS createdAt, artwork_hash AS artworkHash
       FROM scan_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`)
    .bind(user.userId).all<{ id: string; niche: string; result: string;
      createdAt: number; artworkHash: string }>().catch(() => ({ results: [] }));
  const usage = await memberUsage(user.userId, WORKLOAD);
  return NextResponse.json({
    scansLeftToday: usage.remaining, dailyLimit: usage.limit,
    scans: (rows.results ?? []).map(row => ({
      id: row.id, niche: row.niche, artworkHash: row.artworkHash,
      createdAt: row.createdAt, result: JSON.parse(row.result) as unknown,
    })),
  });
});
