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

test("Etsy callback reads first_name and stores it with the connection",()=>{
  assert.match(callback,/first_name/);
  assert.match(callback,/readEtsyFirstName/);
  assert.match(callback,/ALTER TABLE etsy_connections ADD COLUMN first_name TEXT/);
  assert.match(callback,/first_name=CASE WHEN COALESCE/);
});
