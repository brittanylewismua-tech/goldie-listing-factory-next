import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { normalizeNiche, relates, type Candidate as Shape } from "@/app/niche-cohort";
import { GROWTH } from "@/app/niche-candidates";
import { invariants, type Stage } from "@/app/discovery-counts";
import {
  addCandidates, recordDiscoveryRun, dueForDiscovery, candidateSummary, corpusSize,
} from "@/app/niche-candidate-store";

/**
 * DISCOVERY: WHAT TO START WATCHING.
 *
 * Etsy active search, used for the only thing it is good for. Nothing it
 * returns is displayed to a member as evidence — a candidate has to be
 * baselined and then observed to move by the sensor and the poller before it
 * appears anywhere.
 *
 * Bounded and scheduled: three pages per niche, at most once a day per niche,
 * shared across every member watching it.
 */
export const maxDuration = 300;
const PAGE = 100;

type EtsyRow = { listing_id?: number; shop_id?: number; title?: string;
  tags?: string[]; state?: string };

export const POST = withErrorLog("market-discover", async (request: Request) => {
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const db = (env as unknown as { DB: D1Database }).DB;
  const url = new URL(request.url);
  const single = (url.searchParams.get("q") ?? "").trim();
  const force = url.searchParams.get("force") === "1";
  /*
    A forced run is an operator action, not production load. It is recorded so
    the observation gate can exclude its backlog spike rather than failing a
    healthy system because somebody pressed a button.
  */
  if (force) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS admin_actions (
      at INTEGER PRIMARY KEY, what TEXT NOT NULL)`).run().catch(() => {});
    await db.prepare(`INSERT INTO admin_actions (at, what) VALUES (?, 'forced-discovery')
      ON CONFLICT(at) DO NOTHING`)
      .bind(Math.floor(Date.now() / 1000)).run().catch(() => {});
  }
  const now = Math.floor(Date.now() / 1000);

  /* Every distinct saved niche, once — not once per member watching it. */
  const saved = single
    ? [{ key: "", phrase: single, terms: [] as string[], watchers: 1 }]
    : (await db.prepare(
        `SELECT niche_key AS key, MAX(phrase) AS phrase, COUNT(*) AS watchers
           FROM niche_watches WHERE paused = 0 GROUP BY niche_key`)
        .all<{ key: string; phrase: string; watchers: number }>()
        .catch(() => ({ results: [] as Array<{ key: string; phrase: string; watchers: number }> })))
        .results ?? [];

  const size = await corpusSize();
  const report: unknown[] = [];
  let totalCalls = 0;
  let totalAdded = 0;

  for (const niche of saved) {
    const { query, terms } = normalizeNiche(niche.phrase);
    const key = niche.key || [...terms].sort().join("+");
    if (!terms.length) { report.push({ phrase: niche.phrase, skipped: "no usable terms" }); continue; }

    if (!force && !(await dueForDiscovery(key, now))) {
      report.push({ phrase: niche.phrase, key, skipped: "searched recently",
        candidates: await candidateSummary(key) });
      continue;
    }
    /* The corpus ceiling is checked before Etsy is asked anything, so hitting
       it costs nothing. */
    if (size.monitored + totalAdded >= GROWTH.maxActiveMonitored) {
      report.push({ phrase: niche.phrase, key, skipped: "monitored corpus is at its ceiling" });
      continue;
    }

    const found: Array<{ listingId: number; shopId: number; page: number; state: string }> = [];
    const rejected: Record<string, number> = {};
    let examined = 0;
    let calls = 0;

    for (let page = 0; page < GROWTH.searchPagesPerNiche; page += 1) {
      await waitForEtsyCapacity();
      let response: Response;
      try {
        const search = new URLSearchParams({
          keywords: query, limit: String(PAGE), offset: String(page * PAGE),
          sort_on: "score", sort_order: "desc",
        });
        response = await fetch(
          `https://openapi.etsy.com/v3/application/listings/active?${search}`,
          { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
      } catch { break; }
      await recordEtsyCall(response, "search");
      calls += 1;
      if (!response.ok) break;
      const body = await response.json() as { results?: EtsyRow[] };
      const rows = body.results ?? [];
      for (const row of rows) {
        if (!row.listing_id) continue;
        examined += 1;
        const shape: Shape = {
          listingId: Number(row.listing_id), shopId: Number(row.shop_id ?? 0),
          title: String(row.title ?? ""), tags: (row.tags ?? []).map(String),
        };
        /*
          THE SAME MATCHER THE COHORT USES.

          Every meaningful term must be present, service listings and add-ons
          are refused, and the reasoning is kept internally rather than shown.
          A long phrase cannot become broader than its own words.
        */
        const verdict = relates(shape, terms);
        if (!verdict.ok) {
          rejected[verdict.because] = (rejected[verdict.because] ?? 0) + 1;
          continue;
        }
        found.push({ listingId: shape.listingId, shopId: shape.shopId, page,
          state: String(row.state ?? "active") });
      }
      if (rows.length < PAGE) break;
    }

    const outcome = await addCandidates(key, niche.phrase, query, found, now, niche.watchers);
    await recordDiscoveryRun(key, query, found.length, outcome.added, calls, now);
    totalCalls += calls;
    totalAdded += outcome.added;

    const summary = await candidateSummary(key);
    /*
      EVERY STAGE, SEPARATELY NAMED.

      Examined, accepted, selected after the cap, inserted — each with its own
      shop count taken from its own set. Mixing two of them is what produced
      "200 listings across 211 shops".
    */
    const stage: Stage = {
      examined,
      accepted: found.length,
      acceptedShops: new Set(found.map(row => row.shopId)).size,
      selected: outcome.selected,
      selectedShops: outcome.selectedShops,
      inserted: outcome.added,
      insertedShops: outcome.insertedShops,
      awaitingBaseline: summary.byState["awaiting-baseline"] ?? 0,
      monitoring: summary.byState.monitoring ?? 0,
      withEvidence: (summary.byState.momentum ?? 0)
        + (summary.byState["repeated-momentum"] ?? 0),
    };
    const broken = invariants(stage, summary.shops);

    report.push({
      phrase: niche.phrase, key, watchers: niche.watchers,
      stage,
      /* What the member is told, from the monitored set alone. */
      monitored: { watching: summary.watching, shops: summary.shops },
      alreadyInPoller: outcome.alreadyKnown,
      /* Stated rather than silently producing a zero-insert run. */
      atNicheCap: outcome.atCap,
      rejected: Object.entries(rejected).map(([because, n]) => ({ because, n }))
        .sort((a, b) => b.n - a.n),
      etsyCalls: calls,
      /* Reported beside the numbers rather than hidden behind a 500. */
      invariantViolations: broken,
    });
  }

  return NextResponse.json({
    niches: report.length, totalEtsyCalls: totalCalls, totalAdded,
    corpus: await corpusSize(),
    /* What this costs to keep doing, per niche, per day. */
    recurringCallsPerNichePerDay: GROWTH.searchPagesPerNiche,
    report,
  });
});
