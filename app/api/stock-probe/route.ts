import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import {
  etsyApiCredential,
  recordEtsyCall,
  waitForEtsyCapacity,
} from "@/app/api/etsy/client";

/**
 * IS THE STOCK NUMBER A REAL SALES SIGNAL, OR IS IT DECORATION?
 *
 * "Sold Overnight" rests on one assumption: that an Etsy listing's `quantity`
 * falls when somebody buys, and stays fallen. If that holds, the difference
 * between last night's number and this morning's IS the number of units sold —
 * counted, not inferred, not a proxy for sales dressed up as one.
 *
 * The assumption is not safe. Print-on-demand shops mostly run through
 * Printify, which pushes stock levels INTO Etsy, and if it re-asserts a fixed
 * quantity on a schedule then every decrement is wiped before we could read it
 * and the whole feature is worthless. Nobody can answer that from the API
 * reference. It has to be watched.
 *
 * So this endpoint answers three questions with evidence, before a line of the
 * feature gets built on top of them:
 *
 *   1. Does the API even return `quantity` and `taxonomy_id` on a public
 *      listing read? The field list is dumped raw rather than assumed.
 *   2. Do stock numbers look ALIVE? A shelf Printify resets shows the same
 *      round numbers over and over — 999, 999, 100, 999. A shelf that really
 *      decrements shows scatter — 247, 863, 91. That is readable from a
 *      single call, with no waiting at all.
 *   3. Do they actually MOVE? Run it twice with a gap and the diff says so.
 *
 * Deliberately owner-only and deliberately temporary. It writes to its own
 * table, touches nothing the app depends on, and costs about a dozen Etsy
 * calls per run against a daily allowance of eighty thousand.
 */

/* Enough of the catalogue to be representative, few enough to stay cheap.
   Six searches plus six hydrations is twelve calls a run. */
const SAMPLE_QUERIES = ["t shirt", "sweatshirt", "mug", "tote bag", "sticker", "hat"];

const PER_QUERY = 100;

type SearchRow = { listing_id?: number };
type BatchRow = {
  listing_id?: number;
  title?: string;
  quantity?: number;
  taxonomy_id?: number;
  num_favorers?: number;
  state?: string;
};

const db = () => runtime().DB!;

async function ensure() {
  await db()
    .prepare(
      `CREATE TABLE IF NOT EXISTS stock_probe (
         listing_id INTEGER PRIMARY KEY,
         quantity   INTEGER,
         favorites  INTEGER,
         taxonomy_id INTEGER,
         title      TEXT,
         seen_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    )
    .run();
}

/** Etsy's search, for listing ids only. */
async function searchIds(keywords: string): Promise<number[]> {
  await waitForEtsyCapacity();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(keywords)}&limit=${PER_QUERY}`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20000) },
  );
  await recordEtsyCall(response, "qa");
  if (!response.ok) return [];
  const payload = (await response.json()) as { results?: SearchRow[] };
  return (payload.results ?? []).map((row) => Number(row.listing_id)).filter(Number.isSafeInteger);
}

/** The read that matters: stock, category and saves, 100 listings per call. */
async function readListings(ids: number[]) {
  await waitForEtsyCapacity();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${ids.join(",")}`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20000) },
  );
  await recordEtsyCall(response, "qa");
  if (!response.ok)
    return { rows: [] as BatchRow[], sample: null as unknown, keys: [] as string[] };
  const payload = (await response.json()) as { results?: BatchRow[] };
  const rows = payload.results ?? [];
  return {
    rows,
    /* The raw first row, so the field list is observed rather than believed. */
    sample: rows[0] ?? null,
    keys: rows[0] ? Object.keys(rows[0]).sort() : [],
  };
}

export const GET = withErrorLog("stock-probe", async (_request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensure();

  /* ---- collect ---- */
  const ids: number[] = [];
  for (const query of SAMPLE_QUERIES) ids.push(...(await searchIds(query)));
  const unique = Array.from(new Set(ids));
  if (!unique.length)
    return NextResponse.json({ error: "Etsy returned no listings." }, { status: 502 });

  const rows: BatchRow[] = [];
  let fieldSample: unknown = null;
  let fieldKeys: string[] = [];
  for (let at = 0; at < unique.length; at += 100) {
    const read = await readListings(unique.slice(at, at + 100));
    rows.push(...read.rows);
    if (!fieldKeys.length && read.keys.length) {
      fieldKeys = read.keys;
      fieldSample = read.sample;
    }
  }

  /* ---- question 1: are the fields even there? ---- */
  const withQuantity = rows.filter((r) => Number.isFinite(Number(r.quantity))).length;
  const withTaxonomy = rows.filter((r) => Number.isFinite(Number(r.taxonomy_id))).length;

  /* ---- question 2: does the shelf look alive or reset? ---- */
  const counts = new Map<number, number>();
  for (const row of rows) {
    const q = Number(row.quantity);
    if (!Number.isFinite(q)) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  const commonest = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([quantity, listings]) => ({ quantity, listings }));
  /*
    THE TELL. A quantity nobody would type on purpose — not round, not a
    default — can only have got there by being counted down. The share of the
    shelf sitting on such numbers is the single most informative figure here,
    available immediately, with no second run.
  */
  const roundish = (q: number) => q % 100 === 0 || q % 50 === 0 || q === 999 || q === 99 || q <= 3;
  const scattered = rows.filter((r) => {
    const q = Number(r.quantity);
    return Number.isFinite(q) && q > 0 && !roundish(q);
  }).length;

  /* ---- question 3: did anything move since last run? ---- */
  type Prior = { listing_id: number; quantity: number; favorites: number; seen_at: string };
  const before = await db()
    .prepare("SELECT listing_id,quantity,favorites,seen_at FROM stock_probe")
    .all();
  const priors = (before.results ?? []) as unknown as Prior[];
  const previous = new Map<number, Prior>(priors.map((r) => [Number(r.listing_id), r]));

  const fell: { listingId: number; from: number; to: number; sold: number; title: string }[] = [];
  const rose: number[] = [];
  let compared = 0;
  let oldestSeen: string | null = null;

  for (const row of rows) {
    const id = Number(row.listing_id);
    const now = Number(row.quantity);
    const was = previous.get(id);
    if (!was || !Number.isFinite(now) || !Number.isFinite(Number(was.quantity))) continue;
    compared++;
    if (!oldestSeen || was.seen_at < oldestSeen) oldestSeen = was.seen_at;
    const delta = Number(was.quantity) - now;
    if (delta > 0)
      fell.push({
        listingId: id,
        from: Number(was.quantity),
        to: now,
        sold: delta,
        title: String(row.title ?? "").slice(0, 80),
      });
    else if (delta < 0) rose.push(id);
  }

  /* ---- store this reading for the next run to diff against ---- */
  const writes = rows
    .filter((r) => Number.isSafeInteger(Number(r.listing_id)))
    .map((r) =>
      db()
        .prepare(
          `INSERT INTO stock_probe (listing_id,quantity,favorites,taxonomy_id,title,seen_at)
           VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(listing_id) DO UPDATE SET
             quantity=excluded.quantity, favorites=excluded.favorites,
             taxonomy_id=excluded.taxonomy_id, title=excluded.title,
             seen_at=CURRENT_TIMESTAMP`,
        )
        .bind(
          Number(r.listing_id),
          Number.isFinite(Number(r.quantity)) ? Number(r.quantity) : null,
          Number(r.num_favorers) || 0,
          Number.isFinite(Number(r.taxonomy_id)) ? Number(r.taxonomy_id) : null,
          String(r.title ?? "").slice(0, 200),
        ),
    );
  for (let at = 0; at < writes.length; at += 50) await db().batch(writes.slice(at, at + 50));

  return NextResponse.json({
    readAt: new Date().toISOString(),
    etsyCalls: SAMPLE_QUERIES.length + Math.ceil(unique.length / 100),
    listingsRead: rows.length,

    fieldsPresent: {
      quantity: `${withQuantity} of ${rows.length}`,
      taxonomy_id: `${withTaxonomy} of ${rows.length}`,
      allFieldsOnOneListing: fieldKeys,
    },

    shelfLooksAlive: {
      distinctStockValues: counts.size,
      onScatteredNumbers: `${scattered} of ${rows.length}`,
      commonestStockValues: commonest,
    },

    movedSinceLastRun:
      compared === 0
        ? "Nothing to compare yet — this is the first reading. Run it again in half an hour."
        : {
            listingsComparedAgainst: compared,
            earliestPreviousReading: oldestSeen,
            wentDown: fell.length,
            wentUp: rose.length,
            unitsSold: fell.reduce((sum, f) => sum + f.sold, 0),
            examples: fell.sort((a, b) => b.sold - a.sold).slice(0, 20),
          },

    oneRawListing: fieldSample,
  });
});
