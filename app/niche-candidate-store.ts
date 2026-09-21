import { env } from "cloudflare:workers";
import { GROWTH, priorityFor, type CandidateState } from "@/app/niche-candidates";

/**
 * THE SHARED CANDIDATE POOL.
 *
 * Keyed by niche and listing, not by member. A member's watch points at a
 * niche key; the candidates under that key are shared, so twenty members
 * watching "dog mom" cost one discovery and one set of rows.
 *
 * Append-only where it matters: `discovered_at` and the qualifying history are
 * never rewritten, so a candidate that is demoted and later rediscovered comes
 * back with its past intact rather than as a new listing.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureCandidateTables() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS niche_candidates (
    niche_key TEXT NOT NULL,
    listing_id INTEGER NOT NULL,
    shop_id INTEGER NOT NULL DEFAULT 0,
    original_phrase TEXT NOT NULL DEFAULT '',
    discovery_query TEXT NOT NULL DEFAULT '',
    discovered_at INTEGER NOT NULL,
    search_page INTEGER NOT NULL DEFAULT 0,
    listing_state TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'discovered',
    baselined_at INTEGER,
    last_polled_at INTEGER,
    priority INTEGER NOT NULL DEFAULT 0,
    last_qualifying_at INTEGER,
    last_availability_check INTEGER,
    removed_reason TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'USD',
    favorites INTEGER,
    views INTEGER,
    original_created INTEGER,
    display_refreshed_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (niche_key, listing_id))`).run();
  /* Existing production tables need the display fields too. Discovery used
     to throw away the listing title, photo and current Etsy stats, which is
     why a tracked keyword could open into an empty text-only page. */
  for (const column of [
    "title TEXT NOT NULL DEFAULT ''",
    "image_url TEXT NOT NULL DEFAULT ''",
    "price_cents INTEGER",
    "currency TEXT NOT NULL DEFAULT 'USD'",
    "favorites INTEGER",
    "views INTEGER",
    "original_created INTEGER",
    "display_refreshed_at INTEGER NOT NULL DEFAULT 0",
  ]) await db().prepare(`ALTER TABLE niche_candidates ADD COLUMN ${column}`).run()
    .catch((error: unknown) => {
      if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
    });
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS niche_candidates_state
       ON niche_candidates (state, priority DESC)`).run();
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS niche_candidates_listing
       ON niche_candidates (listing_id)`).run();
  /* When each niche was last searched, so discovery runs on a schedule rather
     than on every page open. */
  await db().prepare(`CREATE TABLE IF NOT EXISTS niche_discovery_runs (
    niche_key TEXT PRIMARY KEY,
    last_run_at INTEGER NOT NULL DEFAULT 0,
    last_query TEXT NOT NULL DEFAULT '',
    candidates_found INTEGER NOT NULL DEFAULT 0,
    candidates_added INTEGER NOT NULL DEFAULT 0,
    etsy_calls INTEGER NOT NULL DEFAULT 0)`).run();
}

export const dueForDiscovery = async (nicheKey: string, now: number) => {
  await ensureCandidateTables();
  const row = await db().prepare(
    `SELECT last_run_at AS at FROM niche_discovery_runs WHERE niche_key = ?`)
    .bind(nicheKey).first<{ at: number }>().catch(() => null);
  return !row || now - Number(row.at) > GROWTH.refreshDiscoveryEveryHours * 3_600;
};

export async function addCandidates(
  nicheKey: string, phrase: string, query: string,
  found: Array<{ listingId: number; shopId: number; page: number; state: string;
    title?: string; imageUrl?: string; priceCents?: number | null; currency?: string;
    favorites?: number | null; views?: number | null; originalCreated?: number | null;
    displayRefreshedAt?: number }>,
  now: number, watchers: number,
) {
  await ensureCandidateTables();
  if (!found.length)
    return { added: 0, alreadyKnown: 0, selected: 0, selectedShops: 0,
      insertedShops: 0, atCap: false };

  /* How many of these Goldie already polls, so the report can separate new
     monitoring cost from reuse. */
  const ids = found.map(row => row.listingId);
  const known = new Set<number>();
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    const marks = slice.map(() => "?").join(",");
    const rows = await db().prepare(
      `SELECT listing_id AS listingId FROM corpus_poll_state WHERE listing_id IN (${marks})`)
      .bind(...slice).all<{ listingId: number }>()
      .catch(() => ({ results: [] as Array<{ listingId: number }> }));
    for (const row of rows.results ?? []) known.add(Number(row.listingId));
  }

  /*
    D1665 · THE CAP IS COMPUTED HERE, BECAUSE THE GUARD BELOW READS IT.

    `if (!selected.length)` sat above `const selected`, so every call that
    reached it threw a ReferenceError — a temporal dead zone, on a path
    taken whenever a discovery run returns listings. The cap was added to
    this function later than the guard and its declaration was placed with
    the code that uses it rather than with the code that tests it.

    Found by a new tsc check for TS2448 on its first run, alongside the one
    in the trademark ingest that had been swallowing real errors for days.
    `npm run build` compiles both without complaint.
  */
  const held = await db().prepare(
    `SELECT COUNT(*) AS n FROM niche_candidates
      WHERE niche_key = ? AND state IN
            ('discovered','awaiting-baseline','monitoring','momentum','repeated-momentum')`)
    .bind(nicheKey).first<{ n: number }>().catch(() => null);
  const room = Math.max(0, GROWTH.maxCandidatesPerNiche - Number(held?.n ?? 0));
  // Refresh existing active candidates even when the pool is full. Only a new
  // candidate or a reactivation consumes capacity.
  const existingRows = await db().prepare(
    `SELECT listing_id AS listingId, state FROM niche_candidates WHERE niche_key = ?`)
    .bind(nicheKey).all<{ listingId: number; state: string }>();
  const active = new Set((existingRows.results ?? []).filter(row =>
    ["discovered", "awaiting-baseline", "monitoring", "momentum", "repeated-momentum"].includes(row.state))
    .map(row => Number(row.listingId)));
  let available = room;
  const seen = new Set<number>();
  const selected = found.filter(row => {
    if (seen.has(row.listingId)) return false;
    seen.add(row.listingId);
    if (active.has(row.listingId)) return true;
    if (available <= 0) return false;
    available -= 1;
    return true;
  });
  if (!selected.length)
    return { added: 0, alreadyKnown: known.size, selected: 0, selectedShops: 0,
      insertedShops: 0, atCap: true };

  const insert = db().prepare(
    `INSERT INTO niche_candidates
       (niche_key, listing_id, shop_id, original_phrase, discovery_query,
        discovered_at, search_page, listing_state, state, priority,
        last_availability_check, title, image_url, price_cents, currency,
        favorites, views, original_created, display_refreshed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(niche_key, listing_id) DO UPDATE SET
       listing_state = excluded.listing_state,
       last_availability_check = excluded.last_availability_check,
       priority = excluded.priority,
       title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE niche_candidates.title END,
       image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url ELSE niche_candidates.image_url END,
       price_cents = COALESCE(excluded.price_cents, niche_candidates.price_cents),
       currency = CASE WHEN excluded.currency <> '' THEN excluded.currency ELSE niche_candidates.currency END,
       favorites = COALESCE(excluded.favorites, niche_candidates.favorites),
       views = COALESCE(excluded.views, niche_candidates.views),
       original_created = COALESCE(excluded.original_created, niche_candidates.original_created),
       display_refreshed_at = MAX(niche_candidates.display_refreshed_at,
                                  excluded.display_refreshed_at),
       /* REDISCOVERY REVIVES, IT DOES NOT RESET. A candidate that was demoted
          for lack of movement and has been found again is worth watching
          once more, and its discovery date stays the first one. */
       state = CASE WHEN niche_candidates.state IN ('expired','inactive')
                    THEN 'awaiting-baseline' ELSE niche_candidates.state END,
       removed_reason = CASE WHEN niche_candidates.state IN ('expired','inactive')
                    THEN '' ELSE niche_candidates.removed_reason END`);

  /*
    THE CAP BOUNDS THE POOL, NOT THE BATCH.

    It used to slice each run to 200, which meant a second discovery run added
    200 more on top — measured: bachelorette reached 259 candidates, halloween
    359 and teacher 353, all against a "maximum 200 per niche". A cap that only
    limits one batch is not a cap, and corpus growth is the thing this whole
    lifecycle exists to bound.

    It is also applied here, where the selected set is returned, so the caller
    reports shop counts from the set that was actually kept — the mix-up that
    described a 200-listing pool as spanning 211 shops.
  */
  const statements = selected.map(row =>
    insert.bind(nicheKey, row.listingId, row.shopId, phrase, query, now, row.page,
      row.state,
      /* Something already polled needs no baseline pass of its own. */
      known.has(row.listingId) ? "monitoring" : "awaiting-baseline",
      priorityFor({ watchers, hasPriorEvidence: known.has(row.listingId), repeated: false }),
      now, row.title ?? "", row.imageUrl ?? "", row.priceCents ?? null,
      row.currency ?? "USD", row.favorites ?? null, row.views ?? null,
      row.originalCreated ?? null, row.displayRefreshedAt ?? now));

  let added = 0;
  for (let index = 0; index < statements.length; index += 25) {
    const results = await db().batch(statements.slice(index, index + 25));
    for (const result of results) added += Number(result.meta?.changes ?? 0);
  }

  /*
    `added` counts rows the upsert changed, which includes a revived candidate.
    The inserted SHOP count is taken from the selected set, because that is the
    set those rows came from — never from `found`.
  */
  return {
    added,
    alreadyKnown: known.size,
    selected: selected.length,
    selectedShops: new Set(selected.map(row => row.shopId)).size,
    insertedShops: new Set(selected.map(row => row.shopId)).size,
    atCap: room === 0,
  };
}

/** Whether opening a tracked keyword needs one current Etsy refresh before it
 * can show real listing cards. This is an internal gate, never a user-facing
 * count. */
export async function needsCandidateDisplay(nicheKey: string, now: number) {
  await ensureCandidateTables();
  const row = await db().prepare(
    `SELECT COUNT(*) AS n FROM niche_candidates
      WHERE niche_key = ? AND title <> '' AND image_url <> ''
        AND display_refreshed_at >= ?`)
    .bind(nicheKey, now - 5 * 3_600)
    .first<{ n: number }>().catch(() => null);
  return Number(row?.n ?? 0) < 6;
}

export async function recordDiscoveryRun(
  nicheKey: string, query: string, found: number, added: number,
  calls: number, now: number,
) {
  await ensureCandidateTables();
  await db().prepare(
    `INSERT INTO niche_discovery_runs
       (niche_key, last_run_at, last_query, candidates_found, candidates_added, etsy_calls)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(niche_key) DO UPDATE SET
       last_run_at = excluded.last_run_at, last_query = excluded.last_query,
       candidates_found = excluded.candidates_found,
       candidates_added = excluded.candidates_added,
       etsy_calls = niche_discovery_runs.etsy_calls + excluded.etsy_calls`)
    .bind(nicheKey, now, query, found, added, calls).run();
}

/** Counts by state for one niche — what the member-facing page needs. */
export async function candidateSummary(nicheKey: string) {
  await ensureCandidateTables();
  const rows = await db().prepare(
    `SELECT state, COUNT(*) AS n FROM niche_candidates
      WHERE niche_key = ? GROUP BY state`)
    .bind(nicheKey).all<{ state: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ state: string; n: number }> }));
  const byState: Record<string, number> = {};
  for (const row of rows.results ?? []) byState[row.state] = Number(row.n) || 0;

  /*
    THE SHOP COUNT IS OF THE MONITORED SET, NOT THE LARGEST STATE.

    Taking a max across per-state counts produced a number belonging to no
    single set — the arithmetic bug this whole file now guards against. This
    counts distinct shops among exactly the candidates being watched.
  */
  const watchedStates = ["awaiting-baseline", "monitoring", "momentum", "repeated-momentum"];
  const marks = watchedStates.map(() => "?").join(",");
  const shopRow = await db().prepare(
    `SELECT COUNT(DISTINCT shop_id) AS shops, COUNT(*) AS listings
       FROM niche_candidates WHERE niche_key = ? AND state IN (${marks})`)
    .bind(nicheKey, ...watchedStates)
    .first<{ shops: number; listings: number }>().catch(() => null);

  const total = Object.values(byState).reduce((sum, value) => sum + value, 0);
  return {
    byState, total,
    shops: Number(shopRow?.shops ?? 0),
    watching: Number(shopRow?.listings ?? 0),
  };
}

/** Promote a candidate once real movement has been observed for it. */
export async function markQualified(
  listingId: number, repeated: boolean, now: number,
) {
  await ensureCandidateTables();
  await db().prepare(
    `UPDATE niche_candidates
        SET state = ?, last_qualifying_at = ?, priority = priority + ?
      WHERE listing_id = ? AND state IN ('awaiting-baseline','monitoring','momentum')`)
    .bind(repeated ? "repeated-momentum" : "momentum", now, repeated ? 100 : 50, listingId)
    .run();
}

export async function corpusSize() {
  await ensureCandidateTables();
  const row = await db().prepare(
    `SELECT COUNT(*) AS monitored FROM corpus_poll_state`)
    .first<{ monitored: number }>().catch(() => null);
  const candidates = await db().prepare(
    `SELECT state, COUNT(*) AS n FROM niche_candidates GROUP BY state`)
    .all<{ state: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ state: string; n: number }> }));
  const byState: Record<string, number> = {};
  for (const row_ of candidates.results ?? []) byState[row_.state] = Number(row_.n) || 0;
  return { monitored: Number(row?.monitored ?? 0), candidatesByState: byState };
}

export const STATES: CandidateState[] = ["discovered", "awaiting-baseline",
  "monitoring", "momentum", "repeated-momentum", "inactive", "unavailable",
  "expired", "historical"];
