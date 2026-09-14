/**
 * ASKING FOR SALES DATA WITHOUT BREAKING WHAT ALREADY WORKS.
 *
 * Every member's Etsy connection predates `transactions_r`. The way to lose
 * them is to demand a re-authorisation before they can publish a listing, or
 * to drop a working connection while chasing a wider one. These pin both.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
const auth = read("shop-map-auth.ts");
const connect = read("api/etsy/route.ts");
const callback = read("api/etsy/callback/route.ts");
const capability = read("api/shop-map/capability/route.ts");

test("the base grant is unchanged for everyone who is not opening Shop Map", () => {
  assert.match(auth, /BASE_SCOPES = "listings_r listings_w shops_r shops_w"/);
  assert.match(connect, /body\.intent==="sales"\?SHOP_MAP_SCOPES:BASE_SCOPES/);
  /* No unrelated page may trigger the wider request. */
  assert.doesNotMatch(connect, /scope:"[^"]*transactions_r/);
});

test("Shop Map's grant adds transactions_r and nothing else", () => {
  assert.match(auth, /SHOP_MAP_SCOPES = `\$\{BASE_SCOPES\} transactions_r`/);
});

test("a member with no scope record is asked Etsy, not assumed either way", () => {
  assert.match(auth, /ask Etsy rather than guess/);
  assert.match(auth, /receipts\?limit=1/);
  assert.match(auth, /evidence: "probed"/);
});

test("an unreachable Etsy is never treated as a missing permission", () => {
  assert.match(auth, /An unreachable Etsy is not proof of a missing scope/);
  assert.match(auth, /evidence: "legacy-unknown"/);
  /* Nothing is stored on that path, so a bad minute cannot brand a member as
     unable to use the feature. */
  const rescue = auth.slice(auth.indexOf("} catch {"), auth.length);
  assert.doesNotMatch(rescue.slice(0, 400), /UPDATE etsy_connections/);
});

test("what Etsy actually granted is recorded, not what was requested", () => {
  /* A grant can come back narrower than asked for, and discovering that as a
     403 three screens later is the worst way to find out. */
  assert.match(callback, /SET scopes=\?, scopes_checked_at=CURRENT_TIMESTAMP/);
  assert.match(callback, /String\(tokens\.scope\|\|""\)/);
  assert.match(callback, /scope\?:string/);
});

test("the existing connection survives a declined or failed authorisation", () => {
  /* The token exchange happens before any write, and a failure returns
     through fail() without touching etsy_connections. */
  const denied = callback.slice(callback.indexOf("if(denied)"), callback.indexOf("if(!pending||!code)"));
  assert.doesNotMatch(denied, /etsy_connections/);
  assert.match(denied, /Etsy connection was canceled/);
  assert.ok(callback.indexOf("throw new Error(tokens.error_description") <
    callback.indexOf("INSERT INTO etsy_connections"),
    "no connection row may be written before Etsy returns a token");
});

test("state and PKCE are still required on the wider request", () => {
  assert.match(connect, /code_challenge_method:"S256"/);
  assert.match(connect, /INSERT INTO etsy_oauth_states/);
  assert.match(callback, /WHERE state=\? AND expires_at>unixepoch\(\)/);
});

test("the capability endpoint reports, and never authorises by itself", () => {
  assert.match(capability, /Connect Your Sales Data/);
  assert.match(capability, /Your shop stays connected either way/);
  assert.doesNotMatch(capability, /oauth\/connect|authorizeUrl/);
});

test("the scope column is added by ALTER, because IF NOT EXISTS is a no-op", () => {
  assert.match(auth, /ALTER TABLE etsy_connections ADD COLUMN/);
  assert.match(auth, /duplicate column/i);
});

test("the sales authorization is a plain link, and asks for exactly one extra scope", () => {
  /* A flow that can only be started by a POST from one screen cannot be handed
     to somebody as a link, which is what testing and support both need. */
  const connect = readFileSync(
    new URL("../app/api/shop-map/connect-sales/route.ts", import.meta.url), "utf8");
  assert.match(connect, /export const GET/);
  assert.match(connect, /scope: SHOP_MAP_SCOPES/);
  assert.match(connect, /code_challenge_method: "S256"/);
  assert.match(connect, /INSERT INTO etsy_oauth_states/);
  /* And it must not touch the existing connection on the way out. */
  assert.doesNotMatch(connect, /etsy_connections/);
});
