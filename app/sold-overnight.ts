import { env } from "cloudflare:workers";
import type { EtsyFeature } from "@/app/api/etsy/client";
import { movement } from "@/app/sold-overnight-math";
import {
  etsyApiCredential,
  etsyBudget,
  recordEtsyCall,
  waitForEtsyCapacity,
} from "@/app/api/etsy/client";

/**
 * SOLD OVERNIGHT — WHAT ACTUALLY LEFT THE SHELF WHILE THEY SLEPT.
 *
 * Every other "what's working on Etsy" feature is a proxy. Etsy's API cannot
 * sort by sales, publishes no sales count, and its search ranking blends
 * keyword match with a deliberate boost for new listings — so position is not
 * popularity, and saves are interest rather than money. Building a board on
 * any of those means printing a guess in the typeface of a fact.
 *
 * There is one number Etsy hands over that is not a proxy. Every listing
 * carries `quantity`: how many are left to buy. When somebody buys one, it
 * goes down. Read it last night, read it this morning, and the difference is
 * the count of items that sold. Not modelled. Not inferred. Counted.
 *
 * THIS WAS TESTED BEFORE IT WAS BUILT, because the last feature on this page
 * was not, and it cost a night. The risk was that Printify — which pushes
 * stock levels into Etsy for most print-on-demand shops — re-asserts a fixed
 * quantity on a schedule and wipes every decrement before it can be read. So a
 * throwaway probe watched 396 live listings for five and a half minutes:
 *
 *     Custom Sisters Mug                   295 -> 294
 *     Embroidered Mother Of The Bride Bag  904 -> 903
 *     Pumpkin Trick or Treat Pattern       487 -> 486
 *
 * Three fell by exactly one. None rose. And across 1,183 listings the stock
 * numbers scatter — 865 of them sit on values nobody would type on purpose,
 * with 999 appearing 93 times, 998 fourteen times and 997 seventeen. That is
 * one shelf photographed at three stages of selling down. Printify is not
 * resetting anything.
 *
 * WHY THIS SCALES WHERE A SEARCH DOES NOT. The cost is a corpus, not a query.
 * Reading a hundred listings takes one API call, so a hundred thousand watched
 * listings costs a thousand calls a night — and it is the SAME thousand
 * whether five sellers read the board or five thousand, because everybody
 * reads the same board. A per-seller search costs thirty calls per seller per
 * look and collapses the moment the product has users.
 */

type Runtime = { DB: D1Database };
const db = () => (env as unknown as Runtime).DB;

/**
 * The night is dated in UTC, everywhere, on both the writing and the reading
 * side. Mixing a UTC timestamp with a local calendar date is the exact bug
 * that once generated fourteen hundred phantom drop days in this codebase.
 */
export const nightOf = (at: Date = new Date()) => at.toISOString().slice(0, 10);

/**
 * The shelves. Etsy's own taxonomy is what finally labels a listing, but the
 * corpus has to be found before it can be labelled, and search needs words.
 */
const SEED_QUERIES = [
  "t shirt", "sweatshirt", "hoodie", "tank top", "mug", "tote bag",
  "wall art print", "sticker", "phone case", "blanket", "throw pillow", "hat",
  "baby onesie", "apron", "keychain", "poster",
];

/** Etsy returns at most 100 per request; deeper pages cost one call each. */
const PAGE = 100;
const DISCOVERY_PAGES = 8;

/**
 * PUBLISHING OUTRANKS INTEL, ALWAYS.
 *
 * Somebody's batch going to Etsy is the thing they paid for. This board is
 * worth reading tomorrow instead. If the remaining allowance drops under the
 * floor mid-run the sweep stops where it is and keeps what it already read —
 * a partial night is still a real night, and half a board beats a failed
 * publish.
 */
const BUDGET_FLOOR = 6_000;

/** A claim older than this is treated as abandoned by a run that died. */
const CLAIM_MINUTES = 30;

export type EtsyListing = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  url?: string;
  quantity?: number;
  taxonomy_id?: number;
  num_favorers?: number;
  views?: number;
  state?: string;
  price?: { amount?: number; divisor?: number; currency_code?: string };
};

export async function ensureTables() {
  await db().batch([
    /* THE CORPUS. One row per listing we watch, holding last night's reading.
       Listings are added once and kept: discovery is a cost paid per listing
       exactly once, never repeated, which is what keeps the nightly bill flat
       while the board keeps getting broader. */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_watch (
         listing_id  INTEGER PRIMARY KEY,
         shop_id     INTEGER,
         title       TEXT NOT NULL DEFAULT '',
         url         TEXT NOT NULL DEFAULT '',
         image       TEXT,
         price_cents INTEGER,
         currency    TEXT,
         taxonomy_id INTEGER,
         quantity    INTEGER,
         favorites   INTEGER DEFAULT 0,
         views       INTEGER DEFAULT 0,
         state       TEXT,
         first_seen  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         last_read   TEXT
       )`),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_sold_watch_read ON sold_watch (last_read)"),
    /* WHAT MOVED, PER NIGHT. Kept rather than recomputed, because the history
       is the product: a listing that has sold every night for a week is a
       different thing from one that sold nine copies once. */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_moves (
         night          TEXT NOT NULL,
         listing_id     INTEGER NOT NULL,
         sold           INTEGER NOT NULL DEFAULT 0,
         saves_gained   INTEGER NOT NULL DEFAULT 0,
         views_gained   INTEGER NOT NULL DEFAULT 0,
         quantity_after INTEGER,
         sold_out       INTEGER NOT NULL DEFAULT 0,
         restocked      INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (night, listing_id)
       )`),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_sold_moves_night ON sold_moves (night, sold DESC)"),
    /* Etsy's category names, fetched once. Without it the board can only say
       "482" where it should say "T-Shirts". */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_taxonomy (
         taxonomy_id INTEGER PRIMARY KEY,
         name        TEXT NOT NULL,
         top         TEXT NOT NULL
       )`),
    /* One claim row, so twenty sellers arriving at seven do not each start a
       sweep. The same pattern the publish worker and the drop build use. */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_state (
         id             INTEGER PRIMARY KEY,
         building_night TEXT,
         building_since TEXT,
         last_night     TEXT,
         last_error     TEXT,
         watched        INTEGER NOT NULL DEFAULT 0,
         updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`),
    db().prepare("INSERT OR IGNORE INTO sold_state (id) VALUES (1)"),
  ]);
}

/* ---------------------------------------------------------------- Etsy reads */

async function etsyGet(path: string, feature: EtsyFeature = "search") {
  await waitForEtsyCapacity();
  const response = await fetch(`https://openapi.etsy.com/v3/application/${path}`, {
    headers: { "x-api-key": etsyApiCredential() },
    signal: AbortSignal.timeout(20_000),
  });
  await recordEtsyCall(response, feature);
  if (!response.ok) return null;
  return response.json() as Promise<{ results?: unknown[] }>;
}

/**
 * ETSY'S CATEGORY NAMES, ONCE.
 *
 * `taxonomy_id` on a listing is Etsy's own answer to "what product is this",
 * which is worth far more than guessing from the title — a listing found by
 * searching "t shirt" is frequently a mug, and a title that says "Tee" may be
 * a sticker of a tee. One call, cached forever, and the board can group by
 * what the thing actually is.
 */
export async function ensureTaxonomy(): Promise<Map<number, { name: string; top: string }>> {
  const have = await db().prepare("SELECT taxonomy_id,name,top FROM sold_taxonomy").all();
  const rows = (have.results ?? []) as unknown as { taxonomy_id: number; name: string; top: string }[];
  if (rows.length)
    return new Map(rows.map(r => [Number(r.taxonomy_id), { name: r.name, top: r.top }]));

  const payload = await etsyGet("seller-taxonomy/nodes", "taxonomy");
  const flat: { taxonomy_id: number; name: string; top: string }[] = [];
  const walk = (nodes: unknown[], top: string | null) => {
    for (const raw of nodes) {
      const node = raw as { id?: number; name?: string; children?: unknown[] };
      const id = Number(node.id);
      const name = String(node.name ?? "").trim();
      if (!Number.isSafeInteger(id) || !name) continue;
      const root = top ?? name;
      flat.push({ taxonomy_id: id, name, top: root });
      if (Array.isArray(node.children)) walk(node.children, root);
    }
  };
  walk(payload?.results ?? [], null);
  for (let at = 0; at < flat.length; at += 100)
    await db().batch(flat.slice(at, at + 100).map(row =>
      db().prepare("INSERT OR REPLACE INTO sold_taxonomy (taxonomy_id,name,top) VALUES (?,?,?)")
        .bind(row.taxonomy_id, row.name, row.top)));
  return new Map(flat.map(r => [r.taxonomy_id, { name: r.name, top: r.top }]));
}

/**
 * GROW THE CORPUS.
 *
 * Etsy's score order, not its default. `listings/active` is newest-first
 * unless told otherwise, and the newest listings are precisely the ones that
 * have not sold anything yet — a corpus of them would be a board of zeroes.
 * Score is Etsy's own view of which listings are performing for a phrase,
 * which is the right population to watch even though it is not itself a sales
 * ranking.
 */
export async function discover(pages = DISCOVERY_PAGES): Promise<number> {
  let added = 0;
  for (const query of SEED_QUERIES) {
    for (let page = 0; page < pages; page++) {
      const budget = await etsyBudget();
      if (budget.remaining < BUDGET_FLOOR) return added;
      const payload = await etsyGet(
        `listings/active?keywords=${encodeURIComponent(query)}&limit=${PAGE}` +
        `&offset=${page * PAGE}&sort_on=score&sort_order=down`);
      const rows = (payload?.results ?? []) as EtsyListing[];
      if (!rows.length) break;
      const writes = rows
        .filter(row => Number.isSafeInteger(Number(row.listing_id)))
        .map(row => db().prepare(
          /* IGNORE, not REPLACE: a listing already in the corpus carries last
             night's reading, and overwriting it here would erase the very
             number tonight's sweep needs to subtract from. */
          `INSERT OR IGNORE INTO sold_watch (listing_id,shop_id,title,url,taxonomy_id)
           VALUES (?,?,?,?,?)`)
          .bind(
            Number(row.listing_id), Number(row.shop_id) || null,
            String(row.title ?? "").slice(0, 300), String(row.url ?? ""),
            Number.isFinite(Number(row.taxonomy_id)) ? Number(row.taxonomy_id) : null));
      for (let at = 0; at < writes.length; at += 50) await db().batch(writes.slice(at, at + 50));
      added += writes.length;
    }
  }
  return added;
}

/* ------------------------------------------------------------- the nightly sweep */

/**
 * READ THE SHELF AND WRITE DOWN WHAT MOVED.
 *
 * One hundred listings per call, which is what makes a large corpus affordable
 * at all. Everything the board shows is computed here, once, so a seller
 * opening the page triggers no Etsy traffic whatsoever.
 */
export async function sweep(
  night: string,
  maxCalls = Infinity,
): Promise<{ read: number; moved: number; sold: number; done: boolean }> {
  let read = 0, moved = 0, sold = 0, calls = 0, done = false;

  for (;;) {
    if (calls >= maxCalls) break;
    const budget = await etsyBudget();
    if (budget.remaining < BUDGET_FLOOR) break;

    /* Oldest reading first, so a sweep that runs out of allowance leaves the
       most stale listings at the front of tomorrow's queue rather than
       starving the same tail every night. */
    const due = await db().prepare(
      `SELECT listing_id,quantity,favorites,views FROM sold_watch
       WHERE last_read IS NULL OR last_read < ?
       ORDER BY last_read IS NOT NULL, last_read LIMIT ?`).bind(night, PAGE).all();
    const batch = (due.results ?? []) as unknown as
      { listing_id: number; quantity: number | null; favorites: number; views: number }[];
    /* Nothing left unread tonight — the corpus is fully swept. */
    if (!batch.length) { done = true; break; }
    calls++;

    const before = new Map(batch.map(r => [Number(r.listing_id), r]));
    const payload = await etsyGet(
      `listings/batch?listing_ids=${batch.map(r => r.listing_id).join(",")}&includes=Images`);
    const rows = (payload?.results ?? []) as (EtsyListing & {
      images?: { url_570xN?: string; url_fullxfull?: string }[];
    })[];

    /*
      A listing Etsy did not return is not evidence of anything — it may be
      deleted, sold out, or the request may simply have dropped it. It still
      gets its read stamped so the sweep advances instead of asking for the
      same hundred ids forever.
    */
    if (!rows.length) {
      await db().batch(batch.map(r =>
        db().prepare("UPDATE sold_watch SET last_read=? WHERE listing_id=?").bind(night, r.listing_id)));
      continue;
    }

    const writes: D1PreparedStatement[] = [];
    for (const row of rows) {
      const id = Number(row.listing_id);
      const was = before.get(id);
      if (!was) continue;
      read++;

      const now = Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : null;
      const favorites = Number(row.num_favorers) || 0;
      const views = Number(row.views) || 0;
      const image = row.images?.[0]?.url_570xN ?? row.images?.[0]?.url_fullxfull ?? null;
      const price = row.price?.amount != null && row.price?.divisor
        ? Math.round(Number(row.price.amount) / Number(row.price.divisor) * 100) : null;

      /* The rule itself lives in sold-overnight-math, where it is unit
         tested rather than trusted. */
      const move = movement(was.quantity ?? null, now);
      const units = move.units;
      const restocked = move.restocked ? 1 : 0;
      const soldOut = move.soldOut ? 1 : 0;

      if (move.record) {
        moved++; sold += units;
        writes.push(db().prepare(
          `INSERT INTO sold_moves (night,listing_id,sold,saves_gained,views_gained,quantity_after,sold_out,restocked)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(night,listing_id) DO UPDATE SET
             sold=sold+excluded.sold, saves_gained=excluded.saves_gained,
             views_gained=excluded.views_gained, quantity_after=excluded.quantity_after,
             sold_out=MAX(sold_out,excluded.sold_out), restocked=MAX(restocked,excluded.restocked)`)
          .bind(night, id, units,
            Math.max(0, favorites - (Number(was.favorites) || 0)),
            Math.max(0, views - (Number(was.views) || 0)),
            now, soldOut, restocked));
      }

      writes.push(db().prepare(
        `UPDATE sold_watch SET quantity=?,favorites=?,views=?,state=?,image=COALESCE(?,image),
           price_cents=COALESCE(?,price_cents),currency=COALESCE(?,currency),
           title=CASE WHEN ?='' THEN title ELSE ? END,url=CASE WHEN ?='' THEN url ELSE ? END,
           taxonomy_id=COALESCE(?,taxonomy_id),last_read=?
         WHERE listing_id=?`)
        .bind(now, favorites, views, String(row.state ?? ""), image, price,
          row.price?.currency_code ?? null,
          String(row.title ?? ""), String(row.title ?? "").slice(0, 300),
          String(row.url ?? ""), String(row.url ?? ""),
          Number.isFinite(Number(row.taxonomy_id)) ? Number(row.taxonomy_id) : null,
          night, id));
    }

    /* Anything the response skipped still gets stamped, or the loop repeats. */
    const answered = new Set(rows.map(r => Number(r.listing_id)));
    for (const r of batch)
      if (!answered.has(Number(r.listing_id)))
        writes.push(db().prepare("UPDATE sold_watch SET last_read=? WHERE listing_id=?")
          .bind(night, r.listing_id));

    for (let at = 0; at < writes.length; at += 50) await db().batch(writes.slice(at, at + 50));
  }

  return { read, moved, sold, done };
}

/**
 * Run tonight's build, once.
 *
 * Claimed before it starts. A claim left behind by a run that died is retaken
 * after half an hour rather than blocking the board forever.
 */
export async function buildNight(
  { maxCalls = Infinity, discovery = true }: { maxCalls?: number; discovery?: boolean } = {},
): Promise<{ built: boolean; why?: string; read?: number; sold?: number; done?: boolean }> {
  await ensureTables();
  const night = nightOf();

  const state = await db().prepare(
    "SELECT last_night,building_night,building_since FROM sold_state WHERE id=1").first() as
    { last_night: string | null; building_night: string | null; building_since: string | null } | null;

  if (state?.last_night === night) return { built: false, why: "already read tonight" };
  if (state?.building_night === night && state.building_since) {
    const age = (Date.now() - new Date(`${state.building_since.replace(" ", "T")}Z`).getTime()) / 60_000;
    if (age < CLAIM_MINUTES) return { built: false, why: "already being read" };
  }
  await db().prepare(
    "UPDATE sold_state SET building_night=?,building_since=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=1")
    .bind(night).run();

  try {
    await ensureTaxonomy();
    if (discovery) await discover();
    const result = await sweep(night, maxCalls);
    const watched = await db().prepare("SELECT COUNT(*) n FROM sold_watch").first() as { n: number } | null;
    /*
      THE NIGHT IS ONLY FINISHED WHEN THE WHOLE CORPUS HAS BEEN READ.

      A bounded run advances the sweep and stops; marking the night done at
      that point would freeze the board at whatever the first slice happened to
      contain and skip every remaining listing until tomorrow. So the claim is
      released either way — another run may continue — but `last_night` is set
      only on a sweep that reached the end.
    */
    await db().prepare(
      `UPDATE sold_state SET last_night=COALESCE(?,last_night),building_night=NULL,
         building_since=NULL,last_error=NULL,watched=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(result.done ? night : null, Number(watched?.n) || 0).run();
    return { built: true, read: result.read, sold: result.sold, done: result.done };
  } catch (error) {
    await db().prepare(
      `UPDATE sold_state SET building_night=NULL,building_since=NULL,last_error=?,
         updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(error instanceof Error ? error.message : "Unknown error").run();
    throw error;
  }
}

/* ------------------------------------------------------------------- the board */

export type SoldListing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string;
  sold: number; soldOut: boolean; savesGained: number; left: number | null;
  product: string;
};
export type SoldBoard = {
  night: string | null;
  watched: number;
  totalSold: number;
  building: boolean;
  products: { key: string; label: string; sold: number }[];
  listings: SoldListing[];
};

/**
 * READ THE BOARD. No Etsy traffic — everything here was counted overnight.
 *
 * `product` is Etsy's own top-level category for the listing, so the shelves
 * are the real ones rather than a guess from the title.
 */
export async function readBoard(limit = 200, night?: string): Promise<SoldBoard> {
  await ensureTables();
  const state = await db().prepare("SELECT last_night,building_night,watched FROM sold_state WHERE id=1")
    .first() as { last_night: string | null; building_night: string | null; watched: number } | null;
  const on = night ?? state?.last_night ?? null;
  if (!on)
    return { night: null, watched: Number(state?.watched) || 0, totalSold: 0,
      building: Boolean(state?.building_night), products: [], listings: [] };

  const rows = (await db().prepare(
    `SELECT m.listing_id,m.sold,m.sold_out,m.saves_gained,m.quantity_after,
            w.title,w.url,w.image,w.price_cents,w.currency,
            COALESCE(t.top,'Other') product
       FROM sold_moves m
       JOIN sold_watch w ON w.listing_id=m.listing_id
       LEFT JOIN sold_taxonomy t ON t.taxonomy_id=w.taxonomy_id
      WHERE m.night=? AND m.sold>0
      ORDER BY m.sold DESC, m.saves_gained DESC
      LIMIT ?`).bind(on, limit).all()).results as unknown as {
        listing_id: number; sold: number; sold_out: number; saves_gained: number;
        quantity_after: number | null; title: string; url: string; image: string | null;
        price_cents: number | null; currency: string | null; product: string;
      }[];

  const totals = (await db().prepare(
    `SELECT COALESCE(t.top,'Other') product, SUM(m.sold) sold
       FROM sold_moves m
       JOIN sold_watch w ON w.listing_id=m.listing_id
       LEFT JOIN sold_taxonomy t ON t.taxonomy_id=w.taxonomy_id
      WHERE m.night=? AND m.sold>0
      GROUP BY product ORDER BY sold DESC`).bind(on).all()).results as unknown as
      { product: string; sold: number }[];

  return {
    night: on,
    watched: Number(state?.watched) || 0,
    totalSold: totals.reduce((sum, t) => sum + Number(t.sold), 0),
    building: Boolean(state?.building_night),
    products: totals.map(t => ({ key: t.product, label: t.product, sold: Number(t.sold) })),
    listings: rows.map(r => ({
      listingId: Number(r.listing_id),
      title: r.title,
      url: r.url,
      image: r.image,
      price: r.price_cents == null ? null : Number(r.price_cents) / 100,
      currency: r.currency || "USD",
      sold: Number(r.sold),
      soldOut: Boolean(r.sold_out),
      savesGained: Number(r.saves_gained) || 0,
      left: r.quantity_after == null ? null : Number(r.quantity_after),
      product: r.product,
    })),
  };
}

/** The night before the one being shown, for the back button. */
export async function previousNight(before: string): Promise<string | null> {
  const row = await db().prepare(
    "SELECT night FROM sold_moves WHERE night<? ORDER BY night DESC LIMIT 1").bind(before).first() as
    { night: string } | null;
  return row?.night ?? null;
}
