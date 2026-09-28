import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scopes = readFileSync("app/shop-map-auth.ts","utf8");
const callback = readFileSync("app/api/etsy/callback/route.ts","utf8");

test("Etsy connection asks for the profile scope needed for first_name",()=>{
  assert.match(scopes,/BASE_SCOPES = "listings_r listings_w shops_r shops_w email_r"/);
});

test("Etsy callback stores first_name only when Goldie has no saved name",()=>{
  assert.match(callback,/\/users\/\$\{etsyUserId\}/);
  assert.match(callback,/first_name/);
  assert.match(callback,/if\(typeof saved\.firstName==="string"&&saved\.firstName\.trim\(\)\)return;/);
  assert.match(callback,/saved\.firstName=firstName/);
});
