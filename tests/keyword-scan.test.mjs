import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanParams,pagesToScan,rankScan,momentum,coverage,SCAN_PAGE,SCAN_CAP} from '../app/keyword-scan.ts';

/* The page this replaces showed 24 listings out of 209 and offered four sort
   orders, none of which was favorites or views - because it asked Etsy to do
   the sorting, and Etsy's sort_on takes only created, updated, price and
   score. Ranking 24 listings Etsy already picked is Etsy's answer relabelled.
   These tests exist so that cannot come back. */

test('Etsy is asked for its own page size, not ours', () => {
  const params = scanParams('auntie shirt', 0, 'sweatshirt');
  assert.equal(params.get('keywords'), 'auntie shirt sweatshirt');
  assert.equal(params.get('limit'), '100', 'Etsy allows 100 per call; 24 was self-imposed');
  assert.equal(params.get('sort_on'), 'score', 'relevance in, ranking done here');
  assert.equal(scanParams('x', 300).get('offset'), '300');
});

test('a small keyword is covered completely, a huge one is capped', () => {
  assert.equal(pagesToScan(209), 3, '209 listings is three calls - the entire market for that phrase');
  assert.equal(pagesToScan(100), 1);
  assert.equal(pagesToScan(101), 2);
  assert.equal(pagesToScan(245912), SCAN_CAP / SCAN_PAGE);
  assert.equal(pagesToScan(null), 1);
});

test('the coverage sentence says which of those two happened', () => {
  assert.match(coverage(209, 209), /every one of the 209/);
  assert.match(coverage(1000, 245912), /1,000 most relevant of 245,912/);
  assert.match(coverage(1000, 245912), /narrower keyword/);
});

const row = (listingId, favorites, views, ageDays, priceCents = 100) =>
  ({listingId, favorites, views, ageDays, priceCents, createdAt: 1, listedAt: ageDays});

test('favorites and views rank the whole scan, which Etsy will not do at all', () => {
  const rows = [row(1, 5, 90, 30), row(2, 900, 10, 30), row(3, 40, 4000, 30)];
  assert.deepEqual(rankScan(rows, 'favorites').map(r => r.listingId), [2, 3, 1]);
  assert.deepEqual(rankScan(rows, 'views').map(r => r.listingId), [3, 1, 2]);
});

test('relevance keeps Etsy order untouched', () => {
  const rows = [row(1, 5, 9, 30), row(2, 900, 10, 30)];
  assert.deepEqual(rankScan(rows, 'relevance').map(r => r.listingId), [1, 2]);
});

test('a missing measurement sorts last, never as a zero', () => {
  const rows = [row(1, null, null, 30), row(2, 3, 3, 30)];
  assert.deepEqual(rankScan(rows, 'favorites').map(r => r.listingId), [2, 1]);
  assert.deepEqual(rankScan(rows, 'views').map(r => r.listingId), [2, 1]);
});

test('favorites per day separates an old hit from a live one', () => {
  /* 2,088 favorites over five years is not 300 over three weeks, and raw
     favorites cannot tell them apart - it pays listings for being old. */
  const old = row(1, 2088, 0, 1825), fresh = row(2, 300, 0, 21);
  assert.ok(momentum(fresh) > momentum(old));
  assert.deepEqual(rankScan([old, fresh], 'momentum').map(r => r.listingId), [2, 1]);
  /* A listing younger than a week is excluded rather than divided by nearly
     zero, which would float every two-favorite newborn to the top. */
  assert.equal(momentum(row(3, 2, 0, 3)), null);
  assert.deepEqual(rankScan([row(3, 2, 0, 3), old], 'momentum').map(r => r.listingId), [1, 3]);
});

test('the scan is paid for once and re-ranked for free', () => {
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  const detail = client.slice(client.indexOf('function NicheDetail'), client.indexOf('function ListingCard'));
  /* If `sort` were a dependency of the loader, every change of ordering would
     spend another ten Etsy calls asking the same question a different way -
     which is the cost that got the ranking handed back to Etsy in the first
     place. */
  assert.match(detail, /\},\[view\.key,search\]\);/, 'the scan depends on the keyword and the query, not the sort');
  assert.match(detail, /rankScan\(rows,sort\)/, 'ordering is applied to what is already loaded');
  assert.match(detail, /useState<KeywordOrder>\("favorites"\)/, 'favorites is the default, being the one Etsy cannot do');
  assert.match(detail, /controller\.signal\.aborted/);
});

test('live search still requires the feature and a member-owned keyword', () => {
  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  assert.match(route, /requireFeatureApi\('marketWatch'\)/);
  assert.match(route, /watchesFor\(access.user.userId\)/);
  assert.match(route, /if\(!watch\).*status:404/);
  assert.match(route, /status:502/);
  assert.doesNotMatch(route, /readNiche|addCandidates|relates\(/, 'no saved pool substituted for a live search');
});

test('photographs are fetched for the page shown, not for the whole scan', () => {
  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  /* Ranking fields ride along on the search response; only images need the
     batch endpoint. Hydrating all 1,000 would double the cost of the scan to
     fetch pictures of listings nobody has scrolled to. */
  assert.match(route, /listingDisplay\(ranked\.slice\(0,SCAN_PAGE\)/);
});
