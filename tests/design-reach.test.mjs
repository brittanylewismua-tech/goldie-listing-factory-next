import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designKey, designsOnOneProduct, familyLabel, shortLabel } from '../app/design-reach.ts';

const listing = (listingId, title, family, sold90, favorites = 0) =>
  ({ listingId, title, family, sold90, favorites });

test('the product words are what get stripped, because they are what differs', () => {
  /* A print-on-demand title is the design's words, then the product's words,
     then a tail of search terms. Strip the product and the filler and what is
     left is the design - which is the only way to tell that a tee and a
     hoodie are the same artwork, since Etsy has no field for it. */
  assert.equal(designKey('Mom I Am A Rich Man Feminist Shirt Girl Power Shirt'),
               designKey('Mom I Am A Rich Man Feminist Sweatshirt Unisex Hoodie'));
  assert.notEqual(designKey('Dog Mom Era Shirt'), designKey('Cat Mom Era Shirt'));
});

test('a design on two products is not offered, because it is already there', () => {
  const rows = [
    listing(1, 'Girl Power Fist Tee', 'T-shirts', 4),
    listing(2, 'Girl Power Fist Sweatshirt', 'Sweatshirts & Hoodies', 2),
  ];
  assert.deepEqual(designsOnOneProduct(rows), []);
});

test('a design that sold on exactly one product is', () => {
  const rows = [
    listing(1, 'Girl Power Fist Tee', 'T-shirts', 4, 30),
    listing(2, 'Girl Power Fist T Shirt Unisex', 'T-shirts', 3, 10),
  ];
  const [found] = designsOnOneProduct(rows);
  assert.ok(found, 'the two listings group into one design');
  assert.equal(found.sold90, 7, 'sales across the group are added up');
  assert.deepEqual(found.families, ['T-shirts']);
  assert.equal(found.listingId, 1, 'the best seller represents the group');
});

test('nothing is claimed without a sale or without a recorded product', () => {
  /* A wrong grouping tells a seller they already sell something on a hoodie
     when they do not, and they skip a product that would have earned. */
  assert.deepEqual(designsOnOneProduct([listing(1, 'Never Sold Tee', 'T-shirts', 0)]), []);
  assert.deepEqual(designsOnOneProduct([listing(1, 'Sold But Unfiled', '', 5)]), []);
  /* A title that reduces to nothing is dropped rather than lumped in with
     every other title that also reduced to nothing. */
  assert.equal(designKey('Gift For Her Shirt'), '');
  assert.deepEqual(designsOnOneProduct([listing(1, 'Gift For Her Shirt', 'T-shirts', 9)]), []);
});

test('the scanner loads a live listing instead of asking it to be retyped', () => {
  /* Typing your own title and tags into the software that imported them is
     homework, and it meant the check could only run on drafts - never on the
     live listings that are already underperforming, where it is worth most. */
  const client = readFileSync(new URL('../app/design-scanner/design-scanner-client.tsx', import.meta.url), 'utf8');
  assert.match(client, /Your Etsy listing/);
  assert.match(client, /fetch\("\/api\/shop-map\/my-listings"\)/);
  /* Worst performers first: favorites with nothing sold is exactly the
     listing worth checking. */
  assert.match(client, /\(a\.sold90 - b\.sold90\) \|\| \(\(b\.favorites \?\? 0\) - \(a\.favorites \?\? 0\)\)/);
});

test("the database's word for a product is not the seller's", () => {
  /* product_family is stored as an internal key and leaked onto the live page
     as "only on tee". */
  assert.equal(familyLabel('tee'), 'a T-shirt');
  assert.equal(familyLabel('phoneCase'), 'a phone case');
  /* An unmapped key reads as clumsy rather than vanishing, so a family added
     later is visible instead of silently dropped. */
  assert.equal(familyLabel('bucketHat'), 'a bucket hat');
  assert.equal(familyLabel(''), 'one product');
});

test('an Etsy title is a search surface, not a name', () => {
  /* Four listings written that way are indistinguishable in a list - every one
     opens with the same three words. */
  const long = "Feminist Shirt Girl Power Shirt Girl Boss Shirt Feminist Gifts Anti Trump Feminist T Shirt";
  const short = shortLabel(long);
  assert.ok(short.length <= 55, `still ${short.length} characters`);
  assert.equal(short.split(/\s+/).filter(Boolean).length <= 8, true);
  /* Repeats are what make them look alike, so repeats go first. */
  assert.equal((short.toLowerCase().match(/shirt/g) ?? []).length, 1);
  assert.match(short, /^Feminist Shirt Girl Power/);
});
