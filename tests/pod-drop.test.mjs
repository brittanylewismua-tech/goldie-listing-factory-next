import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const readRoot = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the drop never claims a sale it cannot see", () => {
  /* The discipline the whole product runs on: eRank data and counted numbers
     are evidence, an inference dressed as a fact is not. Etsy publishes no
     sales, its ranking mixes keyword match with performance, and new listings
     get a visibility boost — so "top seller" would be a guess printed as a
     number, and the first seller to click one and find four reviews would stop
     believing the rest of the page. */
  const surfaces = [read("pod-drop.ts"), read("drop/page.tsx"), read("api/drop/route.ts")];
  for (const source of surfaces)
    for (const forbidden of [/best[- ]?sell/i, /top[- ]?sell/i, /revenue/i, /\bearn(ed|ing|s)\b/i])
      assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden,
        `the drop must not claim sales: ${forbidden}`);
});

test("saves-per-day is suppressed while a listing is too new to have a rate", () => {
  /* Sixty saves on a four-day-old listing is not fifteen a day; the denominator
     is too small to mean anything, and left alone it would top every chart it
     appeared in and make the drop useless. */
  const source = read("pod-drop.ts");
  assert.match(source, /MIN_AGE_DAYS\s*=\s*7/);
  assert.match(source, /ageDays >= MIN_AGE_DAYS \? Number\(\(favorites \/ ageDays\)/);
});

test("publishing outranks the drop for Etsy capacity", () => {
  /* Somebody's batch going out is what they paid for. Today's intel can be
     yesterday's for another hour. */
  const source = read("pod-drop.ts");
  assert.match(source, /BUDGET_FLOOR/);
  assert.match(source, /budget\.remaining < BUDGET_FLOOR/);
  assert.match(read("api/whats-selling/route.ts"), /budget\.remaining < 50/);
});

test("the drop is built once a day for everybody, not once per seller", () => {
  /* The only reason this is affordable. One claim, one build, one row per
     category per day, read by every seller. */
  const source = read("pod-drop.ts");
  assert.match(source, /pod_drop_state SET building_day/);
  assert.match(source, /building_since<datetime\('now','-10 minutes'\)/,
    "an abandoned build must be retakeable or one crash freezes the drop forever");
  assert.match(source, /pod_drop_snapshots/);
});

test("each shelf uses an explicit product search and resumes partial builds", () => {
  const source = read("pod-drop.ts");
  for (const query of ["t shirt", "sweatshirt", "hoodie", "mug", "tote bag", "phone case"])
    assert.match(source, new RegExp(`query: "${query}"`));
  assert.match(source, /keywords: category\.query/);
  assert.doesNotMatch(source, /seller-taxonomy\/nodes/,
    "duplicate taxonomy names must not silently choose an unrelated Etsy branch");
  assert.match(source, /SELECT 1 ok FROM pod_drop_snapshots WHERE day_taxonomy=\?/,
    "a retry must keep completed product searches instead of spending them again");
  assert.match(source, /listing_type === "download"/,
    "explicit digital downloads do not belong on the physical-product shelf");
});

test("the live shelf filters the protected names found in its own results", () => {
  const source = read("pod-drop.ts");
  for (const name of ["cinderella", "shaun the sheep", "myspace", "junimo", "dungeon meshi"])
    assert.match(source, new RegExp(`"${name}"`), `${name} must not be presented as an opportunity`);
});

test("the streak is earned from real listings and cannot be tapped", () => {
  /* No check-in button. A star is a day something actually published, read out
     of the publish record — so it cannot be gamed by opening the tab, and
     everybody's history is already there the day this ships. */
  const source = read("pod-drop.ts");
  assert.match(source, /STREAK_TARGET = 5/);
  assert.match(source, /STREAK_WINDOW = 7/);
  assert.match(source, /printify_draft_results WHERE user_id=\? AND status='succeeded'/);
  assert.match(source, /datetime\('now','-6 days'\)/, "rolling seven days, not a Monday reset");
  assert.doesNotMatch(source, /check[_-]?in/i, "there is no button to press");
});

test("the streak copy never scolds", () => {
  /* An accountability feature that tells somebody they are behind is a
     cancellation feature. Every state says how far along they are or that they
     made it. */
  const source = read("pod-drop.ts") + read("drop/page.tsx");
  for (const forbidden of [/behind/i, /you failed/i, /broke your/i, /lost your streak/i, /don't break/i])
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden);
});

test("the week resets what is open, and the tiers are the reward", () => {
  /* The commercial engine: everything re-locks on Monday, so the tool is worth
     opening in week forty. The reveal that used to sit on top of this is gone
     — it dispensed trivia from a single daily snapshot and repeated itself.
     What is left is the part that always worked: list more, see more. */
  const source = read("unlocks.ts");
  assert.match(source, /substr\(COALESCE\(created_at,updated_at\),1,10\) >= \?/,
    "the week is scored on this week's listings");
  assert.match(source, /export function weekStart/);
  assert.doesNotMatch(source, /crackCard|unlock_cards/,
    "the reveal mechanic must not come back without being designed");
});

test("a tier is only ever bonus intel, never a listing capability", () => {
  const unlocks = read("unlocks.ts");
  const keys = [...unlocks.matchAll(/key: "([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(keys.sort(), ["climbers", "full-drop", "lookup", "vault"],
    "a new tier must be added to this list on purpose — and be intel, never a listing capability");
});

test("a locked control is visible, disabled, and says what opens it", () => {
  /* Hiding it removes the only reason to list. Making it look pressable while
     it is not is how an interface teaches somebody that it lies. */
  const panel = read("unlock-cards.tsx");
  assert.match(panel, /disabled=\{!lookup\?\.unlocked\}/);
  assert.match(panel, /disabled=\{!movers\?\.unlocked\}/);
  assert.match(panel, /more listings/);
  assert.doesNotMatch(panel, /"unlocked"/, "the colour says unlocked, not the word");
});

test("nothing in the card system is scored on a sale", () => {
  const source = read("unlocks.ts") + read("unlock-cards.tsx");
  for (const forbidden of [/\bsold\b/i, /\bsales\b/i, /revenue/i, /conversion/i])
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden,
      "the counter moves on work going out, which is the only part a seller controls");
});

test("a day already read is never taken back", () => {
  /* The weekly reset is the engine and this is the thing that keeps it from
     souring. Monday re-locks what is NEW; every day already opened stays open
     at the depth it was opened, forever. You keep what you have seen and you
     earn what is new. */
  const lib = read("pod-drop.ts");
  assert.match(lib, /export async function markSeen/);
  assert.match(lib, /depth=MAX\(depth,excluded\.depth\)/,
    "listing more in the afternoon opens the morning further, never closes it");
  assert.match(lib, /export async function readArchive/);
  /* The archive replays real snapshots, so they have to outlive the two days
     the diff needs — a fortnight's retention would empty it underneath them. */
  assert.match(lib, /pod_drop_snapshots WHERE day < date\('now','-400 days'\)/);
  assert.match(read("api/drop/route.ts"), /await markSeen\(user\.userId, day, depth\)/);
  /* The browsable archive is one step back rather than a growing list — a
     seller wants last week beside this week, not a library. What is still
     guaranteed is that a day already built stays readable: 400 days of
     snapshots, and a back button that is only offered when the day exists. */
  assert.match(read("pod-drop.ts"), /export async function readDropFor/);
  assert.match(read("pod-drop.ts"), /export async function seenDepth/);
  assert.match(read("api/drop/route.ts"), /Math\.max\(depth, await seenDepth\(user\.userId, wants\)\)/,
    "weekly relocking must not take back listings already opened on that past day");
  assert.match(read("api/drop/route.ts"), /const back = previous\.length \? previousDay : null;/,
    "never offer a door onto a day that was never built");
  assert.match(read("drop/page.tsx"), /Go to last week/);
});

test("a set is worth more than the listings inside it", () => {
  /* One design on a tee, a sweatshirt and a hoodie. It is what the method has
     always told people to do and what they skip, because it is three times the
     listing work for one design. Three singles earn three credits; the same
     three as a set earn five, so the number makes the argument. */
  const source = read("unlocks.ts");
  assert.match(source, /SET_PRODUCTS = 3/);
  assert.match(source, /SET_BONUS = 2/);
  assert.match(source, /COUNT\(DISTINCT batch_id\) products/,
    "a set is one design across three or more child batches — no new tracking");
  /* Monotonic on purpose. A flat set price punished the best behaviour in the
     product: one design on six products would have earned five while six
     unrelated singles earned six, so the harder and more valuable thing scored
     worse. Products plus a bonus means more products always earns more. */
  assert.match(source, /credits \+= products \+ SET_BONUS/);
  assert.doesNotMatch(source, /credits \+= SET_CREDITS/,
    "a set must never be worth a flat amount — that pays less for more work");
  /* And the top tier is the one credits cannot buy. Fifteen singles does not
     reach it; three sets does. */
  assert.match(source, /VAULT_SETS = 3/);
  assert.match(source, /unlocked: sets >= VAULT_SETS/);
});

test("keyword lookups are capped on fresh calls only", () => {
  /* The cache is shared, so a phrase somebody else looked up this morning
     costs nothing to serve again and must not count against anyone. The limit
     bounds Etsy calls, not curiosity. */
  const source = read("api/whats-selling/route.ts");
  assert.match(source, /FRESH_PER_DAY = 15/);
  const capIndex = source.indexOf("fresh_lookups FROM keyword_lookup_usage");
  const cacheIndex = source.indexOf("SELECT listings_json FROM etsy_keyword_snapshots");
  assert.ok(cacheIndex >= 0 && capIndex > cacheIndex,
    "the cache must answer before the cap is consulted, or cached keywords would be charged for");
  assert.match(source, /fresh_lookups=fresh_lookups\+1/);
  assert.match(readRoot("drizzle/0032_keyword_lookup_usage.sql"), /CREATE TABLE IF NOT EXISTS `keyword_lookup_usage`/,
    "the live database must receive the table through a new migration");
  assert.doesNotMatch(readRoot("drizzle/0031_drop_archive.sql"), /keyword_lookup_usage/,
    "an already-applied production migration must remain immutable");
});

test("the budget believes Etsy over its own tally", () => {
  /* The quota belongs to the Etsy APP, and World Builder runs on the same key.
     Counting only this codebase's calls means believing in headroom another
     product already spent, and the first anybody would know is a seller's
     publish failing mid-batch. Etsy states what is left on every response. */
  const client = read("api/etsy/client.ts");
  assert.match(client, /x-remaining-today/);
  assert.match(client, /Math\.max\(Number\(row\?\.calls\|\|0\),reportedUsed\)/,
    "whichever number is worse wins — never the optimistic one");
  assert.match(client, /remaining_at>datetime\('now','-1 hour'\)/,
    "a stale figure is worse than an over-cautious local count");
  assert.match(readRoot("drizzle/0033_etsy_reported_quota.sql"), /ADD COLUMN `remaining_today` integer/);
  assert.match(readRoot("drizzle/0033_etsy_reported_quota.sql"), /ADD COLUMN `remaining_at` text/);
  assert.doesNotMatch(readRoot("drizzle/0031_drop_archive.sql"), /remaining_today|remaining_at/,
    "an already-applied production migration must remain immutable");
});

test("the shelf is Etsy's order, and the pictures are asked for", () => {
  /* A pace ranking was built and taken out. It answered a real question —
     which of these is growing — but not the one a seller is asking, which is
     what a shopper sees when they search. Position four here is position four
     there, and nothing reorders it. */
  const lib = read("pod-drop.ts");
  assert.match(lib, /sort_on: "score"/);
  assert.doesNotMatch(lib, /\bpace\b/, "nothing reorders Etsy's shelf");
  assert.match(lib, /const ranked = await withImages\(shape\(payload\.results \?\? \[\]\)\);/);

  /* AND THE PICTURES. listings/active sends none, and includes=Images on it
     changed nothing — 360 listings and not one photograph, twice. The endpoint
     that honours it is listings/batch, which is how the shop reader has always
     got artwork. This asserts the working path, not the one that looked right. */
  assert.match(lib, /listings\/batch\?listing_ids=/);
  assert.match(lib, /includes=Images/);
  assert.match(lib, /catch \{\n    return listings;/,
    "no pictures is a thin drop, never a failed one");
});

test("a wrong drop is not stuck until tomorrow", () => {
  /* Built once a day on purpose, which also means a bad build lasts a day.
     Owner only, because it spends a dozen Etsy calls. */
  assert.match(read("pod-drop.ts"), /export async function forgetToday/);
  const route = read("api/drop/route.ts");
  assert.match(route, /isOwner\(user\)/);
  assert.match(route, /status: 403/);
});
