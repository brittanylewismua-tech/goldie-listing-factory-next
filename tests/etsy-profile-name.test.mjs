import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scopes=readFileSync("app/shop-map-auth.ts","utf8");
const connect=readFileSync("app/api/etsy/route.ts","utf8");
const callback=readFileSync("app/api/etsy/callback/route.ts","utf8");

test("base Etsy grant stays unchanged while normal connect also requests email_r",()=>{
  assert.match(scopes,/BASE_SCOPES = "listings_r listings_w shops_r shops_w"/);
  assert.match(connect,/scope=body\.intent==="sales"\?SHOP_MAP_SCOPES:BASE_SCOPES/);
  assert.match(connect,/requestedScope=body\.intent==="sales"\?scope:`\$\{scope\} email_r`/);
});

test("Etsy callback fills Goldie's first-name preference without overwriting one",()=>{
  assert.match(callback,/first_name/);
  assert.match(callback,/rememberEtsyFirstName/);
  assert.match(callback,/sellerPreferences/);
  assert.match(callback,/if\(typeof saved\.firstName==="string"&&saved\.firstName\.trim\(\)\)return;/);
  assert.match(callback,/firstName/);
});
