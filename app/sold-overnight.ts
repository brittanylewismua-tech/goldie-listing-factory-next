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
 * Movement is filed by the HOUR it was seen in, not the day.
 *
 * Filing by day meant the board could only ever answer "what sold since
 * midnight UTC", which at eight in the morning is a thin and arbitrary slice
 * and at one minute past midnight is nothing at all. Hour buckets let it
 * answer "what sold in the last twenty-four hours", which is the question
 * somebody opening this page is actually asking, at any hour they ask it.
 */
export const hourOf = (at: Date = new Date()) => at.toISOString().slice(0, 13);


/** Etsy returns at most 100 per request; deeper pages cost one call each. */
const PAGE = 100;
const DISCOVERY_PAGES = 1;

/**
 * HOW OFTEN A LISTING IS RE-READ, AND THE CEILING ON WHAT THAT MAY COST.
 *
 * A pass over the corpus costs corpus/100 calls whether it happens all at
 * 2am or spread through the day — the total is the same either way. What
 * spreading buys is a board that is current at ten in the morning instead of
 * fourteen hours stale, and a more accurate count: a listing that sells three
 * and is restocked reads as zero if it is only looked at once.
 *
 * Four hours is six passes a day. On a hundred thousand listings that is six
 * thousand calls — under eight per cent of the allowance. DAILY_CEILING is the
 * hard stop regardless: this feature may never spend more than this in a day,
 * so a corpus that grows unexpectedly cannot quietly eat the quota that
 * publishing depends on.
 */
const REFRESH_HOURS = 4;
const DAILY_CEILING = 8_000;

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

/**
 * A claim older than this is treated as abandoned by a run that died.
 *
 * Short on purpose. A worker killed mid-sweep leaves its claim behind, and
 * every minute the claim stands is a minute nothing else may continue the
 * night. Five minutes is longer than any single bounded run should take.
 */
const CLAIM_MINUTES = 5;

export type EtsyListing = {
  listing_id?: number;
  listing_type?: string;
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
         listing_type TEXT,
         first_seen  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         last_read   TEXT
       )`),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_sold_watch_read ON sold_watch (last_read)"),
    /* WHAT MOVED, PER NIGHT. Kept rather than recomputed, because the history
       is the product: a listing that has sold every night for a week is a
       different thing from one that sold nine copies once. */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_moves (
         bucket         TEXT NOT NULL,
         listing_id     INTEGER NOT NULL,
         sold           INTEGER NOT NULL DEFAULT 0,
         saves_gained   INTEGER NOT NULL DEFAULT 0,
         views_gained   INTEGER NOT NULL DEFAULT 0,
         quantity_after INTEGER,
         sold_out       INTEGER NOT NULL DEFAULT 0,
         restocked      INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (bucket, listing_id)
       )`),
    /* The index on `bucket` is NOT created here. This batch runs before the
       migration below, and against a table still keyed on `night` the
       statement fails — taking the whole batch, and every sweep, with it.
       That is what "no such column: bucket at offset 64" was: not the new
       code writing, but the schema setup indexing a column that did not
       exist yet. It is created after the migration instead. */
    /* Etsy's category names, fetched once. Without it the board can only say
       "482" where it should say "T-Shirts". */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_taxonomy (
         taxonomy_id INTEGER PRIMARY KEY,
         name        TEXT NOT NULL,
         top         TEXT NOT NULL,
         path        TEXT NOT NULL DEFAULT ''
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
    /* What this feature alone has spent today, so the ceiling can be enforced
       without guessing from the shared Etsy tally. */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS sold_spend (
         day   TEXT PRIMARY KEY,
         calls INTEGER NOT NULL DEFAULT 0
       )`),
  ]);
  /* Columns added after the tables first shipped. */
  try { await db().prepare("ALTER TABLE sold_watch ADD COLUMN listing_type TEXT").run(); }
  catch { /* already there */ }
  try { await db().prepare("ALTER TABLE sold_taxonomy ADD COLUMN path TEXT NOT NULL DEFAULT ''").run(); }
  catch { /* already there */ }
  await migrateMovesToHours();
  /* Safe now: the table definitely has the column, whichever path got us here. */
  await db().prepare(
    "CREATE INDEX IF NOT EXISTS idx_sold_moves_bucket ON sold_moves (bucket, sold DESC)").run();
}

/**
 * DAY ROWS BECOME HOUR ROWS.
 *
 * `CREATE TABLE IF NOT EXISTS` DOES NOTHING WHEN THE TABLE EXISTS WITH A
 * DIFFERENT SHAPE, and says nothing about it. sold_moves shipped keyed on
 * `night`; changing the code to write `bucket` produced "no such column:
 * bucket" on every sweep, while the statement that was supposed to define the
 * new shape ran happily and reported success. A schema change needs a
 * migration, not a hopeful CREATE.
 *
 * A day row becomes that day's midnight hour. It is the only honest
 * conversion available — the original reading did not record which hour it
 * happened in — and it keeps the sales already counted rather than throwing
 * them away for tidiness.
 */
async function migrateMovesToHours(): Promise<"already-hourly" | "migrated"> {
  /*
    ASK THE DATABASE A QUESTION IT CANNOT ANSWER VAGUELY.

    The first attempt at this detected the old shape with
    `PRAGMA table_info(sold_moves)`. D1 returns nothing for that, so the guard
    read "no columns, therefore no table, therefore nothing to migrate" and
    returned — skipping the migration on every single deploy while reporting
    success, which is precisely the failure it was written to fix.

    Selecting the column either works or throws. There is no third answer and
    nothing to misread.
  */
  try {
    await db().prepare("SELECT bucket FROM sold_moves LIMIT 1").all();
    return "already-hourly";
  } catch {
    /* Old shape, keyed on `night`. */
  }

  /*
    One statement at a time, not a batch: D1 will not run DROP and ALTER
    inside one, and a batch that fails leaves no clue which statement did it.
    Ordered so an interruption at any point leaves the data recoverable —
    the copy completes before the original is dropped.
  */
  await db().prepare(
    `CREATE TABLE IF NOT EXISTS sold_moves_hourly (
       bucket         TEXT NOT NULL,
       listing_id     INTEGER NOT NULL,
       sold           INTEGER NOT NULL DEFAULT 0,
       saves_gained   INTEGER NOT NULL DEFAULT 0,
       views_gained   INTEGER NOT NULL DEFAULT 0,
       quantity_after INTEGER,
       sold_out       INTEGER NOT NULL DEFAULT 0,
       restocked      INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (bucket, listing_id)
     )`).run();

  /* A day row becomes that day's midnight hour — the only honest conversion,
     since the original reading never recorded which hour it happened in. The
     sales already counted are kept rather than thrown away for tidiness. */
  await db().prepare(
    `INSERT OR IGNORE INTO sold_moves_hourly
       (bucket,listing_id,sold,saves_gained,views_gained,quantity_after,sold_out,restocked)
     SELECT night || 'T00',listing_id,sold,saves_gained,views_gained,quantity_after,sold_out,restocked
       FROM sold_moves`).run();

  await db().prepare("DROP TABLE sold_moves").run();
  await db().prepare("ALTER TABLE sold_moves_hourly RENAME TO sold_moves").run();
  await db().prepare(
    "CREATE INDEX IF NOT EXISTS idx_sold_moves_bucket ON sold_moves (bucket, sold DESC)").run();
  return "migrated";
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
export async function ensureTaxonomy(): Promise<void> {
  const have = await db().prepare(
    "SELECT COUNT(*) n FROM sold_taxonomy WHERE path<>''").first() as { n: number } | null;
  if (Number(have?.n) > 0) return;

  const payload = await etsyGet("seller-taxonomy/nodes", "taxonomy");
  const flat: { taxonomy_id: number; name: string; top: string; path: string }[] = [];
  const walk = (nodes: unknown[], trail: string[]) => {
    for (const raw of nodes) {
      const node = raw as { id?: number; name?: string; children?: unknown[] };
      const id = Number(node.id);
      const name = String(node.name ?? "").trim();
      if (!Number.isSafeInteger(id) || !name) continue;
      const here = [...trail, name];
      flat.push({ taxonomy_id: id, name, top: here[0], path: here.join(" > ") });
      if (Array.isArray(node.children)) walk(node.children, here);
    }
  };
  walk(payload?.results ?? [], []);
  for (let at = 0; at < flat.length; at += 100)
    await db().batch(flat.slice(at, at + 100).map(row =>
      db().prepare("INSERT OR REPLACE INTO sold_taxonomy (taxonomy_id,name,top,path) VALUES (?,?,?,?)")
        .bind(row.taxonomy_id, row.name, row.top, row.path)));
}

/**
 * THE SHELVES THIS TOOL IS ACTUALLY ABOUT.
 *
 * Named by their full path rather than by an id, because Etsy's tree contains
 * several nodes called the same thing and a hardcoded number can quietly start
 * meaning something else. Named by path rather than by leaf name for the same
 * reason: "Stickers" appears in more than one department.
 */
const POD_SHELVES: { top: string; leaf: string }[] = [
  { top: "Clothing", leaf: "T-shirts" },
  { top: "Clothing", leaf: "Hoodies" },
  { top: "Clothing", leaf: "Sweatshirts" },
  { top: "Clothing", leaf: "Tanks" },
  { top: "Clothing", leaf: "Bodysuits" },
  { top: "Accessories", leaf: "Baseball & Trucker Caps" },
  { top: "Bags & Purses", leaf: "Totes" },
  { top: "Home & Living", leaf: "Mugs" },
  { top: "Home & Living", leaf: "Throw Pillows" },
  { top: "Home & Living", leaf: "Blankets & Throws" },
  { top: "Home & Living", leaf: "Baby Blankets" },
  { top: "Home & Living", leaf: "Wall Decor" },
  { top: "Art & Collectibles", leaf: "Prints" },
  { top: "Paper & Party Supplies", leaf: "Stickers" },
  { top: "Electronics & Accessories", leaf: "Phone Cases" },
];

/**
 * Resolve those to the ids Etsy's search will filter on.
 *
 * MATCHED ON DEPARTMENT AND LEAF, NOT THE WHOLE PATH. The first version
 * spelled out complete paths — "Clothing > Unisex Adult Clothing > Tops & Tees
 * > T-shirts" — and eleven of the fifteen silently failed to match, because
 * guessing Etsy's middle levels exactly is a coin flip and a miss looks
 * identical to a shelf that does not exist. Department plus leaf is specific
 * enough to disambiguate the several nodes sharing a name, and does not depend
 * on middle levels nobody sees.
 *
 * Still never a hardcoded id: those can quietly start meaning something else.
 */
export async function shelfIds(): Promise<{ id: number; label: string }[]> {
  const rows = (await db().prepare(
    `SELECT taxonomy_id,name,top,path FROM sold_taxonomy
      WHERE (${POD_SHELVES.map(() => "(top = ? AND name = ?)").join(" OR ")})`)
    .bind(...POD_SHELVES.flatMap(shelf => [shelf.top, shelf.leaf])).all()).results as unknown as
    { taxonomy_id: number; name: string; top: string; path: string }[];

  /* A leaf name can still appear twice inside one department. Take the
     shallowest — the broader shelf, which is the one a seller means. */
  const best = new Map<string, { id: number; label: string; depth: number }>();
  for (const row of rows) {
    const key = `${row.top}|${row.name}`;
    const depth = String(row.path ?? "").split(">").length;
    const seen = best.get(key);
    if (!seen || depth < seen.depth)
      best.set(key, { id: Number(row.taxonomy_id), label: row.name, depth });
  }
  return [...best.values()].map(({ id, label }) => ({ id, label }));
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
  const shelves = await shelfIds();
  if (!shelves.length) return 0;

  /*
    THINNEST SHELF FIRST.

    Seeding by keyword produced a corpus that was almost all blankets and
    stickers with no apparel in it at all — the words happened to pull unevenly
    and nothing corrected for it, so the board had a "Throw Pillows" tab with
    one thing behind it. Etsy's search takes a taxonomy filter, so each shelf
    can be stocked directly, and the one with the fewest listings is always
    served first. The corpus levels itself instead of drifting.
  */
  const counts = new Map<number, number>(
    ((await db().prepare(
      "SELECT taxonomy_id, COUNT(*) n FROM sold_watch WHERE taxonomy_id IS NOT NULL GROUP BY taxonomy_id")
      .all()).results as unknown as { taxonomy_id: number; n: number }[])
      .map(r => [Number(r.taxonomy_id), Number(r.n)]));

  const order = [...shelves].sort(
    (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0));

  let added = 0;
  for (const shelf of order) {
    for (let page = 0; page < pages; page++) {
      const budget = await etsyBudget();
      if (budget.remaining < BUDGET_FLOOR) return added;
      const payload = await etsyGet(
        `listings/active?taxonomy_id=${shelf.id}&limit=${PAGE}` +
        `&offset=${page * PAGE}&sort_on=score&sort_order=down`);
      const rows = (payload?.results ?? []) as EtsyListing[];
      if (!rows.length) break;
      const writes = rows
        .filter(row => Number.isSafeInteger(Number(row.listing_id)))
        .map(row => db().prepare(
          /* IGNORE, not REPLACE: a listing already in the corpus carries its
             last reading, and overwriting it here would erase the very number
             the next sweep subtracts from. */
          `INSERT OR IGNORE INTO sold_watch (listing_id,shop_id,title,url,taxonomy_id)
           VALUES (?,?,?,?,?)`)
          .bind(
            Number(row.listing_id), Number(row.shop_id) || null,
            String(row.title ?? "").slice(0, 300), String(row.url ?? ""),
            Number.isFinite(Number(row.taxonomy_id)) ? Number(row.taxonomy_id) : shelf.id));
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
  maxCalls = Infinity,
): Promise<{ read: number; moved: number; sold: number; done: boolean; spentToday: number }> {
  let read = 0, moved = 0, sold = 0, calls = 0, done = false;
  const day = nightOf();

  /* What this feature has already spent today, against its own ceiling. */
  const spent = await db().prepare("SELECT calls FROM sold_spend WHERE day=?").bind(day)
    .first() as { calls: number } | null;
  let spentToday = Number(spent?.calls) || 0;

  /* Anything read more recently than this is left alone. */
  const staleBefore = new Date(Date.now() - REFRESH_HOURS * 3_600_000).toISOString();

  for (;;) {
    if (calls >= maxCalls) break;
    if (spentToday >= DAILY_CEILING) break;
    const budget = await etsyBudget();
    if (budget.remaining < BUDGET_FLOOR) break;

    /* Oldest reading first, so a sweep that runs out of allowance leaves the
       most stale listings at the front of tomorrow's queue rather than
       starving the same tail every night. */
    const due = await db().prepare(
      /*
        A DIGITAL DOWNLOAD IS NOT WHAT THIS TOOL IS FOR.

        Crochet patterns and PDF tutorials sell extremely well on Etsy and are
        completely useless to somebody deciding which blank to print. Once a
        listing has been read and identified as a download it is never read
        again — which keeps it off the board AND stops it costing quota every
        night. Unread listings still come through, because the only way to
        learn what something is, is to read it once.
      */
      `SELECT listing_id,quantity,favorites,views FROM sold_watch
       WHERE (last_read IS NULL OR last_read < ?)
         AND (listing_type IS NULL OR listing_type = 'physical')
       ORDER BY last_read IS NOT NULL, last_read LIMIT ?`).bind(staleBefore, PAGE).all();
    const batch = (due.results ?? []) as unknown as
      { listing_id: number; quantity: number | null; favorites: number; views: number }[];
    /* Nothing is stale — the whole corpus is current. */
    if (!batch.length) { done = true; break; }
    calls++; spentToday++;

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
      const now = new Date().toISOString();
      await db().batch(batch.map(r =>
        db().prepare("UPDATE sold_watch SET last_read=? WHERE listing_id=?").bind(now, r.listing_id)));
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
          `INSERT INTO sold_moves (bucket,listing_id,sold,saves_gained,views_gained,quantity_after,sold_out,restocked)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(bucket,listing_id) DO UPDATE SET
             sold=sold+excluded.sold, saves_gained=excluded.saves_gained,
             views_gained=excluded.views_gained, quantity_after=excluded.quantity_after,
             sold_out=MAX(sold_out,excluded.sold_out), restocked=MAX(restocked,excluded.restocked)`)
          .bind(hourOf(), id, units,
            Math.max(0, favorites - (Number(was.favorites) || 0)),
            Math.max(0, views - (Number(was.views) || 0)),
            now, soldOut, restocked));
      }

      writes.push(db().prepare(
        `UPDATE sold_watch SET quantity=?,favorites=?,views=?,state=?,listing_type=COALESCE(?,listing_type),image=COALESCE(?,image),
           price_cents=COALESCE(?,price_cents),currency=COALESCE(?,currency),
           title=CASE WHEN ?='' THEN title ELSE ? END,url=CASE WHEN ?='' THEN url ELSE ? END,
           taxonomy_id=COALESCE(?,taxonomy_id),last_read=?
         WHERE listing_id=?`)
        .bind(now, favorites, views, String(row.state ?? ""),
          row.listing_type ? String(row.listing_type) : null, image, price,
          row.price?.currency_code ?? null,
          String(row.title ?? ""), String(row.title ?? "").slice(0, 300),
          String(row.url ?? ""), String(row.url ?? ""),
          Number.isFinite(Number(row.taxonomy_id)) ? Number(row.taxonomy_id) : null,
          new Date().toISOString(), id));
    }

    /* Anything the response skipped still gets stamped, or the loop repeats. */
    const answered = new Set(rows.map(r => Number(r.listing_id)));
    for (const r of batch)
      if (!answered.has(Number(r.listing_id)))
        writes.push(db().prepare("UPDATE sold_watch SET last_read=? WHERE listing_id=?")
          .bind(new Date().toISOString(), r.listing_id));

    for (let at = 0; at < writes.length; at += 50) await db().batch(writes.slice(at, at + 50));
  }

  if (calls)
    await db().prepare(
      `INSERT INTO sold_spend (day,calls) VALUES (?,?)
       ON CONFLICT(day) DO UPDATE SET calls=calls+excluded.calls`).bind(day, calls).run();

  return { read, moved, sold, done, spentToday };
}

/**
 * Run tonight's build, once.
 *
 * Claimed before it starts. A claim left behind by a run that died is retaken
 * after half an hour rather than blocking the board forever.
 */
export async function runSweep(
  { maxCalls = Infinity, discovery = true, pages = DISCOVERY_PAGES }:
    { maxCalls?: number; discovery?: boolean; pages?: number } = {},
): Promise<{ ran: boolean; why?: string; read?: number; sold?: number; done?: boolean;
             found?: number; watched?: number; spentToday?: number; shelves?: string[] }> {
  await ensureTables();

  /*
    ONE SWEEP AT A TIME, AND NEVER A PERMANENT LOCK.

    There is no "night" to claim any more — the corpus is simply kept current,
    and any number of triggers (a cron, a page load, the owner's button) may
    ask for a slice. What must not happen is two of them reading the same
    hundred listings at once and both writing a movement for the same sale.
    A claim older than the abandoned window is retaken, so a worker killed
    mid-slice costs minutes rather than blocking the board.
  */
  const state = await db().prepare("SELECT building_since FROM sold_state WHERE id=1")
    .first() as { building_since: string | null } | null;
  if (state?.building_since) {
    const age = (Date.now() - new Date(`${state.building_since.replace(" ", "T")}Z`).getTime()) / 60_000;
    if (age < CLAIM_MINUTES) return { ran: false, why: "a sweep is already running" };
  }
  await db().prepare(
    "UPDATE sold_state SET building_since=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();

  try {
    await ensureTaxonomy();
    const found = discovery ? await discover(pages) : 0;
    const result = await sweep(maxCalls);
    const watched = await db().prepare(
      "SELECT COUNT(*) n FROM sold_watch WHERE listing_type IS NULL OR listing_type='physical'")
      .first() as { n: number } | null;
    await db().prepare(
      `UPDATE sold_state SET building_since=NULL,last_error=NULL,watched=?,
         last_night=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(Number(watched?.n) || 0, nightOf()).run();
    /* How many shelves resolved, named. A shelf whose taxonomy lookup misses
       contributes nothing and looks exactly like a shelf nobody buys from —
       so the run says which ones it actually stocked. */
    const shelves = await shelfIds();
    return { ran: true, read: result.read, sold: result.sold, done: result.done,
             found, watched: Number(watched?.n) || 0, spentToday: result.spentToday,
             shelves: shelves.map(s => s.label) };
  } catch (error) {
    await db().prepare(
      "UPDATE sold_state SET building_since=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
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
  hoursBack: number;
  products: { key: string; label: string; sold: number; listings: number }[];
  listings: SoldListing[];
};

/** How many selling listings a category needs before it earns its own tab. */
export const SHELF_MINIMUM = 30;

/**
 * READ THE BOARD. No Etsy traffic — everything here was counted overnight.
 *
 * `product` is Etsy's own top-level category for the listing, so the shelves
 * are the real ones rather than a guess from the title.
 */
export async function readBoard(limit = 400, hoursBack = 24): Promise<SoldBoard> {
  await ensureTables();
  const state = await db().prepare("SELECT building_since,watched FROM sold_state WHERE id=1")
    .first() as { building_since: string | null; watched: number } | null;

  /*
    A ROLLING WINDOW, NOT A CALENDAR DAY.

    Filing by day meant the board could only answer "what sold since midnight
    UTC" — at eight in the morning a thin arbitrary slice, at one minute past
    midnight nothing at all, and always an invitation to come back later. The
    question somebody opening this page is asking is "what has been selling",
    and the honest answer to that is the last twenty-four hours, whenever they
    ask it.
  */
  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString().slice(0, 13);

  const rows = (await db().prepare(
    `SELECT m.listing_id, SUM(m.sold) sold, MAX(m.sold_out) sold_out,
            SUM(m.saves_gained) saves_gained, MIN(m.quantity_after) quantity_after,
            w.title,w.url,w.image,w.price_cents,w.currency,
            COALESCE(t.name,'Other') product
       FROM sold_moves m
       JOIN sold_watch w ON w.listing_id=m.listing_id
       LEFT JOIN sold_taxonomy t ON t.taxonomy_id=w.taxonomy_id
      WHERE m.bucket>=? AND m.sold>0 AND COALESCE(w.listing_type,'physical')='physical'
      GROUP BY m.listing_id
      ORDER BY sold DESC, saves_gained DESC
      LIMIT ?`).bind(since, limit).all()).results as unknown as {
        listing_id: number; sold: number; sold_out: number; saves_gained: number;
        quantity_after: number | null; title: string; url: string; image: string | null;
        price_cents: number | null; currency: string | null; product: string;
      }[];

  /*
    A SHELF WITH ONE THING ON IT IS NOT A SHELF.

    A tab reading "Throw Pillows 1" invites a click that leads to a single
    card and a dead end — it makes the board look empty in exactly the place
    it was meant to look useful. Categories below the threshold are still on
    the board under Everything; they simply do not get a tab of their own
    until there is something behind it.
  */
  const perProduct = new Map<string, { sold: number; listings: number }>();
  for (const row of rows) {
    const at = perProduct.get(row.product) ?? { sold: 0, listings: 0 };
    at.sold += Number(row.sold); at.listings++;
    perProduct.set(row.product, at);
  }

  return {
    night: rows.length ? new Date().toISOString().slice(0, 10) : null,
    watched: Number(state?.watched) || 0,
    totalSold: rows.reduce((sum, r) => sum + Number(r.sold), 0),
    building: Boolean(state?.building_since),
    hoursBack,
    products: [...perProduct.entries()]
      .filter(([, at]) => at.listings >= SHELF_MINIMUM)
      .sort((a, b) => b[1].sold - a[1].sold)
      .map(([key, at]) => ({ key, label: key, sold: at.sold, listings: at.listings })),
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

/**
 * Read everything again immediately, ignoring the refresh interval.
 *
 * Sales accumulate across passes rather than replacing each other, so an extra
 * pass simply counts more of what happened. Costs a full sweep, so it is an
 * owner control rather than something the app does on its own.
 */
export async function refreshNow() {
  await ensureTables();
  await db().batch([
    db().prepare("UPDATE sold_watch SET last_read=NULL"),
    db().prepare("UPDATE sold_state SET building_since=NULL WHERE id=1"),
  ]);
}
