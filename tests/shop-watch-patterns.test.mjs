import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gettingAttention, whatBuyersLove, whatBuyersDislike, whatChanged,
  buildBrief, freshness, MIN_SUPPORT, RATING_MIN_SUPPORT, FRESH_SECONDS,
} from "../app/shop-watch-patterns.ts";

const NOW = 1_800_000_000;
const review = (over = {}) => ({
  transactionId: Math.floor(Math.random() * 1e9), listingId: 1, rating: 5,
  review: "", createdAt: NOW - 86_400, ...over,
});
const many = (count, over = {}) => Array.from({ length: count }, () => review(over));

test("a listing drawing most recent reviews is surfaced", () => {
  const reviews = [...many(8, { listingId: 1 }), ...many(2, { listingId: 2 }),
    ...many(2, { listingId: 3 })];
  const found = gettingAttention(reviews, NOW);
  assert.equal(found[0].listingId, 1);
  assert.equal(found[0].sampleSize, 8);
  /* The wording counts reviews, never sales. */
  assert.match(found[0].headline, /reviews/);
  assert.doesNotMatch(found[0].headline, /sale|sold|purchase/i);
});

test("an even spread is not a pattern", () => {
  const reviews = [...many(4, { listingId: 1 }), ...many(4, { listingId: 2 }),
    ...many(4, { listingId: 3 })];
  assert.deepEqual(gettingAttention(reviews, NOW), []);
});

test("one enthusiastic review is not a pattern", () => {
  const reviews = many(1, { review: "so soft", listingId: 1 });
  assert.deepEqual(whatBuyersLove(reviews, NOW), []);
  assert.deepEqual(gettingAttention(reviews, NOW), []);
});

test("repeated praise is found once enough buyers say it", () => {
  const reviews = many(MIN_SUPPORT, { review: "This is so soft and warm" });
  const love = whatBuyersLove(reviews, NOW);
  assert.ok(love.length > 0);
  assert.match(love[0].headline, /soft/);
  assert.equal(love[0].evidenceClass, "deterministic-text-pattern");
  assert.equal(love[0].supportingReviewIds.length, MIN_SUPPORT);
});

test("complaints come from low ratings, praise from high", () => {
  const unhappy = many(MIN_SUPPORT, { rating: 2, review: "runs small sadly" });
  const dislike = whatBuyersDislike(unhappy, NOW);
  assert.ok(dislike.length > 0);
  assert.match(dislike[0].headline, /runs small/);
  /* A five-star review saying "runs small" is not a complaint pattern. */
  assert.deepEqual(whatBuyersDislike(many(MIN_SUPPORT, { rating: 5, review: "runs small" }), NOW), []);
});

test("a phrase spread across listings is not blamed on one product", () => {
  const spread = [review({ rating: 2, review: "too small", listingId: 1 }),
    review({ rating: 2, review: "too small", listingId: 2 }),
    review({ rating: 2, review: "too small", listingId: 3 })];
  assert.equal(whatBuyersDislike(spread, NOW)[0].listingId, null);
});

test("a substring is not a mention", () => {
  /* The Light Pink lesson: whole words only. */
  const reviews = many(MIN_SUPPORT, { review: "the software was fine" });
  assert.deepEqual(whatBuyersLove(reviews, NOW).filter(p => /"soft"/.test(p.headline)), []);
});

test("review timestamps never become sale timestamps", () => {
  const module = readFileSync(new URL("../app/shop-watch-patterns.ts", import.meta.url), "utf8");
  assert.match(module, /It is not a sale/);
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /soldAt|saleDate|purchasedAt/);
});

test("a field Etsy did not expose produces nothing, not a zero", () => {
  const changed = whatChanged({}, { favorites: 40 }, NOW, 20);
  assert.deepEqual(changed, [], "a change was reported from a single observation");
  const both = whatChanged({ favorites: 30 }, { favorites: 40 }, NOW, 20);
  assert.equal(both.length, 1);
  assert.equal(both[0].evidenceClass, "confirmed-shop-total");
});

test("a rating move needs more support than anything else", () => {
  const thin = whatChanged({ averageRating: 4.8 }, { averageRating: 4.6 }, NOW, RATING_MIN_SUPPORT - 1);
  assert.deepEqual(thin, []);
  const enough = whatChanged({ averageRating: 4.8 }, { averageRating: 4.6 }, NOW, RATING_MIN_SUPPORT);
  assert.equal(enough.length, 1);
});

test("stale evidence is labelled rather than shown as current", () => {
  assert.equal(freshness(NOW - 3_600, NOW).fresh, true);
  const stale = freshness(NOW - FRESH_SECONDS - 3_600, NOW);
  assert.equal(stale.fresh, false);
  assert.match(stale.label, /hours ago/);
});

test("every card carries its own evidence for audit", () => {
  const reviews = [...many(8, { listingId: 1, review: "so soft and true to size" }),
    ...many(2, { listingId: 2 })];
  const brief = buildBrief({ reviews, previous: { favorites: 10 },
    current: { favorites: 12 }, refreshedAt: NOW - 600, now: NOW });
  for (const section of ["attention", "love", "dislike", "changed"])
    for (const card of brief[section]) {
      assert.ok(card.sampleSize > 0, "a card claims a pattern with no sample");
      assert.ok(card.windowTo > card.windowFrom, "a card has no date window");
      assert.ok(card.evidenceClass, "a card has no evidence class");
      if (card.evidenceClass === "deterministic-text-pattern")
        assert.ok(card.supportingReviewIds.length >= MIN_SUPPORT);
    }
  assert.equal(typeof brief.reviewsConsidered, "number");
});

test("the brief never advises what to make", () => {
  const module = readFileSync(new URL("../app/shop-watch-patterns.ts", import.meta.url), "utf8");
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const word of ["you should", "recommend", "next move", "try making", "opportunity"])
    assert.doesNotMatch(code, new RegExp(word, "i"), `the brief advises: ${word}`);
});
