import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { etsyOauthIntent, etsyOauthState, sameEtsyShopMessage } from "../app/etsy-connect-intent.ts";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const start=await readFile(new URL("../app/api/etsy/route.ts",import.meta.url),"utf8");
const callback=await readFile(new URL("../app/api/etsy/callback/route.ts",import.meta.url),"utf8");

test("add-shop OAuth intent survives the provider round trip",()=>{
  const state=etsyOauthState("add","unguessable-nonce");
  assert.equal(state,"add_unguessable-nonce");
  assert.equal(etsyOauthIntent(state),"add");
  assert.equal(etsyOauthIntent(etsyOauthState("connect","nonce")),"connect");
});

test("re-authorizing the same Etsy shop is explained rather than reported as a new shop",()=>{
  assert.equal(sameEtsyShopMessage("godisagirlapparel"),"godisagirlapparel is already connected. Etsy reused the account currently signed in. Sign out of Etsy, sign into the account that owns the other shop, then choose Connect that shop.");
  assert.match(callback,/if\(existing\)[\s\S]*UPDATE etsy_connections[\s\S]*sameEtsyShopMessage\(shop\.shop_name\)/);
  const sameShopBranch=callback.slice(callback.indexOf("if(existing)"),callback.indexOf("/* D835"));
  assert.doesNotMatch(sameShopBranch,/is_active=1/);
  assert.doesNotMatch(sameShopBranch,/UPDATE etsy_connections SET is_active=0/);
});

test("the UI explains Etsy's separate-login requirement before starting add-shop OAuth",()=>{
  assert.match(app,/Connect a different Etsy shop/);
  assert.match(app,/Every Etsy shop has its own Etsy login/);
  assert.match(app,/Open Etsy account ↗/);
  assert.match(app,/Your currently connected shops stay saved/);
  assert.match(app,/connectEtsy\(true\)/);
  assert.match(app,/event\.key!=="Escape"\|\|etsyConnecting/);
  assert.match(app,/connectAnotherOpener\.current\?\.focus\(\)/);
  assert.match(start,/body\.intent==="add"/);
});
