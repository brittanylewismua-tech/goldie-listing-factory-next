import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize, stateOf } from '../app/niche-watch.ts';

/*
  THE LIST AND THE DETAIL PAGE MUST COUNT THE SAME THING.

  Measured live before this changed: bachelorette showed 131 listings moving
  on the list and 136 on the page behind it; halloween 131 against 143; dog
  mom 47 against 48; teacher 39 against 41. The list served the stored brief
  while the detail computed from current evidence, so the two drifted apart
  between refreshes and the member saw one number and then a different one.
*/
const evidence = (over = {}) => ({
  listingId: 1, shopId: 10, intervals: 2,
  lastConfirmedAt: 1_789_000_000, firstConfirmedAt: 1_788_000_000,
  present: true, linkedReviews: 3, ...over,
});

test('the three figures the list shows do not depend on review counts', () => {
  /* The list query skips the per-row review subquery for speed. That is only
     safe if moving, repeated and shops are unaffected by it. */
  const now = 1_789_100_000;
  const rows = [
    evidence({ listingId: 1, shopId: 10, linkedReviews: 9 }),
    evidence({ listingId: 2, shopId: 11, linkedReviews: 0 }),
    evidence({ listingId: 3, shopId: 11, intervals: 1, linkedReviews: 4 }),
  ];
  const withReviews = summarize(rows, now);
  const withoutReviews = summarize(rows.map(r => ({ ...r, linkedReviews: 0 })), now);
  assert.equal(withReviews.moving, withoutReviews.moving);
  assert.equal(withReviews.repeated, withoutReviews.repeated);
  assert.equal(withReviews.shops, withoutReviews.shops);
});

test('the per-member figure is not baked into a shared count', () => {
  /* "New since you last looked" belongs to one member; the list is the same
     for everyone, so it must not be computed there. */
  const now = 1_789_100_000;
  const rows = [evidence({ firstConfirmedAt: now - 100 })];
  assert.equal(summarize(rows, now).newSinceLastBrief, 0);
  assert.equal(summarize(rows, now, { since: now - 1000 }).newSinceLastBrief, 1);
});

test('both paths count through the same function, not two copies of it', () => {
  const brief = readFileSync(new URL('../app/niche-brief.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/market-watch/niches/route.ts', import.meta.url), 'utf8');
  /* One summarize import, used by readNiche and by the list builder. */
  assert.match(brief, /summariesForWatches/);
  assert.match(brief, /summarize\(evidence, now\)/);
  assert.match(brief, /const summary = summarize\(evidence, now, \{ since: since_ \}\)/);
  /* The route must not compute counts of its own. */
  const stripped = route.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/moving:\s*\w+\.filter/.test(stripped), false,
    'the route is counting listings itself again');
  assert.match(stripped, /summariesForWatches\(saved, now\)/);
});

test('a failed live read falls back to the stored brief, labelled', () => {
  const route = readFileSync(new URL('../app/api/market-watch/niches/route.ts', import.meta.url), 'utf8');
  const stripped = route.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(stripped, /summariesForWatches\(saved, now\)\.catch\(\(\) => null\)/,
    'a failed corpus read would blank the list instead of falling back');
  /* Live figures are current; only the fallback can be stale. */
  assert.match(stripped, /stale: fresh \? false :/);
});

test('a listing that has stopped moving is not counted as moving', () => {
  /* Guards the shared state rule the counts rest on. */
  const now = 1_789_100_000;
  const fresh = evidence({ lastConfirmedAt: now - 3600 });
  const ancient = evidence({ lastConfirmedAt: now - 400 * 86_400, firstConfirmedAt: now - 500 * 86_400 });
  assert.notEqual(stateOf(fresh, now), stateOf(ancient, now));
  assert.equal(summarize([ancient], now).moving, 0);
});
