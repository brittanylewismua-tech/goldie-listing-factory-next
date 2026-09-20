import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INTERNAL_VALIDATION_MARKER, internalValidationTitle, isInternalValidationProduct,
} from '../app/printify-validation-marker.ts';

/*
  THE TITLE THE CLEANUP PATH DEPENDS ON.

  Printify answered, to a real request:

    Product is invalid. Title contains excessive caps.

  and then accepted the same title in mixed case. Both are real provider
  responses, so nothing here needs another live product to prove it.

  Two batches in the live history were the evidence before that: "INTERNAL
  TEST DO NOT ORDER" and "INTERNAL TEST DO NOT ORDER [gv9f3a1c]", each
  attempted once with a draft count of zero, beside "Internal Test Do Not
  Order [gv9f3a1c]" which succeeded.
*/

test('Printify accepts the title: it is not excessive caps', () => {
  const title = internalValidationTitle();
  const letters = title.replace(/[^A-Za-z]/g, '');
  const caps = letters.replace(/[^A-Z]/g, '').length;
  assert.ok(caps / letters.length < 0.6,
    `${caps}/${letters.length} letters are capitals — the shape Printify refused: "${title}"`);
  /* And no run of shouting long enough to read as caps either. */
  assert.ok(!/[A-Z]{5,}/.test(title), `a long all-caps run survives: "${title}"`);
  assert.ok(title.length <= 255);
});

test('the title survives the derivation the creation path applies', () => {
  /*
    When no title is supplied the creation path derives one from the design's
    file name with .replace(/[_-]+/g, " "). A marker containing a hyphen would
    arrive at Printify as "[gv 9f3a1c]" — silently different from the token
    cleanup matches on, leaving a product nothing could identify or remove.
  */
  const derived = internalValidationTitle().replace(/[_-]+/g, ' ');
  assert.ok(derived.includes(INTERNAL_VALIDATION_MARKER),
    `the marker did not survive derivation: "${derived}"`);
  assert.ok(isInternalValidationProduct(derived),
    'cleanup would not recognise the derived title');
  /* The marker itself must carry nothing the derivation rewrites. */
  assert.equal(INTERNAL_VALIDATION_MARKER.replace(/[_-]+/g, ' '), INTERNAL_VALIDATION_MARKER);
});

test('cleanup recognises the title it generates', () => {
  assert.equal(isInternalValidationProduct(internalValidationTitle()), true);
  /* And recognises it wherever the marker sits in the string. */
  assert.equal(isInternalValidationProduct(`something ${INTERNAL_VALIDATION_MARKER}`), true);
  assert.equal(isInternalValidationProduct(`${INTERNAL_VALIDATION_MARKER} leading`), true);
});

test('a member product is refused, including one that says INTERNAL TEST', () => {
  /*
    The prefix is deliberately not proof: "INTERNAL TEST" is a phrase a seller
    could plausibly type. Only the marker decides what may be removed.
  */
  for (const title of [
    'Unisex Heavy Cotton Tee',
    'INTERNAL TEST do not publish',        // the real title of the live test draft
    'INTERNAL TEST DO NOT ORDER',          // prefix, no marker
    'case test salt air',
    'gv9f3a1c',                            // marker without its brackets
    '[gv 9f3a1c]',                         // what a hyphenated marker would become
    '',
  ]) assert.equal(isInternalValidationProduct(title), false,
    `cleanup would delete a product titled "${title}"`);
});

test('the guarded route removes only marker-carrying products', () => {
  const route = readFileSync(
    new URL('../app/api/listing-factory/prepare/route.ts', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /if \(!isInternalValidationProduct\(String\(product\.title \?\? ""\)\)\)/);
  assert.match(code, /status: 409/);
  /* Confirmed by reading the product back, not by trusting the delete. */
  assert.match(code, /confirmedGone: confirm\.status === 404/);
});

test('cleanup is idempotent: a product already gone is not an error', () => {
  const route = readFileSync(
    new URL('../app/api/listing-factory/prepare/route.ts', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '');
  /* A 404 on the read answers "exists: false" rather than failing, so running
     cleanup twice is safe and the second run is not a broken one. */
  assert.match(code, /if \(readResponse\.status === 404\)/);
  assert.match(code, /exists: false/);
  assert.match(code, /Printify has no product with this id in this shop/);
});

test('the sweep finds test products without being allowed to delete them', () => {
  /* Finding is deliberately wider than removing: the sweep also matches the
     bare prefix so a mis-titled test is still visible, while removal stays
     on the marker alone. */
  const route = readFileSync(
    new URL('../app/api/listing-factory/prepare/route.ts', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /isInternalValidationProduct\(String\(entry\.title \?\? ""\)\)/);
  assert.match(code, /startsWith\(INTERNAL_TEST_PREFIX\)/);
});
