import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanParams,pagesToScan,rankScan,momentum,SCAN_PAGE,SCAN_CAP} from '../app/keyword-scan.ts';

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

test('the winner profile describes, and never instructs', () => {
  /* Etsy ranks its own search partly on titles, so a word common among the
     winners can be a fact about Etsy rather than about buyers. The panel is
     allowed to say what fifty listings look like and is not allowed to turn
     that into advice. */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  const panel = client.slice(client.indexOf('function WinnerProfile'), client.indexOf('function ListingCard'));
  assert.match(panel, /Subject matter to weigh, not tags to copy/);
  assert.doesNotMatch(panel, /you should|make sure|we recommend|best practice|optimi[sz]e/i);
  const profile = readFileSync(new URL('../app/keyword-profile.ts', import.meta.url), 'utf8');
  /* Four of fifty is the floor for calling a word recurring; below it a
     "pattern" is two listings from one shop. */
  assert.match(profile, /entry\.winners >= 4/);
  /* Every listing returned for a phrase contains that phrase. Reporting
     "bookish - 50 of the top 50" is true, useless, and was the most prominent
     row on the page. A generic stop list cannot catch it: the offending word
     is different for every search. */
  assert.match(profile, /const asked = new Set\(words\(phrase\)\)/);
  assert.match(profile, /\.filter\(word => !asked\.has\(word\)\)/);
  /* A band, not a min and a max: one listing at $4 must not widen it. */
  assert.match(profile, /sorted\[Math\.floor\(sorted\.length \* 0\.25\)\]/);
  /* Every price is converted to USD before the band is taken. Refusing a band
     unless the whole top fifty shared a currency was the careful-sounding
     version that produced no band at all on a real search. */
  assert.match(profile, /usdFromCents\(row\.priceCents, row\.currency\)/);
});

test('the results never say how much of the pool they hold', () => {
  /* The page printed "24 of 209 Etsy matches shown", and after the rebuild a
     politer version of the same thing. Both tell a seller only that they are
     looking at a fraction, which is an argument for closing the tab and
     opening Etsy. How complete a scan is on a given phrase is this software's
     problem, not a caption. Asked for twice; guarded here so it stops coming
     back. */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  const detail = client.slice(client.indexOf('function NicheDetail'), client.indexOf('function ListingCard'));
  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(detail, /matches shown|listings scanned|of \{total|ranked\b.*toLocaleString|scanned\.toLocaleString/);
  assert.doesNotMatch(detail, /coverage/i);
  assert.doesNotMatch(route, /coverage:|complete:|scanned:/,
    'the endpoint does not hand the page a sentence about its own coverage');
  assert.match(route, /listings:withCounts,profile,shelf:shelf\|\|null,total:first\.total,photosUnavailable/);
  for (const phrase of ['most relevant of', 'covered completely', 'Ranked every one'])
    assert.doesNotMatch(client, new RegExp(phrase));
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
  /* The scan depends on the keyword, the search within it, and the product
     type - never on the sort, which is applied to what is already loaded. */
  assert.match(detail, /\},\[view\.key,search,shelf\]\);/);
  assert.doesNotMatch(detail, /\},\[view\.key,search,shelf,sort\]/);
  assert.match(detail, /rankScan\(rows,effectiveSort\)/, 'ordering is applied to what is already loaded');
  /* A sort that returns nothing is worse than a sort that is not offered:
     units are counted from two readings, so a phrase scanned for the first
     time has none, and the option appears only when something has a count. */
  assert.match(detail, /rows\.some\(row=>row\.soldUnits!=null\)&&<option value="sold">/);
  assert.match(detail, /sort==="sold"&&!countsExist\?"favorites":sort/);
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

test('the pages of a scan go out together, not in single file', () => {
  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  /* Ten pages awaited one at a time took 39 seconds on the live build. Each
     Etsy round trip is about four seconds; the pacer only needs a quarter of
     one between requests, so the waiting is what overlaps. */
  assert.match(route, /await Promise\.all\(Array\.from\(\{length:Math\.max\(0,pages-1\)\}/);
  assert.match(route, /\.catch\(\(\)=>\[\] as EtsyDisplayListing\[\]\)/,
    'a failed page leaves a gap in the ranking rather than failing the scan');
});

test('photographs are fetched for the page shown, not for the whole scan', () => {
  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  /* Ranking fields ride along on the search response; only images need the
     batch endpoint. Hydrating all 1,000 would double the cost of the scan to
     fetch pictures of listings nobody has scrolled to. */
  assert.match(route, /listingDisplay\(ranked\.slice\(0,SCAN_PAGE\)/);
});

test('a tracked keyword and a tracked shop can both be untracked', () => {
  /* Both endpoints have accepted `remove` since they were written. Neither
     had a control, so a watchlist could only ever grow - and the shop list is
     capped at 25, which with no way to drop one stops being a limit and
     starts being a lock. */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /stopWatching\("niche",watch\.key,watch\.phrase\)/);
  assert.match(client, /stopWatching\("shop",shop\.shopId,shop\.shopName\)/);
  assert.match(client, /confirmAction\(\{eyebrow:"MARKET WATCH"/, 'removal is confirmed, not one click');
  assert.match(client, /could not be removed\. Nothing was changed\./, 'a failed removal says nothing changed');
  for (const route of ['niches', 'shops']) {
    const source = readFileSync(new URL(`../app/api/market-watch/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /body\?\.remove/, `${route} still accepts a removal`);
  }
});

test('a product type narrows the scan at Etsy, not after it', () => {
  /*
    Measured live on the deployed build: the top fifty for "bachelorette"
    priced at $4-$25, with favors, decor, confetti, temporary and tattoos as
    the recurring words. All true, all a party-supplies business. For a seller
    printing shirts the whole panel described somebody else's market, and the
    price band was worse than useless because it looked like an answer.
  */
  assert.match(scanParams('bachelorette', 0, '', 1234).toString(), /taxonomy_id=1234/);
  assert.doesNotMatch(scanParams('bachelorette', 0).toString(), /taxonomy_id/,
    'no shelf chosen means no filter, not a guessed one');

  const route = readFileSync(new URL('../app/api/market-watch/listings/route.ts', import.meta.url), 'utf8');
  /* Etsy files one shelf under several ids - T-shirts exists under men's,
     women's, unisex and kids - and its search takes exactly one. Picking the
     first would hide three quarters of the t-shirts on Etsy while looking
     like it had worked. */
  assert.match(route, /taxonomies\[\(index\+1\)%taxonomies\.length\]/,
    'the pages round-robin across every id of the shelf');
  assert.match(route, /filter\(row=>row\.label===shelf\)/);
});

test('the blank the winners print on is read from the listing, not guessed', () => {
  /* Etsy's materials field looks like the place for this and is not: present
     on twenty of fifty listings, with values like "gildan or bella canvas
     shirt" and "bulk order". Sellers put the brand in the title deliberately,
     because buyers search for it. */
  const profile = readFileSync(new URL('../app/keyword-profile.ts', import.meta.url), 'utf8');
  assert.ok(profile.includes('Comfort Colors'), 'the blanks a POD seller chooses between are named');
  assert.ok(profile.includes('Bella + Canvas') && profile.includes('Gildan'));
  assert.match(profile, /\[row\.title, \.\.\.\(row\.tags \?\? \[\]\), \.\.\.\(row\.materials \?\? \[\]\)\]/,
    'title, tags and materials are all read, and a listing counts once');
  assert.match(profile, /entry\.winners >= 3/, 'three of fifty before it is a pattern');
});

test('the take-home figure uses the seller\'s own fee settings', () => {
  /*
    The band is what the market charges. It is not what the seller earns, and
    the gap is where print-on-demand businesses quietly fail. Etsy knows its
    fees and not the production cost; Printify knows the cost and not the
    fees; a research tool knows neither. This product holds both.
  */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /fetch\("\/api\/seller-preferences"\)/, 'the real saved rate, not an assumed one');
  assert.match(client, /cents\/100-cents\/100\*percent-fixed-/);
  /* A loss is shown as a loss rather than floored at zero. */
  assert.match(client, /data-negative=\{keep\(cents\)<0\?"yes":undefined\}/);
  /* And nothing is claimed until a cost is entered. */
  assert.match(client, /Enter what one costs you/);
});
