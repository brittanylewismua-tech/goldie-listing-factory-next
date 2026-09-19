import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  THE OBJECT A DELETED BATCH LEAVES BEHIND.

  Batch templates are content-addressed per member, so two batches built from
  the same saved product point at ONE object. Deleting a batch row therefore
  cannot remove its snapshot on its own — doing so would break the batch that
  is staying. The row delete leaves it, and this removes it only once nothing
  references it.

  Guard-rails asserted here rather than discovered later: the key must be this
  member's own, it must be a batch template, nothing may still reference its
  hash, and the removal is confirmed by reading the object back.
*/
const source = readFileSync(
  new URL('../app/api/batches/route.ts', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function removeOrphanTemplate'),
  source.indexOf('export async function DELETE'));

test('only the owner can ask, and only for one named key', () => {
  assert.match(source, /orphanTemplate\)\{if\(!isOwner\(user\)\)/);
  /* No listing, no prefix sweep, no wildcard: one key, given explicitly. */
  assert.ok(!/\.list\(/.test(fn), 'it scans the bucket instead of taking one key');
  assert.match(source, /String\(orphanTemplate\)\.slice\(0,300\)/);
});

test('a key outside the member\'s own prefix is refused', () => {
  assert.match(fn, /batch-templates\/\$\{encodeURIComponent\(userId\)\}\//);
  assert.match(fn, /not a batch template belonging to you/);
  /* The shape is pinned to a 64-character content hash, so no path games. */
  assert.match(fn, /\[a-f0-9\]\{64\}/);
});

test('an object still referenced by any remaining batch is refused', () => {
  assert.match(fn, /SELECT id FROM listing_batches WHERE user_id=\? AND state_json LIKE \?/);
  assert.match(fn, /Still referenced by a saved batch/);
  /* A failed check refuses too: not knowing is not permission. */
  assert.match(fn, /references could not be checked, so nothing was removed/);
});

test('removal is confirmed by reading the object back', () => {
  assert.match(fn, /const after=Boolean\(await bucket\.get\(key\)\)/);
  assert.match(fn, /confirmedGone:!after/);
});

test('a key that is already gone is not an error', () => {
  assert.match(fn, /No such object; nothing to remove/);
});
