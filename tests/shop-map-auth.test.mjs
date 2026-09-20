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

test("an authenticated Etsy call sends key:secret, not the bare key", () => {
  /* Measured: the bare key answers 403 "Shared secret is required in x-api-key
     header", which reads exactly like a refused permission and cost a false
     negative on a grant that had just been made. */
  assert.match(auth, /"x-api-key": etsyApiCredential\(\)/);
  assert.doesNotMatch(auth, /"x-api-key": \(env as unknown as \{ ETSY_API_KEY/);
});

test("a refusal is only recorded when Etsy says it is about permission", () => {
  /* A bad header, a rate limit or an empty shop would otherwise be written
     down as "cannot use this feature", and the stored answer would stop the
     question ever being asked again. */
  assert.match(auth, /A REFUSAL IS ONLY RECORDED WHEN ETSY SAYS IT IS ABOUT PERMISSION/);
  assert.match(auth, /scope\|permission\|not authorized\|unauthorized/);
  assert.match(auth, /evidence: aboutScope \? "probed" : "legacy-unknown"/);
});

test("the browser never names the shop being authorised", () => {
  /* A shop id in a query string is a number anybody can change. The server
     issues an opaque handle against a connection it has already confirmed
     belongs to the caller, and the handle is all the browser carries. */
  const targets = read("shop-map-targets.ts");
  const connect = read("api/shop-map/connect-sales/route.ts");
  assert.match(targets, /crypto\.getRandomValues/);
  assert.match(targets, /WHERE handle = \? AND user_id = \? AND expires_at > unixepoch\(\)/);
  assert.match(connect, /readTarget\(user\.userId, handle\)/);
  assert.doesNotMatch(connect, /searchParams\.get\("shop"\)/);
});

test("the intended shop travels server-side, not in the redirect", () => {
  const connect = read("api/shop-map/connect-sales/route.ts");
  assert.match(connect, /target_shop_id/);
  assert.match(connect, /INSERT INTO etsy_oauth_states/);
});

test("a sales authorisation never changes the active shop", () => {
  const branch = callback.slice(
    callback.indexOf('if(intent==="sales"'),
    callback.indexOf("const existing=adding?"));
  assert.ok(branch.length > 200, "the sales branch must exist");
  /* Reading is_active is fine; writing it is not. The branch has to know
     whether the connection exists, and must change nothing about which shop
     is active. */
  assert.doesNotMatch(branch, /SET is_active|is_active=0|is_active=1/);
  assert.doesNotMatch(branch, /INSERT INTO etsy_connections/);
  assert.match(branch, /UPDATE etsy_connections SET encrypted_access_token/);
  assert.match(branch, /WHERE user_id=\? AND shop_id=\?/);
});

test("authorising the wrong Etsy account is refused, and both connections survive", () => {
  const branch = callback.slice(
    callback.indexOf('if(intent==="sales"'),
    callback.indexOf("const existing=adding?"));
  assert.match(branch, /if\(Number\(shop\.shop_id\)!==targetShopId\)/);
  /* The refusal must come before any write. */
  assert.ok(branch.indexOf("return fail(wrongEtsyAccountMessage") <
    branch.indexOf("UPDATE etsy_connections"),
    "the mismatch check must precede the token write");
});

test("the granted scopes are stored against the intended connection", () => {
  const branch = callback.slice(
    callback.indexOf('if(intent==="sales"'),
    callback.indexOf("const existing=adding?"));
  assert.match(branch, /scopes=\?, scopes_checked_at=CURRENT_TIMESTAMP/);
  assert.match(branch, /String\(tokens\.scope\|\|""\)/);
});

test("the member lands back on that shop's capability state", () => {
  const branch = callback.slice(
    callback.indexOf('if(intent==="sales"'),
    callback.indexOf("const existing=adding?"));
  assert.match(branch, /\/api\/shop-map\/capability\?shop=\$\{targetShopId\}/);
});

test("capability can be asked about one shop without activating it", () => {
  const cap = read("api/shop-map/capability/route.ts");
  assert.match(cap, /searchParams\.get\("shop"\)/);
  assert.match(cap, /grants nothing and is not trusted/);
  /* And the probe refuses to answer for a shop whose token it does not hold. */
  assert.match(auth, /if \(shopId && shopId !== Number\(row\.shop_id\)\)/);
});
