import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  MEASURED LIVE BEFORE THIS CHANGED.

  The homepage said "13 listings started selling in bookish sweatshirt". The
  page it linked to said nothing had started selling since the keyword was last
  opened, and showed all 994 instead. Both were applying the same correct rule
  to a clock that moved between them: the keyword page fetches its own detail
  more than once per load, the first response set last_opened to now, and the
  second response — the one that renders — measured against that.

  girl power had the same fault in the other direction: the figure counted two
  and the page could show one.
*/
const store = readFileSync(new URL('../app/niche-watch-store.ts', import.meta.url), 'utf8');
const brief = readFileSync(new URL('../app/niche-brief.ts', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/api/home/route.ts', import.meta.url), 'utf8');
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '');

test('opening a keyword twice in one visit does not move the clock', () => {
  const body = strip(store);
  assert.match(body, /SAME_VISIT_SECONDS/,
    'markOpened is back to setting last_opened on every single read');
  assert.match(body, /if \(openedAt && now - openedAt < SAME_VISIT_SECONDS\) return;/);
  /* The promoted value is the previous visit, never now. */
  assert.doesNotMatch(body, /SET last_opened = \?, opened_at = \?[\s\S]{0,120}\.bind\(now, now/);
});

test('the column is added to a table that already exists', () => {
  assert.match(store, /ALTER TABLE niche_watches ADD COLUMN opened_at/,
    'CREATE TABLE IF NOT EXISTS will not add a column to an existing table');
  /* A cross-member UPDATE is what the scoping guard exists to catch. */
  assert.doesNotMatch(strip(store), /UPDATE niche_watches SET opened_at = last_opened/);
});

test('the homepage figure is not read from a frozen snapshot', () => {
  const body = strip(home);
  /* Reading the field off a live summary is right; parsing it out of the
     stored history row is the fault — a snapshot cannot be revised when
     opening the keyword resets the clock. */
  assert.doesNotMatch(body, /niche_watch_history/,
    'the homepage is reading the count out of a frozen snapshot again');
  assert.doesNotMatch(body, /JSON\.parse\([\s\S]{0,40}newSinceLastBrief/);
  assert.match(body, /summariesForWatches\(saved, now\)/);
});

test('nothing is counted that cannot be shown', () => {
  assert.match(brief, /row\.nicheKey === watch\.key && row\.title/);
  assert.match(brief, /const showable = rows\.filter\(row => row\.title\)/);
});

test('the listings the figure counted are the ones the page can show', () => {
  /* The list is cut to thirty-six, so the counted ones go first. */
  assert.match(brief, /all\.filter\(row => row\.startedSince\)[\s\S]{0,80}all\.filter\(row => !row\.startedSince\)/);
});

test('the filter is derived from the view, not latched at mount', () => {
  const client = readFileSync(
    new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  const body = strip(client);
  /*
    Measured live: the detail arrives empty and fills a moment later, so
    useState(startNew && startedCount>0) was decided against no listings and
    never reconsidered. Arriving from a figure that counted thirteen showed all
    994, and the banner announced that nothing had started selling while the
    page was still loading.
  */
  assert.doesNotMatch(body, /useState\(startNew/,
    'the filter is latched at mount again, before the view has any listings');
  assert.match(body, /const onlyNew=startNew&&!showAll&&startedCount>0;/);
  assert.match(body, /const askedForNew=startNew&&!showAll&&loaded&&startedCount===0;/,
    'the empty-state banner can claim nothing started selling while loading');
});

test('the narrowing joins the two lists on listing id', () => {
  const client = readFileSync(
    new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  /*
    startedSince is computed on the watch corpus and arrives on view.listings.
    The grid renders `rows`, a live Etsy search for the same keyword, which has
    never carried the field - so the filter matched nothing on every single
    load and a figure that counted 13 opened all 994.
  */
  assert.match(client, /const startedIds=new Set\(\(view\.listings\?\?\[\]\)\.filter\(l=>l\.startedSince\)/);
  assert.match(client, /filtered=onlyNew\?ranked\.filter\(row=>startedIds\.has\(row\.listingId\)\)/);
  /* Etsy's search need not return every counted listing. Say so, don't hide it. */
  assert.match(client, /missingFromSearch/);
  assert.match(client, /are not in Etsy&rsquo;s current results|not in Etsy's current results/);
  /* And the banner counts what is on screen, not what was hoped for. */
  assert.match(client, /Showing the \{filtered\.length\} listing/);
});

test('opening a saved watch still loads the corpus the figure counted', () => {
  const client = readFileSync(
    new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');
  /*
    The end of the chain. A saved watch opened straight from the list without
    fetching its detail, because the grid runs its own Etsy search. But
    startedSince lives on the corpus, so NicheDetail was handed a view with no
    listings: nothing to filter by and nothing to say either. Every earlier fix
    was correct and invisible because of this one line.
  */
  assert.doesNotMatch(client, /if\(saved\)\{setOpen\(\{key:saved\.key,phrase:saved\.phrase\}\);return;\}/,
    'the saved-watch shortcut is dropping the listings again');
  assert.match(client, /setOpen\(\{key:saved\.key,phrase:saved\.phrase,listings:saved\.listings\}\)/);
  assert.match(client, /setOpen\(current=>current&&current\.key===saved\.key\?\{\.\.\.current,\.\.\.body\}:current\)/,
    'the detail fetch must not overwrite a view the member has moved on from');
});
