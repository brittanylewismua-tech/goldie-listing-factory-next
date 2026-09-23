import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkListing, TAG_LIMIT } from '../app/listing-check.ts';
import { profileWinners } from '../app/keyword-profile.ts';

/* eRank sells a listing audit against general rules. "Use all 13 tags" is true
   everywhere and therefore says nothing about the phrase a seller is entering.
   These check that the benchmark is the live top of that search instead. */

const winner = (title, priceCents, favorites, ageDays, personal = true) =>
  ({ title, priceCents, currency: 'USD', favorites, ageDays, tags: [], isPersonalizable: personal, shopSold: 5000 });

const field = [
  ...Array.from({ length: 12 }, (_u, i) => winner(`desert bachelorette scottsdale tee ${i}`, 3800 + i * 10, 400 - i, 300)),
  ...Array.from({ length: 12 }, (_u, i) => winner(`plain bride shirt ${i}`, 1500, 2, 300, false)),
];
const profile = profileWinners(field.slice(0, 12), field);

test('the price finding is measured against the winners, not against a rule', () => {
  const low = checkListing({ title: 'a'.repeat(50), tags: [], priceCents: 900, currency: 'USD', personalizable: true }, profile);
  assert.ok(low.some(f => f.key === 'price-low'), 'under the band is reported');
  const inside = checkListing({ title: 'a'.repeat(50), tags: [], priceCents: 3850, currency: 'USD', personalizable: true }, profile);
  assert.ok(inside.some(f => f.key === 'price-ok'), 'inside the band is confirmed, not only failures');
  /* A euro draft is converted to meet the band rather than skipped. Refusing
     to state a band unless the whole top fifty shared a currency produced, on
     a real search for "auntie shirt", no price finding at all. */
  const euro = checkListing({ title: 'a'.repeat(50), tags: [], priceCents: 900, currency: 'EUR', personalizable: true }, profile);
  assert.ok(euro.some(f => f.key === 'price-low'), 'a euro price is converted, not discarded');
  /* A currency the rate table does not carry is left out rather than counted
     at face value. */
  const unknown = checkListing({ title: 'a'.repeat(50), tags: [], priceCents: 900, currency: 'XYZ', personalizable: true }, profile);
  assert.ok(!unknown.some(f => f.key.startsWith('price')), 'an unconvertible price produces no finding');
});

test('empty tag slots are named, because they are the free fix', () => {
  const findings = checkListing({ title: 'a'.repeat(50), tags: ['one', 'two'], priceCents: null, currency: 'USD', personalizable: null }, profile);
  const tagFinding = findings.find(f => f.key === 'tag-count');
  assert.ok(tagFinding);
  assert.match(tagFinding.label, new RegExp(`${TAG_LIMIT - 2} tag slots empty`));
});

test('a tag Etsy will refuse to save is caught before publishing', () => {
  const findings = checkListing(
    { title: 'a'.repeat(50), tags: ['this tag is far too long for etsy'], priceCents: null, currency: 'USD', personalizable: null },
    profile);
  assert.ok(findings.some(f => f.key === 'tag-length'));
});

test('the subject words come from the winners of that search', () => {
  const findings = checkListing(
    { title: 'plain bride shirt', tags: [], priceCents: null, currency: 'USD', personalizable: null }, profile);
  const subjects = findings.find(f => f.key === 'subjects');
  assert.ok(subjects, 'a draft missing every winning word is told so');
  assert.match(subjects.detail, /desert|scottsdale/);
  /* And it is never phrased as an instruction: Etsy ranks its own search on
     titles, so the correlation cannot be separated from the ranking. */
  assert.match(subjects.detail, /not words to paste in/);
});

test('nothing in the check predicts, promises or instructs', () => {
  const every = [
    checkListing({ title: 'plain bride shirt', tags: [], priceCents: 900, currency: 'USD', personalizable: false }, profile),
    checkListing({ title: 'a'.repeat(80), tags: Array.from({ length: 13 }, (_u, i) => `t${i}`), priceCents: 3850, currency: 'USD', personalizable: true }, profile),
  ].flat();
  for (const finding of every)
    assert.doesNotMatch(`${finding.label} ${finding.detail}`,
      /will sell|guarantee|you should|must |boost|rank higher|optimi[sz]e/i,
      `a finding made a promise: ${finding.label}`);
});

test('the scanner no longer reads its empty database as a verdict on the design', () => {
  const record = readFileSync(new URL('../app/scan-record.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(record, /Not enough buyer activity has been recorded/);
  assert.match(record, /says nothing about what/);
  assert.match(record, /you made/);
  assert.match(record, /recorded in advance/);
});

test('the live check is on the page above the scan that can refuse', () => {
  const client = readFileSync(new URL('../app/design-scanner/design-scanner-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /<ListingCheck \/>/);
  assert.ok(client.indexOf('<ListingCheck />') < client.indexOf('scanner-compose'),
    'the half that always answers comes first');
});

test('a withheld profit names what is withholding it', () => {
  /* "Profit unavailable" reads as a broken feature. The number is being held
     back deliberately, because it would otherwise be wrong, and what holds it
     back is usually one order nobody knows the production cost of. */
  const route = readFileSync(new URL('../app/api/shop-map/map/route.ts', import.meta.url), 'utf8');
  assert.match(route, /missingCosts === 1 \? "One order's cost is missing"/);
  assert.match(route, /Revenue and Etsy fees are exact/);
  assert.doesNotMatch(route, /headline: profit === null \? "Profit unavailable"/);
  const client = readFileSync(new URL('../app/shop-map/shop-map-client.tsx', import.meta.url), 'utf8');
  /* And the listing, not the rule, is what tells two rows apart. */
  assert.match(client, /<b className="cc-row-title">\{action\.title\}<\/b>/);
});

test('a refusal hands its keyword to the check that always answers', () => {
  /* Pointing at a panel in prose and leaving the member to retype what they
     had already chosen is a dead end wearing a signpost. */
  const client = readFileSync(new URL('../app/design-scanner/design-scanner-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /new CustomEvent\("goldie-check-this-search",\{detail:result\.niche\}\)/);
  assert.match(client, /window\.addEventListener\("goldie-check-this-search", handOff\)/);
  assert.match(client, /setPhrase\(chosen\)/, 'the keyword arrives filled in');
});

test('a scan that takes seconds holds the shape of its answer', () => {
  /* Eight to sixteen seconds behind one short line above empty space is
     indistinguishable from a page that has failed. */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /This takes a few seconds/);
  assert.match(client, /listing-skeleton/);
});

test('a keyword card with no displayable photo says so', () => {
  /* Etsy will not let a photo older than six hours be displayed. An empty
     span per listing rendered four grey boxes and no reason. */
  const client = readFileSync(new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /keyword-thumbs-empty/);
  assert.match(client, /older than Etsy allows us to display/);
  assert.doesNotMatch(client, /<span key=\{listing\.listingId\} aria-hidden="true"\/>/);
});
