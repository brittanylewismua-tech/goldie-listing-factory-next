import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brief = readFileSync(new URL("../app/shop-watch-brief.ts", import.meta.url), "utf8");
const watch = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8");
const code = brief.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("one brief per shop per day, shared by every watcher", () => {
  assert.match(code, /PRIMARY KEY \(shop_id, brief_day\)/);
  /* Keyed by shop and day, never by member: that is what makes twenty
     watchers one workload and keeps watcher identity out of it. */
  assert.doesNotMatch(code.slice(code.indexOf("shop_watch_briefs")), /user_id/);
});

test("a stored brief is not rebuilt on every open", () => {
  assert.match(code, /if \(!rebuild\)/);
  assert.match(code, /regenerated: false/);
});

test("a change needs two observations, not one", () => {
  assert.match(code, /ORDER BY observed_at DESC LIMIT 2/);
  assert.match(code, /previous: totals\(seen\[1\]\)/);
});

test("a missing Etsy value stays absent rather than becoming zero", () => {
  assert.match(code, /typeof row\?\.favorers === "number" \? \{ favorites: row\.favorers \} : \{\}/);
});

test("no paid provider call exists in Shop Watch yet", () => {
  assert.match(code, /SUMMARY_ENABLED = false/);
  /* The metering point is designed; the call is not built. */
  assert.doesNotMatch(code, /fetch\(/);
  assert.doesNotMatch(code, /fal\.run|anthropic/i);
});

test("the summary can never be per review or per member", () => {
  assert.match(brief, /never one per member watching/);
  assert.match(brief, /never be one call per review/);
});

test("the beta sits behind its own flag", () => {
  assert.match(code, /SHOP_WATCH_FLAG = "shopWatchInternalBeta"/);
});

test("review ingestion is incremental and deduplicated", () => {
  /* High-water mark plus a primary key on the transaction id: the same
     review cannot be stored twice or fetched forever. */
  assert.match(watch, /review_high_water/);
  assert.match(watch, /transaction_id INTEGER PRIMARY KEY/);
  assert.match(watch, /min_created/);
});

test("collection is shared across duplicate watchers", () => {
  /* Refresh is keyed by shop, not by watcher. */
  assert.match(watch, /export async function refreshShop\(shopId: number\)/);
  assert.match(watch, /watched_shops/);
});

test("the member watch limit is checked before Etsy is called", () => {
  const add = watch.slice(watch.indexOf("export async function addWatch"));
  const limitAt = add.indexOf("watchLimit");
  const resolveAt = add.indexOf("resolveShop");
  assert.ok(limitAt > 0 && limitAt < resolveAt,
    "the 25-shop limit is checked after Etsy is contacted");
});

test("health counts come from stored rows and name the sharing saving", () => {
  assert.match(code, /duplicateWatchersShared/);
  assert.match(code, /COUNT\(\*\) - COUNT\(DISTINCT shop_id\)/);
});

test("a member sees only their own watch list", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  /* Qualified or not, the watch list is filtered by the signed-in member. */
  assert.match(route, /WHERE (?:[a-z]+\.)?user_id = \?/);
  /* No parameter can name another member's watches. */
  assert.doesNotMatch(route, /searchParams\.get\("user|targetUser/);
});

test("shared intelligence exposes no watcher identity", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  const present = route.slice(route.indexOf("function present"));
  for (const leak of ["user", "watcher", "member"])
    assert.doesNotMatch(present, new RegExp(leak, "i"), `a card exposes ${leak}`);
});

test("cards show the pattern and its weight, not the formula", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  const present = route.slice(route.indexOf("function present"));
  assert.match(present, /pattern:/);
  assert.match(present, /evidence:/);
  assert.match(present, /etsy\.com\/listing/);
  /* No internal scoring reaches the member. */
  assert.doesNotMatch(present, /evidenceClass|supportingReviewIds|confidence|score/);
});

test("the interface never claims reviews are sales", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  assert.match(route, /They are not sales/);
  assert.doesNotMatch(route, /salesCount|unitsSold|estimatedSales/);
});

test("D1433: the brief reads the columns the table actually has", () => {
  /* It asked for favorites and average_rating; the table holds favorers and
     no rating, so the query threw and What Changed was always empty. */
  assert.match(code, /SELECT sold_count, favorers, review_count, observed_at/);
  assert.doesNotMatch(code, /average_rating/);
});

test("D1433: observed_at is parsed as a timestamp, not cast from text", () => {
  /* Reading TEXT as epoch seconds reported "last checked 497,067 hours ago". */
  assert.match(code, /observedSeconds/);
  assert.match(code, /Date\.parse/);
});

test("D1433: a rating is absent rather than averaged from our own sample", () => {
  assert.match(brief, /average would be of our sample, not of the shop/);
  assert.doesNotMatch(code, /averageRating:/);
});

test("D1433: a bare shop id resolves as a shop, not as a name", () => {
  const module = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8");
  assert.match(module, /numeric = /);
  assert.match(module, /No Etsy shop has the id/);
  /* The id branch must come before the name search. */
  assert.ok(module.indexOf("No Etsy shop has the id") < module.indexOf("No Etsy shop is named"));
});

test("a card carries a finding, not only a count", () => {
  /*
    THE CARDS SHIPPED AS RAW COUNTS.

    Audited in the canary brief against ArrowGiftCoLtd: every card in Getting
    Attention read "9 of the last 496 reviews in this shop are for this
    listing" — or 6, or 6. True sentences, and useless: whether nine of 496 is
    a lot depends entirely on how many listings those 496 were spread across,
    which the card never showed. The selection rule KNEW — it only admits a
    listing above one and a half times an even share — and discarded the
    reasoning before printing.

    And "3 new reviews since yesterday" was removed outright. It states that
    reviews were added; there is no wording that makes a bare arrival count
    worth somebody's attention.
  */
  const patterns = readFileSync(new URL(
    "../app/shop-watch-patterns.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");

  /* Every pattern shape states why its number matters. Counted on `headline`
     rather than `section`, because one builder passes the section through as a
     parameter and a count of the literal misses it. */
  const headlines = (patterns.match(/headline:/g) || []).length;
  const becauses = (patterns.match(/because:/g) || []).length;
  assert.equal(headlines, becauses,
    `${headlines} headlines and ${becauses} explanations — every card needs one`);

  /* The explanation reaches the card rather than stopping at the route. */
  assert.match(route.slice(route.indexOf("function present")), /because: card\.because/);
  const client = readFileSync(new URL(
    "../app/market-watch/market-watch-client.tsx", import.meta.url), "utf8");
  assert.match(client, /card\.because/, "the card computes an explanation and never shows it");

  /* The rejected shapes stay rejected. */
  assert.doesNotMatch(patterns, /new reviews since yesterday/,
    "a bare count of arriving reviews is not an insight");
  assert.doesNotMatch(patterns, /headline: `\$\{group\.length\} of the last/,
    "the attention headline is a raw count again");
});

test("no card tells the seller what to do next", () => {
  /* Evidence only. What to do with it is the seller's job. */
  const patterns = readFileSync(new URL(
    "../app/shop-watch-patterns.ts", import.meta.url), "utf8");
  const headlines = [...patterns.matchAll(/headline: ([^\n]+)/g)].map(match => match[1]);
  for (const line of headlines)
    for (const advice of ["you should", "consider ", "try ", "add a", "raise your", "lower your"])
      assert.ok(!line.toLowerCase().includes(advice), `a headline advises: ${line}`);
});

test("a change to what a card says invalidates the stored brief", () => {
  /*
    D1586 rewrote every attention card and deployed cleanly, and the live page
    went on showing the old sentences: the brief is built once a morning and
    invalidated only when the EVIDENCE beneath it refreshes, so a change to the
    wording left yesterday's payload looking perfectly current.

    The same shape as the observation window keying on the build marker. The
    card version is part of the cache identity now.
  */
  const brief = readFileSync(new URL(
    "../app/shop-watch-brief.ts", import.meta.url), "utf8");
  assert.match(brief, /export const BRIEF_CARD_VERSION = \d+/);
  assert.match(brief, /\$\{now\.toISOString\(\)\.slice\(0, 10\)\}#v\$\{BRIEF_CARD_VERSION\}/,
    "the cache key must carry the card version");
});

test("D1689: a card that is not built from reviews does not claim a review count", () => {
  const route = readFileSync(new URL("../app/api/shop-watch/brief/route.ts",
    import.meta.url), "utf8");
  /*
    "This shop sold 11 more items since yesterday" — a card whose own sentence
    says it is "the one number here that is actually sales rather than
    reviews" — carried the footer "1 review · 1 days", where the 1 was a
    placeholder sample size never meant to be shown.
  */
  assert.match(route, /evidence: weight\s*\|\|/,
    "a caller-supplied weight must be able to replace the review count");
  assert.match(route, /card\.evidenceClass === "confirmed-shop-total"/,
    "the two counter cards are the ones that are not review-based");
  assert.match(route, /Etsy's own shop counter/);
  /* The internal class is translated by the caller; `present` never sees it. */
  const present = route.slice(route.indexOf("function present(card: {"));
  assert.doesNotMatch(present, /evidenceClass|supportingReviewIds|confidence|score/);
});

test("D1689: one day is not '1 days'", () => {
  const route = readFileSync(new URL("../app/api/shop-watch/brief/route.ts",
    import.meta.url), "utf8");
  assert.match(route, /\$\{days\} day\$\{days === 1 \? "" : "s"\}/);
  assert.doesNotMatch(route, /\/ 86_400\)\} days`/);
});

test("D1689: a shop counter in the millions is readable", () => {
  const patterns = readFileSync(new URL("../app/shop-watch-patterns.ts",
    import.meta.url), "utf8");
  assert.match(patterns, /toLocaleString\("en-US"\)/);
  assert.match(patterns, /counter moved from \$\{count\(previous\.saleCount\)\}/);
  assert.match(patterns, /Favourites moved from \$\{count\(previous\.favorites\)\}/);
});
