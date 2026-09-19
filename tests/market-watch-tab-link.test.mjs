import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  ?tab=shops OPENED THE NICHE TAB.

  Verified live: loading /market-watch?tab=shops rendered with Niche Watch
  aria-selected="true". The client reads the tab from window.location, and
  during server rendering there is no window — so the server decided "niches"
  and hydration kept it. The page WRITES that address when you switch tabs,
  so it was producing links that did not work: reload, back, forward, a new
  tab and a bookmark all landed on the wrong tab, and a shop state could not
  be linked to at all.
*/
const page = readFileSync(new URL('../app/market-watch/page.tsx', import.meta.url), 'utf8');
const client = readFileSync(
  new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');

test('the server decides the tab, because the client cannot', () => {
  assert.match(page, /searchParams/, 'the page does not read the query string');
  assert.match(page, /tab === "shops"/);
  assert.match(page, /startTab=\{startTab\}/,
    'the client prop that exists for this is still not passed');
});

test('the client still accepts the decision', () => {
  assert.match(client, /startTab\?\?\s*tabFromUrl|startTab \?\? tabFromUrl/,
    'the client no longer honours startTab');
  /* And must not overwrite the address it was given on first render. */
  assert.match(client, /if \(typeof window === "undefined" \|\| startTab\) return;/);
});

test('switching tabs still writes an address that now works', () => {
  const choose = /const chooseTab = [\s\S]*?\n  \};/.exec(client);
  assert.ok(choose, 'chooseTab not found');
  assert.match(choose[0], /url\.searchParams\.set\("tab", "shops"\)/);
  assert.match(choose[0], /url\.searchParams\.delete\("tab"\)/);
});
