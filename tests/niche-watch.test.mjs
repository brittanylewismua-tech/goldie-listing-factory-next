/*
  Niche Watch shows evidence. It does not tell anyone what to do with it, and
  it does not describe evidence it does not have.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stateOf, summarize, patterns, LABELS, STALE_AFTER_SECONDS,
  FORBIDDEN_PATTERN_LANGUAGE,
} from "../app/niche-watch.ts";

const NOW = 1_800_000_000;
const evidence = (over = {}) => ({ listingId: 1, shopId: 2, intervals: 1,
  lastConfirmedAt: NOW - 3_600, firstConfirmedAt: NOW - 7_200, present: true,
  linkedReviews: 0, ...over });

test("repeated momentum needs multiple DISTINCT intervals", () => {
  assert.equal(stateOf(evidence({ intervals: 1 }), NOW), "momentum");
  assert.equal(stateOf(evidence({ intervals: 2 }), NOW), "repeated-momentum");
  /* Units are not intervals: ten sales in one interval is one observation. */
  assert.equal(stateOf(evidence({ intervals: 1, linkedReviews: 40 }), NOW), "momentum");
});

test("every state a listing can be in has a definition and a label", () => {
  assert.equal(stateOf(evidence({ intervals: 0 }), NOW), "gathering");
  assert.equal(stateOf(evidence({ present: false, intervals: 5 }), NOW), "no-longer-qualifies");
  assert.equal(stateOf(evidence({ lastConfirmedAt: NOW - STALE_AFTER_SECONDS - 10 }), NOW), "stale");
  for (const state of ["no-evidence", "gathering", "momentum", "repeated-momentum",
    "stale", "no-longer-qualifies"])
    assert.ok(LABELS[state], `${state} has no label`);
});

test("a listing that vanished is reported gone, however strong its old evidence", () => {
  assert.equal(stateOf(evidence({ present: false, intervals: 9,
    lastConfirmedAt: NOW - 60 }), NOW), "no-longer-qualifies");
});

test("stale evidence never reads as current momentum", () => {
  const old = evidence({ intervals: 4, lastConfirmedAt: NOW - 30 * 86_400 });
  assert.equal(stateOf(old, NOW), "stale");
  assert.notEqual(stateOf(old, NOW), "repeated-momentum");
});

test("only live listings count toward the summary", () => {
  const rows = [
    evidence({ listingId: 1, shopId: 1, intervals: 2 }),
    evidence({ listingId: 2, shopId: 2, intervals: 1 }),
    evidence({ listingId: 3, shopId: 3, present: false, intervals: 5 }),
    evidence({ listingId: 4, shopId: 4, lastConfirmedAt: NOW - 40 * 86_400 }),
  ];
  const summary = summarize(rows, NOW);
  assert.equal(summary.moving, 2);
  assert.equal(summary.repeated, 1);
  assert.equal(summary.shops, 2);
});

test("a thin niche does not claim meaningful momentum", () => {
  const thin = summarize([evidence()], NOW);
  assert.equal(thin.meaningfulMomentum, false);
  const wide = summarize(Array.from({ length: 14 }, (unused, index) =>
    evidence({ listingId: index, shopId: index, intervals: index < 6 ? 2 : 1 })), NOW);
  assert.equal(wide.meaningfulMomentum, true);
});

test("new-since counts what appeared since the member last looked", () => {
  const rows = [
    evidence({ listingId: 1, firstConfirmedAt: NOW - 10 * 86_400 }),
    evidence({ listingId: 2, firstConfirmedAt: NOW - 3_600 }),
  ];
  assert.equal(summarize(rows, NOW, { since: NOW - 86_400 }).newSinceLastBrief, 1);
});

/* ------------------------------------------------------------- patterns */

const analysis = (over = {}) => ({ composition: "centered", typography: "bold sans",
  colorStrategy: "one colour", contrast: "high", density: "sparse",
  mechanism: "bold slogan", thumbnailReadability: "readable", ...over });

test("at most three patterns are shown", () => {
  assert.ok(patterns(Array.from({ length: 20 }, () => analysis())).length <= 3);
});

test("a pattern needs most of the cohort to share it", () => {
  const split = Array.from({ length: 20 }, (unused, index) =>
    analysis({ composition: index % 2 ? "centered" : "asymmetric" }));
  assert.ok(!patterns(split).some(line => /composition/.test(line)),
    "a half-and-half split was reported as a pattern");
});

test("too few analyses produce no patterns at all", () => {
  assert.deepEqual(patterns([analysis(), analysis(), analysis()]), []);
});

test("patterns are observations, never instructions", () => {
  const lines = patterns(Array.from({ length: 20 }, () => analysis()));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    for (const banned of FORBIDDEN_PATTERN_LANGUAGE)
      assert.ok(!line.toLowerCase().includes(banned), `a pattern said "${banned}"`);
    assert.doesNotMatch(line, /"[^"]+"/, "a pattern quoted something");
  }
});

test("patterns cannot name a slogan, subject, illustration or shop", () => {
  const code = readFileSync(new URL("../app/niche-watch.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  /* Only construction fields are readable, so there is nothing to leak. */
  for (const banned of ["wording", "slogan", "title", "shopName", "subject", "illustrationOf"])
    assert.ok(!code.includes(banned), `the pattern system can read ${banned}`);
});

test("the article agrees in pattern copy", () => {
  const withVowel = patterns(Array.from({ length: 20 }, () =>
    analysis({ mechanism: "illustrated scene" })));
  assert.ok(withVowel.some(line => /lead with an illustrated scene/.test(line))
    || !withVowel.some(line => /lead with/.test(line)));
});

test("no inferred sales count and no bestseller language anywhere", () => {
  const code = readFileSync(new URL("../app/niche-watch.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /bestseller|best.seller|top.seller|units sold|estimated sales/i);
  for (const line of Object.values(LABELS))
    assert.doesNotMatch(line, /sold|sales|bestseller/i);
});

/* -------------------------------------------------------- morning update */
import { buildUpdate, NOISE, NOTHING_NEW } from "../app/market-update.ts";

const niche = (over = {}) => ({ phrase: "bachelorette", newlyMoving: 0,
  newlyRepeated: 0, moving: 40, shops: 30, ...over });
const shop = (over = {}) => ({ shopName: "a shop", shopId: 1,
  headline: "Buyers keep mentioning slow delivery.", support: 6, ...over });

test("an update with nothing in it is not produced", () => {
  const update = buildUpdate([niche()], []);
  assert.equal(update.empty, true);
  assert.equal(update.lines.length, 0);
  assert.match(NOTHING_NEW, /Nothing new in your watches/);
});

test("a healthy but unchanged niche is not news", () => {
  /* 40 listings moving is good. It is not a reason to wake anybody. */
  assert.equal(buildUpdate([niche({ moving: 40 })], []).empty, true);
});

test("a niche earns a line only when something newly qualified", () => {
  const update = buildUpdate([niche({ newlyMoving: 3, newlyRepeated: 1 })], []);
  assert.equal(update.empty, false);
  assert.match(update.lines[0], /3 listings newly showing momentum/);
  assert.match(update.lines[0], /1 listing now showing repeated momentum/);
});

test("a level that fell never becomes a negative line", () => {
  const update = buildUpdate([niche({ newlyMoving: -4 })], []);
  assert.equal(update.empty, true);
});

test("one review is never a shop pattern", () => {
  assert.equal(buildUpdate([], [shop({ support: 1 })]).empty, true);
  assert.equal(buildUpdate([], [shop({ support: 6 })]).empty, false);
});

test("no noise line can reach the update", () => {
  const update = buildUpdate([niche({ newlyMoving: 2 })], [shop()]);
  const text = update.lines.join(" ").toLowerCase();
  for (const noise of NOISE)
    assert.ok(!text.includes(noise), `the update said "${noise}"`);
});

test("the update never infers sales or says bestseller", () => {
  const update = buildUpdate([niche({ newlyMoving: 5 })], [shop()]);
  const text = update.lines.join(" ").toLowerCase();
  for (const banned of ["bestseller", "sold", "sales", "units"])
    assert.ok(!text.includes(banned), `the update said "${banned}"`);
});

test("the update needs no paid call", () => {
  const code = readFileSync(new URL("../app/market-update.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /fal\.run|anthropic|openai|fetch\(/i);
});

/* ------------------------------------------------------------- interface */
const MW = readFileSync(
  new URL("../app/market-watch/market-watch-client.tsx", import.meta.url), "utf8");
const MWCSS = readFileSync(
  new URL("../app/market-watch/market-watch.css", import.meta.url), "utf8");
const mwBare = MW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("no touch target is under 40 CSS pixels", () => {
  const heights = [...MWCSS.matchAll(/min-height:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(heights.length >= 5);
  for (const height of heights) assert.ok(height >= 40, `a ${height}px target`);
});

test("a long niche or shop name cannot widen the page", () => {
  /* The add-row input is the classic culprit: flex items default to
     min-width:auto and refuse to shrink below their content. */
  assert.match(MWCSS, /\.add input\s*\{[^}]*min-width:\s*0/);
  for (const selector of [".watch .name", ".card .title", ".pattern p"])
    assert.ok(new RegExp(`\\${selector}\\s*\\{[^}]*overflow-wrap:\\s*anywhere`).test(MWCSS),
      `${selector} does not wrap long words`);
  /* Media queries legitimately name widths; declarations must not. */
  const declarations = MWCSS.replace(/@media[^{]*\{/g, "{");
  assert.doesNotMatch(declarations, /min-width:\s*(4[5-9]\d|[5-9]\d\d|\d{4,})px/);
});

test("listing images cannot overflow their card", () => {
  assert.match(MWCSS, /\.card img\s*\{[^}]*max-width:\s*100%/);
  assert.match(MWCSS, /\.card img\s*\{[^}]*aspect-ratio/);
});

test("every listing card offers a direct Etsy link", () => {
  assert.match(MW, /href=\{listing\.etsyUrl\}/);
  /* Shop Watch cards carry a server-built URL rather than composing one, so
     a shop-level pattern links to the shop and a listing-level one to the
     listing. */
  assert.match(MW, /href=\{card\.listing\.url\}/);
  assert.match(MW, /rel="noreferrer noopener"/);
});

test("the four Shop Watch sections are exactly the four", () => {
  const names = [...MW.matchAll(/\["(Listings buyers reviewed|What buyers love|What buyers dislike|Shop changes)",/g)]
    .map(match => match[1]);
  assert.deepEqual(names,
    ["Listings buyers reviewed", "What buyers love", "What buyers dislike", "Shop changes"]);
});

test("the interface never shows a sale count, score or raw review feed", () => {
  for (const banned of ["soldCount", "estimatedSales", "score", "quantity",
    "evidenceClass", "attribution", "reviewText"])
    assert.ok(!mwBare.includes(banned), `the interface shows ${banned}`);
});

test("a stale watch is labelled, not emptied", () => {
  assert.match(MW, /Showing saved results/);
  assert.match(MW, /stale-flag/);
});

test("empty and gathering states say what is happening", () => {
  assert.match(MW, /it does not establish how many units an individual listing sold/);
  assert.match(MW, /Current Etsy data could not be refreshed/);
  // Catalog, feedback, and changes now have separate empty states.
  assert.match(MW, /No recent review summary is available for this shop/);
  assert.match(MW, /No shop changes have been recorded yet/);
  assert.match(MW, /No active listings are available from Etsy/);
});

test("patterns are never presented as instructions", () => {
  const block = MW.slice(MW.indexOf("What the moving listings have in common"));
  for (const banned of ["you should", "try", "copy", "next move", "recommend"])
    assert.ok(!block.slice(0, 400).toLowerCase().includes(banned));
});

test("a stale image is not displayed as current", () => {
  /* Past Etsy's six-hour display window the picture is withheld rather than
     shown as though it were current. */
  assert.match(MW, /listing\.imageUrl && listing\.displayFresh/);
});

test("Market Watch does not read the member's own shop", () => {
  for (const banned of ["shop-map", "shopMap", "ownShop", "myListings", "profit", "revenue"])
    assert.ok(!mwBare.includes(banned), `Market Watch reads ${banned}`);
});

test("meaningful momentum uses the same bar the scanner does", () => {
  /* Measured: Halloween had 17 listings across 17 shops and 2 repeats. It
     read as meaningful here and was refused by Design Scanner. */
  const halloween = Array.from({ length: 17 }, (unused, index) =>
    evidence({ listingId: index, shopId: index, intervals: index < 2 ? 2 : 1 }));
  const summary = summarize(halloween, NOW);
  assert.equal(summary.moving, 17);
  assert.equal(summary.repeated, 2);
  assert.equal(summary.meaningfulMomentum, false,
    "a niche the scanner refuses was called meaningful");

  const bachelorette = Array.from({ length: 20 }, (unused, index) =>
    evidence({ listingId: index, shopId: index, intervals: index < 9 ? 2 : 1 }));
  assert.equal(summarize(bachelorette, NOW).meaningfulMomentum, true);
});

test("a watch with no previous day contributes nothing to the update", () => {
  /* Measured on the first live run: with no baseline, the missing previous
     reading was treated as zero and the update announced the entire existing
     cohort — 42 bachelorette listings — as newly moving. */
  const firstDay = buildUpdate([], []);
  assert.equal(firstDay.empty, true);
  const source = readFileSync(
    new URL("../app/api/market-watch/update/route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!current \|\| !before\) continue;/);
  /* And the baseline must come from an earlier DAY, not merely an earlier row,
     or opening the page twice this morning erases an overnight change. */
  assert.match(source, /observed_day < \?/);
});

test("every column Shop Watch reads exists on the table it reads from", () => {
  /* Twice now a query has asked for a column the table does not have, the
     catch has swallowed the error, and a section has rendered permanently
     empty. This compares the SELECTed columns against the CREATE TABLE. */
  const store = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8");
  const route = readFileSync(
    new URL("../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");

  const columnsOf = name => {
    const start = store.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
    if (start < 0) return null;
    const body = store.slice(start, store.indexOf(")`", start));
    return new Set([...body.matchAll(/^\s*([a-z_]+)\s+(INTEGER|TEXT|REAL)/gm)]
      .map(match => match[1]));
  };
  const member = columnsOf("member_shop_watches");
  assert.ok(member, "member_shop_watches is not defined where expected");

  /* Columns the brief route reads with an m. prefix must be on that table. */
  for (const match of route.matchAll(/\bm\.([a-z_]+)\b/g))
    assert.ok(member.has(match[1]),
      `the brief reads member_shop_watches.${match[1]}, which does not exist`);
  assert.ok(!member.has("shop_name"),
    "member_shop_watches gained shop_name; the join can be simplified");
});

test("a broken watch query is reported, never shown as watching nothing", () => {
  const route = readFileSync(
    new URL("../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  assert.match(route, /queryFailed/);
  assert.match(route, /\.\.\.\(queryFailed \? \{ error: queryFailed \} : \{\}\)/);
});

test("a second watcher of an existing shop starts no new collection", () => {
  /* `shared` was inferred from the upsert's changed-row count, but the
     DO UPDATE clause reports a change on both paths, so it was always false
     and the shared-collection saving was invisible. It is now asked before
     the write. */
  const store = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8");
  const addWatch = store.slice(store.indexOf("export async function addWatch"),
    store.indexOf("export async function removeWatch"));
  assert.match(addWatch, /SELECT 1 AS found FROM watched_shops WHERE shop_id = \?/);
  assert.match(addWatch, /const shared = Boolean\(collected\);/);
  /* And the existence check comes before the upsert that would mask it. */
  assert.ok(addWatch.indexOf("SELECT 1 AS found") < addWatch.indexOf("INSERT INTO watched_shops"),
    "the existence check runs after the write that makes it meaningless");
});

test("removing a personal watch keeps the shared shop and its history", () => {
  const store = readFileSync(new URL("../app/shop-watch.ts", import.meta.url), "utf8");
  const removeWatch = store.slice(store.indexOf("export async function removeWatch"),
    store.indexOf("export async function watchesFor"));
  assert.match(removeWatch, /DELETE FROM member_shop_watches/);
  for (const table of ["watched_shops", "shop_reviews", "shop_observations"])
    assert.ok(!new RegExp(`DELETE FROM ${table}`).test(removeWatch),
      `removing a personal watch deletes ${table}`);
});

test("a withheld image explains itself instead of rendering an empty box", () => {
  /* Measured in the browser: 44 of 45 cards showed a blank grey square,
     because the six-hour rule was withholding images nothing was refreshing. */
  assert.match(MW, /Photo needs refreshing/);
  assert.match(MW, /Photo unavailable from Etsy/);
  assert.ok(!MW.includes('background: "#f4f2ef"'),
    "the unexplained grey box is still rendered");
  assert.match(MWCSS, /\.no-image \{/);
});

test("reference images are refreshed on the clock, not only by hand", () => {
  const scheduled = readFileSync(
    new URL("../scripts/add-scheduled-handler.mjs", import.meta.url), "utf8");
  assert.match(scheduled, /recover-images\?batches=3/);
  assert.match(scheduled, /six-hour display rule/);
  const route = readFileSync(new URL(
    "../app/api/design-scanner/recover-images/route.ts", import.meta.url), "utf8");
  assert.match(route, /ALSO ON THE CLOCK/);
  assert.match(route, /const internal = !request\.headers\.get\("cf-connecting-ip"\)/);
});

test("the refresh spends its calls where a member would see a blank box", () => {
  const route = readFileSync(new URL(
    "../app/api/design-scanner/recover-images/route.ts", import.meta.url), "utf8");
  assert.match(route, /OLDEST FIRST, AND WHAT A MEMBER CAN SEE FIRST/);
  /* The cards come from the momentum corpus, not the watching pool — the
     pool has no evidence yet, so none of it renders. */
  assert.match(route, /WHAT A MEMBER ACTUALLY SEES IS THE MOMENTUM CORPUS/);
  assert.match(route, /FROM listing_sales_activity/);
  assert.match(route, /ORDER BY intervals DESC, lastSeen DESC/);
  assert.match(route, /inNiche\.has/);
});

test("Shop Watch cards read the shape the brief returns", () => {
  /* Measured in the browser: every card rendered as "reviews · 30 days" with
     no pattern and no link, because the client declared `headline`/`support`/
     `listingId` and the route returns `pattern`/`evidence`/`window`/`listing`. */
  const route = readFileSync(new URL(
    "../app/api/shop-watch/brief/route.ts", import.meta.url), "utf8");
  const returned = route.slice(route.indexOf("function present"));
  for (const field of ["pattern:", "evidence:", "window:", "listing:"])
    assert.ok(returned.includes(field), `the brief no longer returns ${field}`);

  assert.match(MW, /\{card\.pattern\}/);
  assert.match(MW, /\{card\.evidence\}/);
  assert.match(MW, /card\.listing\?\.url/);
  for (const stale of ["card.headline", "card.support", "card.listingId"])
    assert.ok(!MW.includes(stale), `the card still reads ${stale}`);
});
