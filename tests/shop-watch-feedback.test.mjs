import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  SAVING SOMETHING ALREADY SAVED IS AN OUTCOME, NOT SILENCE.

  Adding a shop already on the watch list cleared the input and said nothing.
  Verified live: the server answers {"alreadyWatched":true} and creates no
  duplicate — the interface simply threw that away, so the only way to tell
  whether the click had worked was to count the rows.
*/
const client = readFileSync(
  new URL('../app/market-watch/market-watch-client.tsx', import.meta.url), 'utf8');

test('the already-watched reply reaches the member', () => {
  assert.match(client, /alreadyWatched/,
    'the client still ignores the field the server sends');
  assert.match(client, /already on your watch list/);
});

test('a notice is not rendered as a failure', () => {
  /* It is not an error: nothing went wrong and nothing is missing. */
  assert.match(client, /role="status"/);
  const noticeLine = /\{!error && notice &&[^\n]*\}/.exec(client);
  assert.ok(noticeLine, 'the notice is not rendered');
  assert.ok(!/className="error"/.test(noticeLine[0]),
    'the already-watched notice is styled as an error');
});

test('the notice is cleared before each attempt and when tabs change', () => {
  /* A stale "already watched" sitting above a different shop would be worse
     than saying nothing. */
  const add = /const add = async \(\) => \{[\s\S]*?\n  \};/.exec(client);
  assert.ok(add, 'add handler not found');
  assert.match(add[0], /setNotice\(""\)/);
  const tab = /const chooseTab = [\s\S]*?\n  \};/.exec(client);
  assert.ok(tab, 'chooseTab not found');
  assert.match(tab[0], /setNotice\(""\)/);
});

test('a duplicate is still refused as a duplicate on the server', async () => {
  /* The interface change must not turn into the server allowing two rows. */
  const store = readFileSync(new URL('../app/shop-watch.ts', import.meta.url), 'utf8');
  assert.match(store, /alreadyWatched: Number\(watchWrite\.meta\?\.changes \?\? 0\) === 0/,
    'alreadyWatched is no longer derived from whether a row was actually written');
});
