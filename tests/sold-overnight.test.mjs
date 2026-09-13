import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---------------------------------------------------------------- the rule */

/* The subtraction is imported and run, not read. It is the only thing standing
   between "six of these sold last night" and a fabrication. */
const { movement } = await import("../app/sold-overnight-math.ts")
  .catch(async () => {
    /* Node cannot import .ts directly on every version; fall back to the
       compiled output the build already produced. */
    return await import("../dist/server/index.js").then(() => { throw new Error("unreachable"); });
  });

test("a fall in stock is counted as exactly that many sales", () => {
  assert.deepEqual(movement(295, 294),
    { units: 1, restocked: false, soldOut: false, inventoryChange: false, record: true });
  assert.deepEqual(movement(904, 899),
    { units: 5, restocked: false, soldOut: false, inventoryChange: false, record: true });
});

test("a first reading can never post a sale", () => {
  /* The night a listing joins the corpus there is nothing to subtract from.
     Treating the missing previous value as zero would score its whole stock as
     sold and put a brand new watch at the top of the board on day one. */
  assert.equal(movement(null, 999).units, 0);
  assert.equal(movement(null, 999).record, false);
});

test("a restock is never a negative sale", () => {
  /* One shop refilling its stock must not be able to subtract other people's
     real purchases from the day's total. */
  const up = movement(40, 300);
  assert.equal(up.units, 0);
  assert.equal(up.restocked, true);
  assert.equal(up.record, true);
});

test("stock reaching zero is sold out, and staying at zero is not", () => {
  assert.equal(movement(3, 0).soldOut, true);
  assert.equal(movement(3, 0).units, 3);
  assert.equal(movement(0, 0).soldOut, false);
  assert.equal(movement(0, 0).record, false);
});

test("an unchanged listing produces no row at all", () => {
  /* Writing a zero for every unmoved listing every night would turn a hundred
     thousand watched listings into a hundred thousand rows a night of nothing. */
  assert.equal(movement(500, 500).record, false);
});

test("a missing stock figure is not treated as zero", () => {
  assert.equal(movement(500, null).units, 0);
  assert.equal(movement(500, null).record, false);
});

/* ------------------------------------------------------------- the contract */

test("the corpus is seeded from Etsy's score order, not its default", () => {
  /* listings/active is newest-first unless told otherwise, and the newest
     listings are precisely the ones that have not sold anything — a corpus of
     them would be a board of zeroes. This was caught in testing and must not
     come back. */
  const source = read("sold-overnight.ts");
  const discover = source.slice(source.indexOf("export async function discover"),
    source.indexOf("export async function sweep"));
  /* Every listings/active request the corpus builder makes must carry the
     sort, however the URL happens to be assembled across lines. */
  const requests = [...discover.matchAll(/listings\/active[\s\S]{0,240}?\);/g)].map(m => m[0]);
  assert.ok(requests.length, "discovery must make a listings/active request");
  for (const request of requests)
    assert.match(request, /sort_on=score/, "discovery must ask Etsy for score order");
});

test("discovery can never overwrite last night's reading", () => {
  /* Re-finding a listing already in the corpus must not reset its stored
     stock: that number is exactly what tonight's sweep subtracts from, and
     wiping it would silently zero the sale. */
  const source = read("sold-overnight.ts");
  assert.match(source, /INSERT OR IGNORE INTO sold_watch/);
  assert.doesNotMatch(source, /INSERT OR REPLACE INTO sold_watch/);
});

test("time is measured in UTC on both sides", () => {
  /* Mixing a UTC timestamp with a local calendar date is what once generated
     fourteen hundred phantom drop days in this codebase. */
  const source = read("sold-overnight.ts");
  assert.match(source, /hourOf\s*=\s*\(at: Date = new Date\(\)\)\s*=>\s*at\.toISOString\(\)\.slice\(0, 13\)/);
  assert.doesNotMatch(strip(source), /getFullYear\(\)|setHours\(|getDay\(\)/);
});

test("the board reads a rolling window, not a calendar day", () => {
  /* Filing by day meant the board could only answer "what sold since midnight
     UTC" — at eight in the morning a thin arbitrary slice, at one past
     midnight nothing at all, and always an invitation to come back later. */
  const source = read("sold-overnight.ts");
  assert.match(source, /hoursBack \* 3_600_000/);
  assert.match(source, /WHERE m\.bucket>=\?/);
});

test("the sweep has a hard daily ceiling it cannot exceed", () => {
  /* A corpus that grows unexpectedly must not be able to quietly eat the
     quota that publishing depends on. */
  const source = read("sold-overnight.ts");
  assert.match(source, /DAILY_CEILING/);
  assert.match(source, /spentToday >= DAILY_CEILING/);
});

test("a listing is re-read on an interval, not once a day", () => {
  const source = read("sold-overnight.ts");
  assert.match(source, /REFRESH_HOURS \* 3_600_000/);
});

test("a shelf with almost nothing on it does not get a tab", () => {
  /* A tab reading "Throw Pillows 1" invites a click that leads to one card
     and a dead end. */
  const source = read("sold-overnight.ts");
  assert.match(source, /SHELF_MINIMUM = 30/);
  assert.match(source, /at\.listings >= SHELF_MINIMUM/);
});

test("the scheduled sweep cannot be triggered from outside the worker", () => {
  /* Cloudflare stamps cf-connecting-ip on everything that arrives from the
     internet and cannot be talked out of it. A Request built inside the worker
     has no such header, so its absence is proof of origin — no token to leak,
     nothing to rotate, and no way for a stranger to burn the Etsy allowance. */
  const source = read("api/sold-overnight/cron/route.ts");
  assert.match(source, /cf-connecting-ip"\) !== null/);
  assert.match(source, /status: 404/);
});

test("listings Etsy did not return still advance the sweep", () => {
  /* Otherwise the same hundred ids are requested forever and the sweep never
     reaches the rest of the corpus. */
  const source = read("sold-overnight.ts");
  assert.match(source, /const answered = new Set/);
  assert.match(source, /if \(!answered\.has/);
});

test("publishing outranks the overnight count for Etsy capacity", () => {
  /* Somebody's batch going out is what they paid for. */
  const source = read("sold-overnight.ts");
  assert.match(source, /BUDGET_FLOOR/);
  assert.match(source, /budget\.remaining < BUDGET_FLOOR/);
});

test("reading the board costs no Etsy calls", () => {
  /* The whole economics of this feature is that the count is paid for once a
     night and read by everybody. A fetch on the read path would make it cost
     per seller and it would not survive launch. */
  const source = read("sold-overnight.ts");
  const board = source.slice(source.indexOf("export async function readBoard"));
  assert.doesNotMatch(board, /fetch\(|etsyGet\(/);
});

test("the page states what it counted and never claims more", () => {
  const surfaces = [read("sold-overnight.ts"), read("sold-overnight/page.tsx"),
    read("api/sold-overnight/route.ts")];
  for (const source of surfaces)
    for (const forbidden of [/best[- ]?sell/i, /top[- ]?sell/i, /trending/i, /revenue/i, /trending now/i])
      assert.doesNotMatch(strip(source), forbidden,
        `Sold Overnight must state only what it counted: ${forbidden}`);
});

test("the page explains what the numbers mean without describing the plumbing", () => {
  /* A number this strong has to say what it is, or the first person to doubt
     it has nowhere to look. What it must NOT do is narrate the mechanism —
     a seller does not need to know anything is being compared, and telling
     them makes a confident number sound like a workaround. */
  const page = read("sold-overnight/page.tsx");
  assert.match(page, /What these numbers mean/);
  assert.match(page, /real sales on Etsy/i);
  for (const leak of [/stock/i, /compare/i, /reading before/i, /listings we watch/i])
    assert.doesNotMatch(strip(page), leak,
      `the page must not describe how the count is produced: ${leak}`);
});

test("the card never prints somebody else's inventory", () => {
  /* "171,447 left" is another shop's stock level: no use to a seller deciding
     what to make, and a straight description of the plumbing. */
  const page = read("sold-overnight/page.tsx");
  assert.doesNotMatch(strip(page), /listing\.left/);
  assert.doesNotMatch(strip(page), /left`/);
});

test("pages=0 really means no discovery", () => {
  /* `Number("0") || 1` is 1. The first version of the build route used that
     pattern and ran discovery on every request that asked for none, silently,
     while reporting sixteen hundred listings found. Zero is a legitimate value
     for this parameter and must survive parsing. */
  const source = read("api/sold-overnight/build/route.ts");
  assert.doesNotMatch(source, /Number\(url\.searchParams\.get\([^)]*\)\)\s*\|\|/);
  assert.match(source, /raw === null \|\| raw\.trim\(\) === ""/);
});

test("a second pass in one night adds to the count rather than replacing it", () => {
  /* Sampling twice must not halve the day's total or double it — the move row
     accumulates, and each pass subtracts from what the previous pass stored. */
  const source = read("sold-overnight.ts");
  assert.match(source, /sold=sold\+excluded\.sold/);
});

test("the board shows sales the moment they are counted", () => {
  /* An earlier version keyed the board off a completion flag and rendered
     "the first night is being counted" while twenty-one real sales sat in the
     table — the page refusing to show numbers it already had. */
  const source = read("sold-overnight.ts");
  assert.doesNotMatch(source, /state\?\.last_night \? \{ night/);
  assert.match(source, /night: onShelf\.length \? new Date\(\)/);
});

test("the board groups by Etsy's leaf category, not its department", () => {
  /* "Home & Living" and "Craft Supplies & Tools" are true and useless — they
     do not tell a seller which blank to order. "Blankets & Throws" does. */
  const source = read("sold-overnight.ts");
  assert.match(source, /COALESCE\(t\.name,'Other'\) product/);
  assert.doesNotMatch(source, /COALESCE\(t\.top,'Other'\)/);
});

test("digital downloads stay off a print-on-demand board and stop costing quota", () => {
  /* Crochet patterns and PDF tutorials sell well and are no use to somebody
     choosing a blank. Once identified they are never read again. */
  const source = read("sold-overnight.ts");
  assert.match(source, /COALESCE\(w\.listing_type,'physical'\)='physical'/);
  assert.match(source, /listing_type IS NULL OR listing_type = 'physical'/);
});

test("the corpus is stocked shelf by shelf, thinnest first", () => {
  /* Seeding by keyword produced a corpus that was almost all blankets and
     stickers with no apparel in it at all — the words pulled unevenly and
     nothing corrected for it, so the board had a "Throw Pillows" tab with one
     thing behind it. Etsy's search takes a taxonomy filter, so each shelf is
     stocked directly and the emptiest is always served first. */
  const source = read("sold-overnight.ts");
  assert.match(source, /listings\/active\?taxonomy_id=\$\{shelf\.id\}/);
  assert.match(source, /\(counts\.get\(a\.id\) \?\? 0\) - \(counts\.get\(b\.id\) \?\? 0\)/);
  assert.doesNotMatch(source, /SEED_QUERIES/);
});

test("shelves are matched on department and leaf, never a hardcoded id", () => {
  /* Spelling out complete paths meant eleven of fifteen shelves silently
     failed to match — guessing Etsy's middle levels exactly is a coin flip,
     and a miss looks identical to a shelf nobody buys from. Department plus
     leaf disambiguates the nodes that share a name without depending on
     middle levels nobody ever sees. */
  const source = read("sold-overnight.ts");
  const shelves = source.slice(source.indexOf("const POD_SHELVES"), source.indexOf("];", source.indexOf("const POD_SHELVES")));
  assert.match(shelves, /\{ top: "Clothing", leaf: "T-shirts" \}/);
  assert.doesNotMatch(shelves, /\d{3,}/, "no raw taxonomy ids in the shelf list");
  assert.match(source, /\(top = \? AND name = \?\)/);
});

test("a run says which shelves it actually stocked", () => {
  /* A shelf whose lookup misses contributes nothing and looks exactly like a
     shelf nobody buys from. Silence there is how eleven missing shelves went
     unnoticed. */
  const source = read("sold-overnight.ts");
  assert.match(source, /shelvesMissing/);
  assert.match(source, /shelves: \[\.\.\.landed\]/);
});

test("the scheduled entry lives beside the bundle, not at the repo root", () => {
  /* wrangler runs with no_bundle, so it resolves modules relative to the
     directory holding `main` and uploads whatever matches the ESModule globs.
     An entry at the repository root makes that directory the repository, so
     **\/*.js starts matching node_modules and the deploy fails. This was not a
     theory — it silently failed one deploy. */
  const wrangler = readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"main":\s*"\.\/dist\/server\/scheduled-entry\.mjs"/);
  assert.match(wrangler, /"crons"/);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.build, /add-scheduled-handler/,
    "the entry is generated, so the build must generate it");
});

test("the generated entry re-exports the workflows it must not drop", () => {
  /* The worker's Workflows are named in wrangler config by class name. An
     entry that forgot to re-export them would deploy and then fail at runtime
     on the first draft creation. */
  const script = readFileSync(new URL("../scripts/add-scheduled-handler.mjs", import.meta.url), "utf8");
  for (const name of ["DraftCreationWorkflow", "PhotoDeliveryWorkflow"])
    assert.match(script, new RegExp(name), `the entry must re-export ${name}`);
});

test("changing a table's shape is migrated, never left to CREATE IF NOT EXISTS", () => {
  /* CREATE TABLE IF NOT EXISTS does nothing when the table already exists with
     a different shape, and reports success while doing it. sold_moves shipped
     keyed on `night`; switching the code to `bucket` produced "no such column:
     bucket" on every single sweep while the statement meant to define the new
     shape ran happily. */
  const source = read("sold-overnight.ts");
  /* And the detection must be a question the database cannot answer vaguely.
     PRAGMA table_info returns nothing through D1, so a guard built on it read
     "no columns, therefore no table, therefore nothing to do" and skipped the
     migration on every deploy while reporting success. */
  assert.doesNotMatch(strip(source), /PRAGMA table_info/);
  assert.match(source, /SELECT bucket FROM sold_moves LIMIT 1/);
  assert.match(source, /ALTER TABLE sold_moves_hourly RENAME TO sold_moves/);
  /* And the sales already counted are carried over, not discarded. */
  assert.match(source, /night \|\| 'T00'/);
});

test("the bucket index is not created before the table has that column", () => {
  /* ensureTables ran CREATE INDEX ... ON sold_moves (bucket) in its opening
     batch. Against a table still keyed on `night` that statement fails and
     takes the whole batch — and every sweep — with it. Three deploys of
     migration fixes went out before it turned out the error was never the
     migration at all, but the schema setup indexing a column that did not
     exist yet. */
  const source = read("sold-overnight.ts");
  const setup = source.slice(0, source.indexOf("await migrateMovesToHours()"));
  assert.doesNotMatch(setup, /CREATE INDEX IF NOT EXISTS idx_sold_moves_bucket/,
    "the bucket index must be created after the migration, not before it");
  const after = source.slice(source.indexOf("await migrateMovesToHours()"));
  assert.match(after, /CREATE INDEX IF NOT EXISTS idx_sold_moves_bucket/);
});

test("a drop too big to be shopping is not counted as sales", () => {
  /* The live board's top card read "2,997 sold" on a woven blanket that had
     gone from 5,994 to exactly half — a seller switching off variants, or
     Printify re-syncing. Nobody sold two thousand blankets in four hours. */
  const halved = movement(5994, 2997);
  assert.equal(halved.units, 0);
  assert.equal(halved.inventoryChange, true);

  const bulk = movement(95890, 93906);
  assert.equal(bulk.units, 0, "1,984 units between two readings is bookkeeping");
  assert.equal(bulk.inventoryChange, true);
});

test("a small listing selling out entirely still counts", () => {
  /* The share rule must not swallow the single most useful thing this board
     can report. Four left, four gone, is a real sell-out. */
  const gone = movement(4, 0);
  assert.equal(gone.units, 4);
  assert.equal(gone.soldOut, true);
  assert.equal(gone.inventoryChange, false);
});

test("ordinary sales on a deep shelf still count", () => {
  /* The observed real numbers — 43 off 837, 30 off 12,164, 25 off 72 — are
     exactly what the board exists to show and none of them may be clipped. */
  assert.equal(movement(837, 794).units, 43);
  assert.equal(movement(12164, 12134).units, 30);
  assert.equal(movement(72, 47).units, 25);
  assert.equal(movement(295, 294).units, 1);
});

test("a shelf emptied by bookkeeping is not reported as sold out", () => {
  /* Otherwise the strongest badge on the board gets attached to a seller
     tidying up their variants. */
  const wiped = movement(9000, 0);
  assert.equal(wiped.soldOut, false);
  assert.equal(wiped.inventoryChange, true);
});

test("a rejected drop is recorded, not silently discarded", () => {
  /* The rate has to be visible, or these thresholds are permanent guesses. */
  assert.equal(movement(5994, 2997).record, true);
});

test("an implausible row can never reach the board, whenever it was written", () => {
  /* The plausibility rule only applies to readings taken after it shipped, so
     "2,997 sold" stayed on the live board from history. A rule added later has
     to work backwards too, or the fix is invisible for as long as anybody is
     still looking. Both a read-time guard and a purge. */
  const source = read("sold-overnight.ts");
  assert.match(source, /m\.sold<=\?/, "the board filters implausible rows as it reads");
  assert.match(source, /DELETE FROM sold_moves WHERE sold > \?/, "and history is cleaned");
});

test("the board only ever shows shelves this tool deliberately stocks", () => {
  /* A "Same Day Good Weather Manifesting Letter" reached the live board under
     a category literally called Digital. The download filter could not catch
     it, because that filter can only judge a listing once it has been read and
     anything unread is assumed physical so new arrivals are not hidden.
     Blocklisting category names would be a permanent game of catch-up against
     Etsy's whole tree; restricting to the chosen shelves needs no maintenance
     and also clears out legacy rows from the old keyword seeding. */
  const source = read("sold-overnight.ts");
  const board = source.slice(source.indexOf("export async function readBoard"));
  assert.match(board, /shelfSet\.has\(Number\(row\.taxonomy_id\)\)/);
  /* And an empty shelf list must render an empty board rather than an
     unrestricted one. */
  assert.match(board, /if \(!shelfSet\.size\)/);
  /* Everything the board reports has to come from the filtered rows, or the
     tabs promise categories the grid does not contain. */
  for (const derived of ["perProduct", "totalSold", "listings"])
    assert.ok(board.includes("onShelf"), `${derived} must be derived from the filtered rows`);
  assert.doesNotMatch(board, /listings: rows\.map/);
});

test("the tabs and the grid cannot disagree", () => {
  /* They were two separate SQL queries with separately maintained WHERE
     clauses, which is how a tab comes to promise a category the grid does not
     contain. The tabs are counted from the same rows now. */
  const source = read("sold-overnight.ts");
  const board = source.slice(source.indexOf("export async function readBoard"));
  assert.match(board, /const perProduct = new Map/);
  assert.doesNotMatch(board, /GROUP BY product/, "one query, one source of truth");
});

test("a shelf includes everything filed beneath it", () => {
  /* Restricting the board to the chosen shelf ids made T-shirts disappear from
     it entirely: Etsy files a listing on the most specific node it fits, which
     is usually a child of the shelf, so matching the shelf id alone excluded
     most of the very thing the shelf exists for — silently, the category just
     stopped appearing. */
  const source = read("sold-overnight.ts");
  assert.match(source, /export async function shelfTaxonomyIds/);
  /* And the prefix match must not be SQL: fifteen OR'd LIKE clauses on paths
     this long is "LIKE or GLOB pattern too complex" from D1, which took the
     board down with a 500. Resolving to an IN list trades one limit for
     another, since fifteen shelves have hundreds of descendants. */
  assert.doesNotMatch(source, /path LIKE/);
  assert.match(source, /path\.startsWith\(`\$\{root\} > `\)/);
  assert.match(source, /const shelfSet = await shelfTaxonomyIds\(\)/);
});

test("a digital branch inside a printable shelf is left out", () => {
  /* "Monopoly GO! Instant Delivery" reached the board under Digital Prints,
     which Etsy files beneath Prints — so taking a shelf and everything under
     it took the digital half too. listing_type cannot catch these: plenty of
     sellers list a digital good as physical. */
  const source = read("sold-overnight.ts");
  assert.match(source, /Art & Collectibles > Prints > Digital Prints/);
  assert.match(source, /NOT_PRINTABLE\.some\(excluded => under\(path, excluded\)\)/);
});

test("every node with a shelf's name in its department counts as that shelf", () => {
  /* Etsy has a "T-shirts" under men's, women's, unisex and kids. Keeping only
     the shallowest put three quarters of the t-shirts on Etsy outside the
     shelf that exists to hold them. */
  const source = read("sold-overnight.ts");
  const resolve = source.slice(source.indexOf("export async function shelfIds"),
    source.indexOf("export async function shelfTaxonomyIds"));
  assert.doesNotMatch(resolve, /depth < seen\.depth/, "no single-winner-per-name any more");
  assert.match(resolve, /return rows\.map\(row => \(\{/);
});
