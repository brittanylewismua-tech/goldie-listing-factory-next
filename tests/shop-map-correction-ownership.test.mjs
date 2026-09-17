/*
  A CORRECTION FOR A LISTING THIS SHOP DOES NOT HAVE WAS ACCEPTED.

  Measured against the live shop on the deployed build: POSTing
  move-listing with listing 999999999 returned {ok:true} and a 200. The write
  is an INSERT into shop_map_world_overrides, so it did not merely fail to
  match anything — it created an override row for a listing that does not
  exist, and the member was told their correction had worked.

  The listing ID is typed by hand on that panel, so a typo, or an ID copied
  from a different shop, is the ordinary case rather than the exotic one.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL(
  "../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");

test("the listing must belong to this shop before anything is written", () => {
  const move = route.slice(route.indexOf('case "move-listing"'),
    route.indexOf('case "rename-world"'));
  /* The ownership read comes BEFORE the insert, or it is decoration. */
  const check = move.indexOf("FROM shop_map_listings");
  const write = move.indexOf("INSERT INTO shop_map_world_overrides");
  assert.ok(check > -1, "nothing verifies the listing is in this shop");
  assert.ok(write > -1);
  assert.ok(check < write, "the check must run before the write");
  /* Scoped to this member AND this shop, so another shop's listing is not
     accepted either. */
  assert.match(move, /WHERE user_id = \? AND shop_id = \? AND listing_id = \?/);
});

test("the refusal says nothing changed, and how to find the right number", () => {
  assert.match(route, /is not in this shop's map, so nothing `?\s*\+?\s*`?was changed/);
  assert.match(route, /the number in `?\s*\+?\s*`?the listing's own URL/);
  assert.match(route, /\{ status: 404 \}/);
});

test("a refusal is a refusal, not an ok with a note", () => {
  /* The interface decides what to show from response.ok, so a 200 with an
     error field would still render as success — which is how this behaved. */
  const move = route.slice(route.indexOf('case "move-listing"'),
    route.indexOf('case "rename-world"'));
  const refusal = move.slice(move.indexOf("if (!owns)"), move.indexOf("await db.prepare"));
  assert.ok(!/ok: true/.test(refusal), "a refusal must not carry ok: true");
});
