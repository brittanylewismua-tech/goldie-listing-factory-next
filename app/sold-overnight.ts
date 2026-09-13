import { env } from "cloudflare:workers";
import type { EtsyFeature } from "@/app/api/etsy/client";
import { MAX_UNITS_PER_READ, movement, usdFromCents, tradesOnRights } from "@/app/sold-overnight-math";
import { attribute, shopDelta, type Attribution } from "@/app/sold-attribution";
import { printable } from "@/app/pod-fit";
import { mentionsAMark } from "@/app/trademark-check";
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
/**
 * ETSY'S SIX-HOUR RULE, AND WHY THE REFRESH IS FOUR.
 *
 * The API Terms forbid displaying listing content more than six hours older
 * than Etsy's own, and Etsy confirmed in writing on 13 September 2026 that
 * this covers "aggregate figures derived from those listings" — so it binds
 * every number on this board, not only the titles and pictures.
 *
 * Four hours leaves two spare for a sweep that runs late. It is not a
 * preference and it may not drift upward: DISPLAY_MAX_AGE_HOURS below is the
 * hard line, and the board drops anything past it rather than showing stale
 * content and hoping nobody checks.
 */
const REFRESH_HOURS = 4;
const DISPLAY_MAX_AGE_HOURS = 6;
const DAILY_CEILING = 8_000;

/**
 * WHAT EARNS A PLACE IN THE CORPUS, AND WHAT LOSES IT.
 *
 * Accuracy here is not coverage. Etsy is far too large to watch and its sales
 * are concentrated in a small fraction of listings, so a hundred thousand
 * listings people actually want is a far better picture than a million at
 * random — and it is what the daily ceiling affords at a hundred listings per
 * call.
 *
 * A listing nobody has ever saved is almost certainly not selling, and it
 * costs exactly as much to read as one that is. Requiring saves at the door
 * and dropping the ones that never move keeps every slot worth its quota.
 */
const MIN_SAVES_TO_WATCH = 1;
/** How long observations live. Must exceed the longest window on the board. */
const RETAIN_DAYS = 30;
/** Reads a listing gets to show something before it loses its slot. */
const PATIENCE = 12;

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

export type EtsyShop = {
  shop_id?: number;
  /** Etsy's own cumulative count of completed transactions for the shop. */
  transaction_sold_count?: number;
  /** How many listings the shop has live — decides how tight the cap is. */
  listing_active_count?: number;
};

export type EtsyListing = {
  shop?: EtsyShop;
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
  is_personalizable?: boolean;
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
         personalizable INTEGER,
         reads       INTEGER NOT NULL DEFAULT 0,
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
    /*
      WHAT ETSY SAYS EACH SHOP HAS SOLD, OVER TIME.

      transaction_sold_count is cumulative and exact, so the difference between
      two observations is a real number of real purchases. It belongs to the
      SHOP rather than the listing, which is why it can never be divided across
      listings — but it can prove that a listing's quantity drop coincided with
      an actual sale, and bound how large that drop is allowed to be.

      One row per shop per sweep, kept rather than overwritten, because the
      window you ask for decides which pair of observations to subtract.
    */
    db().prepare(
      `CREATE TABLE IF NOT EXISTS shop_sold (
         shop_id      INTEGER NOT NULL,
         bucket       TEXT NOT NULL,
         sold_count   INTEGER NOT NULL,
         active_count INTEGER,
         PRIMARY KEY (shop_id, bucket)
       )`),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_shop_sold_bucket ON shop_sold (bucket)"),
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
  try { await db().prepare("ALTER TABLE sold_watch ADD COLUMN reads INTEGER NOT NULL DEFAULT 0").run(); }
  catch { /* already there */ }
  try { await db().prepare("ALTER TABLE sold_taxonomy ADD COLUMN path TEXT NOT NULL DEFAULT ''").run(); }
  catch { /* already there */ }
  /*
    MADE TO ORDER IS A DIFFERENT BUSINESS FROM PRINTING A DESIGN.

    Thirty-two of the top forty were personalised — name blankets, embroidered
    totes, custom logo tees. Sellers who manage finite made-to-order stock move
    their quantity for operational reasons, so a board built on quantity finds
    THEM rather than the highest sellers. NULL means not yet re-read, and is
    shown, because hiding everything unread would empty the board on the day
    this ships.
  */
  try { await db().prepare("ALTER TABLE sold_watch ADD COLUMN personalizable INTEGER").run(); }
  catch { /* already there */ }
  await migrateMovesToHours();
  /*
    ROWS WRITTEN BEFORE THE PLAUSIBILITY RULE EXISTED.

    The filter only applies to readings taken after it shipped, so the board
    kept showing "2,997 sold" from history for as long as the window held it.
    A rule added later has to be applied backwards as well as forwards, or the
    fix is invisible for exactly as long as anybody is still looking.
  */
  await db().prepare("DELETE FROM sold_moves WHERE sold > ?").bind(MAX_UNITS_PER_READ).run();
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
const POD_SHELVES: { top: string; leaf: string; shelf: string }[] = [
  { top: "Clothing", leaf: "T-shirts", shelf: "T-shirts" },
  { top: "Clothing", leaf: "Sweatshirts", shelf: "Sweatshirts & Hoodies" },
  { top: "Clothing", leaf: "Hoodies", shelf: "Sweatshirts & Hoodies" },
  { top: "Clothing", leaf: "Tanks", shelf: "Tanks" },
  { top: "Clothing", leaf: "Bodysuits", shelf: "Baby Bodysuits" },
  { top: "Accessories", leaf: "Baseball & Trucker Caps", shelf: "Hats" },
  { top: "Accessories", leaf: "Hats & Caps", shelf: "Hats" },
  { top: "Accessories", leaf: "Hats", shelf: "Hats" },
  { top: "Bags & Purses", leaf: "Totes", shelf: "Tote Bags" },
  { top: "Home & Living", leaf: "Mugs", shelf: "Mugs" },
  { top: "Home & Living", leaf: "Throw Pillows", shelf: "Throw Pillows" },
  { top: "Home & Living", leaf: "Blankets & Throws", shelf: "Blankets" },
  { top: "Home & Living", leaf: "Baby Blankets", shelf: "Baby Blankets" },
  { top: "Art & Collectibles", leaf: "Prints", shelf: "Wall Art" },
  { top: "Paper & Party Supplies", leaf: "Stickers", shelf: "Stickers" },
  { top: "Electronics & Accessories", leaf: "Phone Cases", shelf: "Phone Cases" },
];

/**
 * THE SHELVES A SELLER RECOGNISES, IN AN ORDER THAT DOES NOT MOVE.
 *
 * The board was labelled with Etsy's own leaf names, which are an internal
 * filing system rather than a set of products anybody shops for. That gave a
 * tab row of "Baby Blankets, Throws, Quilts, Weighted Blankets" — four names
 * for one thing — while Sweatshirts and Hoodies sat under the depth threshold
 * separately and neither appeared at all. It read as random because it was:
 * the shelves were whatever Etsy's taxonomy happened to hand back that day.
 *
 * Mapping the leaves onto a fixed list fixes the randomness and the depth in
 * one move, because the names that were splitting a shelf three ways now add
 * up. Ordered deliberately, apparel first, so the row is the same every
 * morning and a seller learns where to look.
 */
export const SHELF_ORDER = [
  "T-shirts",
  "Sweatshirts & Hoodies",
  "Tanks",
  "Baby Bodysuits",
  "Hats",
  "Tote Bags",
  "Mugs",
  "Blankets",
  "Baby Blankets",
  "Throw Pillows",
  "Wall Art",
  "Stickers",
  "Phone Cases",
];

/**
 * BRANCHES INSIDE A SHELF THAT ARE NOT THE SHELF.
 *
 * "Monopoly GO! Instant Delivery" reached the board under Digital Prints,
 * which Etsy files beneath Prints — so taking a shelf and everything under it
 * took the digital half of it too. These cannot be caught by listing_type
 * either: plenty of sellers list a digital good as physical.
 *
 * A short list of subtrees to leave out is the honest fix. It is short because
 * it names branches rather than products, and it is matched as a path prefix
 * so it also removes whatever Etsy later files underneath them.
 */
const NOT_PRINTABLE = [
  "Art & Collectibles > Prints > Digital Prints",
  /* Signs, mirrors, metal art and neon. A $50 custom neon sign reached the
     board through Wall Decor, which is not a thing anybody prints. */
  "Home & Living > Home Decor > Wall Decor > Signs",
  "Craft Supplies & Tools",
  "Paper & Party Supplies > Paper > Stationery > Design & Templates",
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
export async function shelfIds(): Promise<{ id: number; label: string; path: string }[]> {
  const rows = (await db().prepare(
    `SELECT taxonomy_id,name,top,path FROM sold_taxonomy
      WHERE (${POD_SHELVES.map(() => "(top = ? AND name = ?)").join(" OR ")})`)
    .bind(...POD_SHELVES.flatMap(shelf => [shelf.top, shelf.leaf])).all()).results as unknown as
    { taxonomy_id: number; name: string; top: string; path: string }[];

  const shelfOf = new Map(POD_SHELVES.map(entry => [`${entry.top}|${entry.leaf}`, entry.shelf]));

  /*
    EVERY NODE WITH THAT NAME IN THAT DEPARTMENT, NOT JUST ONE.

    Etsy has a "T-shirts" under men's, women's, unisex and kids. Keeping only
    one of them — the shallowest — meant three quarters of the t-shirts on
    Etsy were outside the shelf that exists to hold them. They are all
    t-shirts; a seller choosing a blank does not care which sub-department
    Etsy filed them in.
  */
  return rows.map(row => ({
    id: Number(row.taxonomy_id),
    label: shelfOf.get(`${row.top}|${row.name}`) ?? row.name,
    path: String(row.path ?? ""),
  }));
}

/**
 * EVERY NODE UNDER A SHELF, MAPPED TO THE SHELF A SELLER RECOGNISES.
 *
 * Two things at once, because they are the same walk of the tree.
 *
 * FIRST, descendants. Etsy files a listing on the most specific node it fits,
 * which is usually a child of the shelf — matching the shelf id alone made
 * T-shirts vanish from the board entirely, silently, which is indistinguishable
 * from nobody buying t-shirts.
 *
 * SECOND, the label. Etsy's leaf names are an internal filing system, not
 * products anybody shops for: "Baby Blankets", "Throws", "Quilts" and
 * "Weighted Blankets" are four names for one shelf. Each node resolves to the
 * seller-facing shelf instead, so those names add up rather than splitting a
 * category four ways and dropping all of them below the depth threshold.
 *
 * The DEEPEST matching shelf wins, so "Baby Blankets" lands in Baby & Kids
 * rather than the Blankets shelf it happens to sit beneath.
 */
export async function shelfByTaxonomy(): Promise<Map<number, string>> {
  const shelves = await shelfIds();
  if (!shelves.length) return new Map();

  /*
    THE PREFIX MATCH HAPPENS HERE, NOT IN SQL. Fifteen OR'd LIKE clauses on
    paths this long is "LIKE or GLOB pattern too complex" from D1, which took
    the whole board down with a 500 — and resolving to an IN list trades one
    limit for another, since fifteen shelves have hundreds of descendants. The
    taxonomy is a few thousand rows and changes about never.
  */
  const all = (await db().prepare("SELECT taxonomy_id,path FROM sold_taxonomy").all())
    .results as unknown as { taxonomy_id: number; path: string }[];
  const under = (path: string, root: string) => path === root || path.startsWith(`${root} > `);

  const out = new Map<number, string>();
  for (const row of all) {
    const path = String(row.path ?? "");
    /* A branch inside a shelf that is not the shelf. */
    if (NOT_PRINTABLE.some(excluded => under(path, excluded))) continue;
    let best: { label: string; depth: number } | null = null;
    for (const shelf of shelves) {
      if (!shelf.path || !under(path, shelf.path)) continue;
      const depth = shelf.path.split(">").length;
      if (!best || depth > best.depth) best = { label: shelf.label, depth };
    }
    if (best) out.set(Number(row.taxonomy_id), best.label);
  }
  return out;
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
      /*
        A LISTING WITH NO SAVES HAS NOT EARNED A SLOT.

        The corpus was eleven thousand listings of very mixed quality, and a
        large share of them had never been saved by anybody. Each one still
        occupied a place in the watch list and still cost a share of a call
        every four hours, forever, to confirm again that nothing had happened.

        Sales on Etsy are heavily concentrated, so coverage is not the same
        thing as accuracy: watching a hundred thousand listings that people
        actually want beats watching a million at random. Saves are the
        cheapest available proof that a listing is alive, they arrive free in
        the search response, and requiring them turns every slot in the corpus
        into one worth reading.
      */
      const writes = rows
        .filter(row => Number.isSafeInteger(Number(row.listing_id)))
        .filter(row => (Number(row.num_favorers) || 0) >= MIN_SAVES_TO_WATCH)
        /*
          A SLOT SPENT ON A LEATHER HANDBAG IS A SLOT NOT SPENT ON SOMETHING
          PRINTABLE. Etsy files a $212 genuine leather tote and a merino wool
          tank on the same shelves as their printed equivalents, and both
          reached the live board. The shelf is right; the product is
          unreachable for anybody reading this page.
        */
        .filter(row => printable({
          title: String(row.title ?? ""),
          product: shelf.label,
          price: row.price?.amount != null && row.price?.divisor
            ? Number(row.price.amount) / Number(row.price.divisor) : null,
        }))
        .map(row => db().prepare(
          /* IGNORE, not REPLACE: a listing already in the corpus carries its
             last reading, and overwriting it here would erase the very number
             the next sweep subtracts from. */
          `INSERT OR IGNORE INTO sold_watch (listing_id,shop_id,title,url,taxonomy_id)
           VALUES (?,?,?,?,?)`)
          .bind(
            Number(row.listing_id), Number(row.shop_id) || null,
            String(row.title ?? "").slice(0, 300), String(row.url ?? ""),
            Number.isFinite(Number(row.taxonomy_id)) ? Number(row.taxonomy_id) : shelf.id,
            Number(row.num_favorers) || 0));
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
      /*
        PRICES IN ONE CURRENCY, BECAUSE A BOARD IS A COMPARISON.

        Thirty-nine per cent of the live board came back in GBP, EUR, PHP, HKD
        and the rest, and a column reading ₱1,710.54 next to $26.97 cannot be
        read down.

        AND THE SHOP COMES BACK ON THE SAME CALL. `includes=Shop` attaches
        transaction_sold_count — Etsy's own exact count of completed sales for
        that shop — for no extra request. That number is what turns a quantity
        drop from a guess into something corroborated: see the gate and the cap
        where the board is read.
      */
      `listings/batch?listing_ids=${batch.map(r => r.listing_id).join(",")}&includes=Images,Shop&currency=USD`);
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
    /* One row per shop per sweep, not one per listing in it. */
    const shopsSeen = new Map<number, { sold: number; active: number | null }>();
    for (const row of rows) {
      const shopId = Number(row.shop?.shop_id ?? row.shop_id);
      const soldCount = Number(row.shop?.transaction_sold_count);
      if (Number.isSafeInteger(shopId) && Number.isFinite(soldCount))
        shopsSeen.set(shopId, {
          sold: soldCount,
          active: Number.isFinite(Number(row.shop?.listing_active_count))
            ? Number(row.shop?.listing_active_count) : null,
        });
    }
    for (const [shopId, seen] of shopsSeen)
      writes.push(db().prepare(
        `INSERT INTO shop_sold (shop_id,bucket,sold_count,active_count) VALUES (?,?,?,?)
         ON CONFLICT(shop_id,bucket) DO UPDATE SET
           sold_count=excluded.sold_count, active_count=excluded.active_count`)
        .bind(shopId, hourOf(), seen.sold, seen.active));

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
      /* An inventory change is filed alongside a restock: both are the shelf
         being rearranged rather than bought from. */
      const restocked = move.restocked || move.inventoryChange ? 1 : 0;
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
        `UPDATE sold_watch SET reads=reads+1,shop_id=COALESCE(?,shop_id),quantity=?,favorites=?,views=?,state=?,listing_type=COALESCE(?,listing_type),image=COALESCE(?,image),
           personalizable=?,
           price_cents=COALESCE(?,price_cents),currency=COALESCE(?,currency),
           title=CASE WHEN ?='' THEN title ELSE ? END,url=CASE WHEN ?='' THEN url ELSE ? END,
           taxonomy_id=COALESCE(?,taxonomy_id),last_read=?
         WHERE listing_id=?`)
        .bind(
          Number.isSafeInteger(Number(row.shop?.shop_id ?? row.shop_id))
            ? Number(row.shop?.shop_id ?? row.shop_id) : null,
          now, favorites, views, String(row.state ?? ""),
          row.listing_type ? String(row.listing_type) : null, image,
          row.is_personalizable ? 1 : 0, price,
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

  /*
    GIVE UP ON WHAT WILL NOT MOVE, AND FREE THE SLOT.

    A listing that has been looked at a dozen times without ever being bought,
    and that nobody has saved either, is not going to start. Left in place it
    costs a share of a call every four hours forever and contributes nothing;
    removed, that quota goes to a listing that might. This is what lets the
    corpus grow into the useful range instead of filling up with the dead.

    Anything that has ever sold is kept regardless of its saves. A listing that
    has proven it sells has already answered the only question being asked.
  */
  await db().prepare(
    `DELETE FROM sold_watch
      WHERE reads >= ?
        AND favorites < ?
        AND listing_id NOT IN (SELECT DISTINCT listing_id FROM sold_moves WHERE sold > 0)`)
    .bind(PATIENCE, MIN_SAVES_TO_WATCH).run();

  /* Downloads never belong here, however long they have been sitting in it. */
  await db().prepare("DELETE FROM sold_watch WHERE listing_type IS NOT NULL AND listing_type <> 'physical'").run();

  /*
    KEEP THIRTY DAYS, THEN LET GO.

    A window is only real if the observations behind it survive long enough to
    be subtracted, so nothing may be pruned inside the longest window the board
    offers. Thirty days is comfortably past the seven-day view and leaves room
    for a monthly one later. Past that the rows are dead weight: D1 is not
    large, and an unbounded moves table would eventually crowd out the corpus
    that produces it.
  */
  const keepFrom = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString().slice(0, 13);
  await db().prepare("DELETE FROM sold_moves WHERE bucket < ?").bind(keepFrom).run();
  await db().prepare("DELETE FROM shop_sold WHERE bucket < ?").bind(keepFrom).run();

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
             found?: number; watched?: number; spentToday?: number;
             shelves?: string[]; shelvesMissing?: string[] }> {
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
    const landed = new Set(shelves.map(shelf => shelf.label));
    return { ran: true, read: result.read, sold: result.sold, done: result.done,
             found, watched: Number(watched?.n) || 0, spentToday: result.spentToday,
             shelves: [...landed],
             /* Named, not counted. A shelf that failed to resolve looks exactly
                like a shelf nobody buys from, and that is how eleven of them
                went unnoticed once already. */
             /* Compared against the SHELF names, not Etsy's leaf names. The
                first version listed leaves against labels, which can never
                match, so it reported ten shelves missing while every one of
                them was resolving perfectly. A broken alarm is worse than no
                alarm: it taught me to ignore it. */
             shelvesMissing: [...new Set(POD_SHELVES.map(shelf => shelf.shelf))]
               .filter(shelf => !landed.has(shelf)) };
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
  sold: number; attribution: Attribution | null; soldOut: boolean; savesGained: number;
  product: string;
};
export type SoldBoard = {
  night: string | null;
  watched: number;
  totalSold: number;
  building: boolean;
  hoursBack: number;
  /** How much of that window there is actually data for. */
  coveredHours: number;
  products: { key: string; label: string; sold: number; listings: number }[];
  listings: SoldListing[];
};

/** How many selling listings a category needs before it earns its own tab. */
export const SHELF_MINIMUM = 30;

/**
 * THE TWO WAYS OF ASKING THE SAME QUESTION.
 *
 * "What sold this week" is the one a seller plans against: a week is long
 * enough that a single good day cannot fake it, so what rises is a design
 * people keep buying. "What sold overnight" is the one they open the tab for:
 * shorter, sharper, and the only view that can catch something the moment it
 * starts moving.
 *
 * Same counted number underneath, two different lengths of look. That is why
 * one lives inside the other rather than beside it as a rival feature.
 */
export const VIEWS = {
  week: { hours: 168, label: "This week", unit: "sold this week" },
  overnight: { hours: 24, label: "Overnight", unit: "sold overnight" },
} as const;
export type ViewKey = keyof typeof VIEWS;

/**
 * READ THE BOARD. No Etsy traffic — everything here was counted overnight.
 *
 * `product` is Etsy's own top-level category for the listing, so the shelves
 * are the real ones rather than a guess from the title.
 */
export async function readBoard(limit = 400, hoursBack = 24, madeToOrder = false,
  rights = false): Promise<SoldBoard> {
  await ensureTables();

  /*
    ONLY THE SHELVES THIS TOOL DELIBERATELY STOCKS.

    A "Same Day Good Weather Manifesting Letter" reached the live board under a
    category literally called Digital. It slipped past the download filter
    because that filter can only judge a listing once it has been read, and
    anything unread is assumed physical so that new arrivals are not hidden.

    Blocklisting category names would be a game of catch-up against Etsy's
    whole tree. The real rule is narrower and needs no maintenance: this board
    shows print-on-demand products, the shelves are chosen on purpose, and
    anything outside them — legacy rows from the old keyword seeding included —
    has no business here whatever it is.
  */
  const shelfOf = await shelfByTaxonomy();
  if (!shelfOf.size)
    return { night: null, watched: 0, totalSold: 0, building: false, hoursBack,
             coveredHours: 0, products: [], listings: [] };
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

  /*
    HOW FAR BACK THE COUNTING ACTUALLY GOES.

    The board offered "this week" on a day and a half of history and put
    "sold this week" under every number. Nobody sold anything over a week we
    were not watching. The page is told the real span so it can say the true
    thing instead.
  */
  const first = await db().prepare("SELECT MIN(bucket) b FROM sold_moves").first() as
    { b: string | null } | null;
  const firstSeen = first?.b ? new Date(`${first.b}:00:00Z`).getTime() : Date.now();
  const coveredHours = Math.max(1, Math.round((Date.now() - Math.max(
    firstSeen, Date.now() - hoursBack * 3_600_000)) / 3_600_000));

  const rows = (await db().prepare(
    `SELECT m.listing_id, SUM(m.sold) sold, MAX(m.sold_out) sold_out,
            SUM(m.saves_gained) saves_gained, MIN(m.quantity_after) quantity_after,
            w.title,w.url,w.image,w.price_cents,w.currency,w.taxonomy_id,w.shop_id,
            COALESCE(t.name,'Other') product
       FROM sold_moves m
       JOIN sold_watch w ON w.listing_id=m.listing_id
       LEFT JOIN sold_taxonomy t ON t.taxonomy_id=w.taxonomy_id
      WHERE m.bucket>=? AND m.sold>0 AND m.sold<=?
        AND COALESCE(w.listing_type,'physical')='physical'
        AND w.favorites > 0
        /* Made to order is hidden unless asked for. NULL means "not re-read
           since this column existed", not "not personalised", so it stays
           visible rather than emptying the board on the day this ships. */
        AND (?=1 OR COALESCE(w.personalizable,0)=0)
        /*
          ETSY'S SIX-HOUR FRESHNESS RULE, ENFORCED RATHER THAN ASSUMED.

          Confirmed in writing by Etsy on 13 September 2026 as applying to
          aggregate figures too, not just titles and images. The sweep re-reads
          every four hours, so in normal running nothing is near this — but a
          sweep that falls behind, or a listing Etsy stops returning, would
          otherwise leave a row sitting on the board for days. It is dropped
          instead. A thinner board is compliant; a stale one is not.
        */
        AND w.last_read IS NOT NULL AND w.last_read >= ?
      GROUP BY m.listing_id
      ORDER BY sold DESC, saves_gained DESC
      LIMIT ?`)
    /*
      TRUNCATE LAST, NOT FIRST.

      This used to fetch six hundred rows ordered by units and let the filters
      below thin them. That is the wrong order and it was costing most of the
      board: the shelf filter, the trademark filter and the made-to-order
      filter all run after this query, so anything they remove was a slot that
      could have been filled from the tail — and the tail never left the
      database. Measured on live data, four hundred returned rows came down to
      seventy-four survivors, while the watch set had recorded thousands of
      sales in the same window.

      So the window's movers all come back and the trimming happens at the very
      end, after everything that can disqualify a row has had its say. The
      ceiling here is a runaway guard, not a page size — rows are cheap and a
      day's sales across the whole watch set is thousands, not millions.
    */
    .bind(since, MAX_UNITS_PER_READ, madeToOrder ? 1 : 0,
          new Date(Date.now() - DISPLAY_MAX_AGE_HOURS * 3_600_000).toISOString(),
          50_000)
    .all()).results as unknown as {
        listing_id: number; sold: number; sold_out: number; saves_gained: number;
        quantity_after: number | null; title: string; url: string; image: string | null;
        price_cents: number | null; currency: string | null; taxonomy_id: number | null;
        shop_id: number | null; product: string;
      }[];

  /*
    THE GATE AND THE CAP, BEFORE ANYTHING IS RANKED.

    A quantity drop is the only per-listing signal Etsy offers and it is not
    trustworthy on its own. Etsy's own count of what each SHOP sold is exact,
    and although it can never be divided across listings without inventing a
    number, it can say whether a drop coincided with a real sale and bound how
    big that drop is allowed to be.

    Applied here rather than after ranking, because a figure capped afterwards
    has already spent the morning at the top of the board.
  */
  const shopFacts = new Map<number, { soldDelta: number; activeCount: number | null; watchedCount: number }>();
  {
    const shopIds = [...new Set(rows.map(r => Number(r.shop_id)).filter(Number.isSafeInteger))];
    if (shopIds.length) {
      /* Earliest and latest reading of each shop's cumulative count inside the
         window. Two observations, one subtraction, no modelling. */
      const observations = (await db().prepare(
        `SELECT shop_id,
                MIN(sold_count) AS first_seen,
                MAX(sold_count) AS last_seen,
                MAX(active_count) AS active_count
           FROM shop_sold
          WHERE bucket>=?
          GROUP BY shop_id`).bind(since).all()).results as unknown as {
            shop_id: number; first_seen: number; last_seen: number; active_count: number | null;
          }[];
      const watched = (await db().prepare(
        `SELECT shop_id, COUNT(*) n FROM sold_watch
          WHERE shop_id IS NOT NULL AND (listing_type IS NULL OR listing_type='physical')
          GROUP BY shop_id`).all()).results as unknown as { shop_id: number; n: number }[];
      const watchedBy = new Map(watched.map(r => [Number(r.shop_id), Number(r.n)]));

      for (const row of observations)
        shopFacts.set(Number(row.shop_id), {
          soldDelta: shopDelta(Number(row.first_seen), Number(row.last_seen)),
          activeCount: row.active_count == null ? null : Number(row.active_count),
          watchedCount: watchedBy.get(Number(row.shop_id)) ?? 0,
        });
    }
  }

  const allowed = new Map<number, { sold: number; attribution: Attribution }>();
  for (const row of attribute(
    rows.map(r => ({
      listingId: Number(r.listing_id),
      shopId: Number.isSafeInteger(Number(r.shop_id)) ? Number(r.shop_id) : null,
      sold: Number(r.sold),
    })),
    shopFacts,
  )) allowed.set(row.listingId, { sold: row.sold, attribution: row.attribution });

  /*
    UNTIL A SHOP HAS BEEN READ TWICE THERE IS NOTHING TO GATE AGAINST.

    On the first sweeps after this ships, shop_sold holds one observation and
    every delta is zero, which would empty the board completely. Rather than
    show nothing, the gate only takes effect once there are shop readings to
    compare — and says so, so the page can be honest about which it is.
  */
  const gateReady = shopFacts.size > 0 &&
    [...shopFacts.values()].some(facts => facts.soldDelta > 0);

  /* Only what sits on a shelf this tool stocks, labelled by that shelf rather
     than by Etsy's internal leaf name. */
  const onShelf = rows
    .filter(row => !gateReady || allowed.has(Number(row.listing_id)))
    /* The corpus already holds thousands taken in before this rule existed,
       so it is applied on the way out as well as the way in. */
    .filter(row => printable({
      title: row.title,
      product: shelfOf.get(Number(row.taxonomy_id)) ?? null,
      price: row.price_cents == null ? null : Number(row.price_cents) / 100,
    }))
    .map(row => {
      const verified = allowed.get(Number(row.listing_id));
      return verified ? { ...row, sold: verified.sold } : row;
    })
    .filter(row => shelfOf.has(Number(row.taxonomy_id)))
    /*
      SOMEBODY ELSE'S TRADEMARK IS NOT A DESIGN IDEA. Filtered here, before the
      shelf counts and before the board is trimmed, so a hidden row cannot
      occupy a slot or inflate a tab.
    */
    /*
      A "Philly Eagles Sweatshirt" reached this board. The leagues police their
      marks harder than almost anybody, and putting one in front of a seller as
      inspiration is handing them the listing that closes their shop. The
      rights list did not carry the teams; the trademark checker does, so both
      are consulted rather than the same list being maintained twice.
    */
    .filter(row => rights || (!tradesOnRights(row.title) && !mentionsAMark(row.title)))
    .map(row => ({ ...row, product: shelfOf.get(Number(row.taxonomy_id))! }));

  /*
    THE TABS ARE COUNTED BEFORE THE BOARD IS TRIMMED.

    Sweatshirts & Hoodies had twenty-seven listings against a threshold of
    thirty and so had no tab — except twenty-seven was how many survived into
    the top four hundred by volume, not how many were selling. A shelf full of
    steady, modest sellers gets squeezed out of that slice by one full of loud
    ones, then judged as though it were empty. Depth is a property of the
    shelf, so it is measured across the shelf.
  */
  const perProduct = new Map<string, { sold: number; listings: number }>();
  for (const row of onShelf) {
    const at = perProduct.get(row.product) ?? { sold: 0, listings: 0 };
    at.sold += Number(row.sold); at.listings++;
    perProduct.set(row.product, at);
  }

  const shown = onShelf.slice(0, limit);

  /*
    A SHELF WITH ONE THING ON IT IS NOT A SHELF.

    A tab reading "Throw Pillows 1" invites a click that leads to a single
    card and a dead end — it makes the board look empty in exactly the place
    it was meant to look useful. Categories below the threshold are still on
    the board under Everything; they simply do not get a tab of their own
    until there is something behind it.
  */
  return {
    night: onShelf.length ? new Date().toISOString().slice(0, 10) : null,
    watched: Number(state?.watched) || 0,
    totalSold: onShelf.reduce((sum, r) => sum + Number(r.sold), 0),
    building: Boolean(state?.building_since),
    hoursBack,
    coveredHours,
    /*
      A FIXED ROW IN A FIXED ORDER.

      Sorting the tabs by volume meant the row rearranged itself every morning
      and a seller had to re-find their shelf each time. Ordered by
      SHELF_ORDER, apparel first, so it is the same row every day; a shelf with
      nothing in this window simply is not drawn.
    */
    products: SHELF_ORDER
      .filter(shelf => (perProduct.get(shelf)?.listings ?? 0) >= SHELF_MINIMUM)
      .map(shelf => ({
        key: shelf, label: shelf,
        sold: perProduct.get(shelf)!.sold,
        listings: perProduct.get(shelf)!.listings,
      })),
    listings: shown.map(r => ({
      listingId: Number(r.listing_id),
      title: r.title,
      url: r.url,
      image: r.image,
      /* One column, one currency. Etsy accepts the conversion parameter and
         ignores it, so it is done here or not at all. */
      price: usdFromCents(r.price_cents == null ? null : Number(r.price_cents), r.currency),
      currency: "USD",
      sold: Number(r.sold),
      attribution: allowed.get(Number(r.listing_id))?.attribution ?? null,
      soldOut: Boolean(r.sold_out),
      savesGained: Number(r.saves_gained) || 0,
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


/**
 * LOOK UP A PHRASE AGAINST WHAT ACTUALLY SOLD.
 *
 * This used to call Etsy's search and print the answer under the heading "TOP
 * ON ETSY FOR ...". It was not top anything. Etsy's relevance order weighs
 * keyword match and gives new listings a deliberate boost, so a search for
 * "jesus shirt" came back with ten listings that between them had almost no
 * saves, under a heading claiming they were the best on the site. It is the
 * same false claim as "top 30", made by a different endpoint.
 *
 * The honest version searches the thing this page already knows: listings we
 * have watched sell, ranked by how many actually went. It costs no Etsy calls,
 * it says the same kind of true sentence as the rest of the board, and when a
 * phrase has nothing behind it the answer is "nothing sold for that", which is
 * a real answer rather than a filler list.
 */
export async function searchSold(keyword: string, hoursBack = 168, limit = 24) {
  await ensureTables();
  const shelfOf = await shelfByTaxonomy();
  if (!shelfOf.size) return [];

  /* A few words, ANDed. Not a phrase match: "jesus shirt" should find
     "Jesus Loves You Comfort Colors Shirt". */
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return [];

  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString().slice(0, 13);
  const where = words.map(() => "LOWER(w.title) LIKE ?").join(" AND ");

  const rows = (await db().prepare(
    `SELECT m.listing_id, SUM(m.sold) sold, w.title, w.url, w.image,
            w.price_cents, w.currency, w.taxonomy_id
       FROM sold_moves m
       JOIN sold_watch w ON w.listing_id=m.listing_id
      WHERE m.bucket>=? AND m.sold>0 AND m.sold<=?
        AND COALESCE(w.listing_type,'physical')='physical'
        AND w.favorites > 0
        /* Same six-hour rule: this shows listing content too. */
        AND w.last_read IS NOT NULL AND w.last_read >= ?
        AND ${where}
      GROUP BY m.listing_id
      ORDER BY sold DESC
      LIMIT ?`)
    .bind(since, MAX_UNITS_PER_READ,
          new Date(Date.now() - DISPLAY_MAX_AGE_HOURS * 3_600_000).toISOString(),
          ...words.map(word => `%${word}%`), limit * 4)
    .all()).results as unknown as {
      listing_id: number; sold: number; title: string; url: string; image: string | null;
      price_cents: number | null; currency: string | null; taxonomy_id: number | null;
    }[];

  return rows
    .filter(row => shelfOf.has(Number(row.taxonomy_id)))
    .slice(0, limit)
    .map(row => ({
      listingId: Number(row.listing_id),
      title: row.title,
      url: row.url,
      image: row.image,
      /* Same column, same currency, same reason as the board. */
      price: usdFromCents(row.price_cents == null ? null : Number(row.price_cents), row.currency),
      currency: "USD",
      sold: Number(row.sold),
      product: shelfOf.get(Number(row.taxonomy_id))!,
    }));
}
