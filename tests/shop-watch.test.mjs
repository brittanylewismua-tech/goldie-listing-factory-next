/**
 * SHOP WATCH: SHARED COLLECTION, AND SIGNALS THAT STAY APART.
 *
 * The failure this feature invites is an activity feed — "eight new reviews" —
 * dressed up as intelligence, and the failure underneath that is one signal
 * quietly standing in for another. These tests pin the storage and the
 * collection rules that make both hard to do by accident.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shopNameFrom, listingIdFrom, WATCH_LIMIT_DEFAULT, FRESH_HOURS, REVIEW_BOOTSTRAP }
  from "../app/shop-watch-input.ts";

const source = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8")
  + readFileSync(new URL("../app/shop-watch-input.ts", import.meta.url), "utf8");

test("a shop URL, a name, and a decorated name all resolve to one name", () => {
  assert.equal(shopNameFrom("https://www.etsy.com/shop/TheSportsShop"), "TheSportsShop");
  assert.equal(shopNameFrom("https://www.etsy.com/uk/shop/TheSportsShop?ref=seller"), "TheSportsShop");
  assert.equal(shopNameFrom("TheSportsShop"), "TheSportsShop");
  assert.equal(shopNameFrom("@TheSportsShop"), "TheSportsShop");
  assert.equal(shopNameFrom("  TheSportsShop  "), "TheSportsShop");
});

test("a listing URL is resolved through the listing, not guessed from the slug", () => {
  assert.equal(shopNameFrom("https://www.etsy.com/listing/4574529934/witch-cats-hoodie"), "");
  assert.equal(listingIdFrom("https://www.etsy.com/listing/4574529934/witch-cats-hoodie"), 4574529934);
  assert.match(source, /includes=Shop/);
});

test("only an exact shop-name match is accepted", () => {
  /* findShops matches loosely; saving a neighbour of the name the member
     typed would be worse than failing. */
  assert.match(source, /String\(row\.shop_name \?\? ""\)\.toLowerCase\(\) === name\.toLowerCase\(\)/);
  assert.match(source, /No Etsy shop is named/);
});

test("the same shop watched by many members is collected once", () => {
  assert.match(source, /ON CONFLICT\(shop_id\) DO UPDATE SET shop_name/);
  assert.match(source, /PRIMARY KEY \(user_id, shop_id\)/);
  assert.match(source, /THE SAME SHOP IS COLLECTED ONCE/);
  /* And the saving is measured rather than assumed. */
  assert.match(source, /duplicateWatchesReused/);
});

test("the member limit is enforced before Etsy is asked anything", () => {
  assert.equal(WATCH_LIMIT_DEFAULT, 25);
  const add = source.slice(source.indexOf("export async function addWatch"), source.indexOf("export async function removeWatch"));
  assert.ok(add.indexOf("which is the limit") < add.indexOf("await resolveShop"),
    "the limit check must come before the Etsy call");
  assert.match(source, /SHOP_WATCH_LIMIT/, "the limit is configurable");
});

test("six-hour freshness travels with every watch", () => {
  assert.equal(FRESH_HOURS, 6);
  assert.match(source, /stale: !row\.last_refreshed \|\| row\.last_refreshed < cutoff/);
  assert.match(source, /six-hour rule is about what may be DISPLAYED/);
});

test("reviews are fetched incrementally, never as a lifetime history", () => {
  assert.equal(REVIEW_BOOTSTRAP, 500);
  assert.match(source, /min_created=\$\{since\}/);
  assert.match(source, /review_high_water/);
  assert.match(source, /181,811/, "the measurement that justifies this is written down");
});

test("reviews are deduplicated on the transaction", () => {
  assert.match(source, /transaction_id INTEGER PRIMARY KEY/);
  assert.match(source, /ON CONFLICT\(transaction_id\) DO NOTHING/);
  assert.match(source, /The transaction is the identity/);
});

test("reviews are only fetched when the shop's review count moved", () => {
  assert.match(source, /reviewsMoved/);
  assert.match(source, /reviewCount > Number\(previous\.review_count\)/);
});

test("review time is never treated as purchase time", () => {
  assert.match(source, /NOT when the purchase happened/);
  assert.match(source, /hundred days after estimated delivery/);
});

test("shop-level totals are stored as shop-level and nothing else", () => {
  assert.match(source, /Shop-level, and labelled as such, because\n       these numbers can never be split across listings/);
});

test("a refresh does not enumerate an enormous shop", () => {
  /* The whole-shop plan died on a median of 695 listings per shop. */
  assert.match(source, /Deliberately NOT a full enumeration/);
  assert.match(source, /listings\/active\?limit=100/);
  assert.doesNotMatch(source, /offset=\$\{page \* 100\}[\s\S]{0,200}listings\/active/);
});

test("a failed refresh leaves the previous evidence untouched", () => {
  assert.match(source, /A failed refresh must never damage what is already known/);
  const failure = source.slice(
    source.indexOf("A failed refresh must never damage"),
    source.indexOf("export async function refreshPass"));
  assert.match(failure, /refresh_failures = refresh_failures \+ 1/);
  assert.doesNotMatch(failure, /DELETE|UPDATE shop_observations|UPDATE shop_reviews/);
});

test("dropping the last watcher does not destroy the shop's history", () => {
  assert.match(source, /The shared shop row stays even when the last member drops it/);
  const remove = source.slice(source.indexOf("export async function removeWatch"), source.indexOf("export async function watchesFor"));
  assert.match(remove, /DELETE FROM member_shop_watches/);
  assert.doesNotMatch(remove, /DELETE FROM watched_shops|DELETE FROM shop_reviews/);
});

test("Shop Watch yields to every other Etsy workload", () => {
  assert.match(source, /SHOP_WATCH_RESERVE/);
  assert.match(source, /No room under the reserve/);
  assert.match(source, /FROM etsy_api_usage_buckets/);
});

test("the cron wakes every twenty minutes; a shop is not refreshed that often", () => {
  /* Twenty minutes is when the scheduler looks, not how stale the evidence
     is allowed to get. Each shop carries its own due time. */
  assert.match(source, /next_refresh_at/);
  assert.match(source, /ONLY WHAT IS ACTUALLY DUE/);
  assert.match(source, /WHERE next_refresh_at IS NULL OR next_refresh_at <= \?/);
  assert.doesNotMatch(source, /WHERE last_refreshed IS NULL OR last_refreshed < \?\n\s+ORDER BY/);
});

test("due times are jittered and sit inside the six-hour window", () => {
  /* Every shop added on the same afternoon would otherwise come due in the
     same minute forever. */
  assert.match(source, /base \* 0\.75 \+ Math\.floor\(Math\.random\(\) \* base \* 0\.15\)/);
  assert.match(source, /FRESH_HOURS \* 3_600_000/);
});

test("a firing takes a slice, not every due shop at once", () => {
  assert.match(source, /maxShops = 8, maxCalls = 40/);
  assert.match(source, /spread across the hour instead of\n     arriving as one spike/);
});

test("opening a watch refreshes only when its evidence is stale", () => {
  assert.match(source, /export async function refreshIfStale/);
  assert.match(source, /if \(row\?\.last_refreshed && row\.last_refreshed >= cutoff\) return \{ refreshed: false, calls: 0 \}/);
});

test("the health view shows whether the cadence is keeping up", () => {
  assert.match(source, /dueNow/);
  assert.match(source, /nextDueAt/);
  assert.match(source, /Most firings should find nothing due/);
});
