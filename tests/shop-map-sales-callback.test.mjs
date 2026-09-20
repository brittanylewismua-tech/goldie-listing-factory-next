/**
 * THE PRODUCTION PATH THAT FAILED.
 *
 * An inactive connection, a targeted sales authorisation, Etsy returning that
 * same shop. It fell through to the add-a-shop path, which deactivates every
 * other connection and makes the authorised one active — so a request for
 * extra permission moved which shop the Listing Factory publishes to, and
 * then told the member they were signed into the wrong Etsy account.
 *
 * Driven against the real callback source with the same harness the other
 * callback tests use, so it exercises the shipped code rather than a summary
 * of it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { etsyOauthIntent, sameEtsyShopMessage, wrongEtsyAccountMessage }
  from "../app/etsy-connect-intent.ts";

const originSource = ts.transpile(
  readFileSync("app/api/etsy/return-origin.ts", "utf8").replace("export function", "function"),
  { target: ts.ScriptTarget.ES2022 });
const actualOrigin = new Function(originSource + ";return oauthReturnOrigin")();

const raw = readFileSync("app/api/etsy/callback/route.ts", "utf8");
const source = ts.transpile(
  raw.replace(/^import .*;\n/gm, "").replace("export async function GET", "async function GET"),
  { target: ts.ScriptTarget.ES2022 });

/**
 * A database that records every statement, so the test can assert on what was
 * NOT run as firmly as on what was.
 */
function harness({ targetShopId = 16538900, returnedShop = { shop_id: 16538900, shop_name: "shesawolfclothing" },
  existing = { shop_name: "shesawolfclothing", is_active: 0 }, grantedScope = "listings_r listings_w shops_r shops_w transactions_r" } = {}) {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        const record = { sql, args: [] };
        return {
          bind(...args) { record.args = args; return this; },
          first: async () => {
            statements.push(record);
            if (/FROM etsy_oauth_states/.test(sql))
              return {
                user_id: "test", code_verifier: "verifier",
                redirect_uri: "https://goldie.test/callback",
                return_origin: null, target_shop_id: targetShopId,
              };
            if (/FROM etsy_connections/.test(sql)) return existing;
            return null;
          },
          run: async () => { statements.push(record); },
        };
      },
      batch: async (list) => { statements.push({ sql: "BATCH", parts: list }); },
    },
  };
  const GET = new Function(
    "env", "NextResponse", "apiKey", "encryptEtsy", "etsyFetch", "goldieSiteUrl",
    "forgetPairings", "oauthReturnOrigin", "etsyOauthIntent", "sameEtsyShopMessage",
    "wrongEtsyAccountMessage", "fetch",
    source + ";return GET;")(
      env, { redirect: url => ({ url }) }, () => "test-key", async () => "encrypted",
      async () => returnedShop, () => "https://goldie.test", async () => {},
      actualOrigin, etsyOauthIntent, sameEtsyShopMessage, wrongEtsyAccountMessage,
      async () => Response.json({
        access_token: "123.test", refresh_token: "refresh",
        expires_in: 3600, scope: grantedScope,
      }));
  return { GET, statements };
}

const runSales = (options) => {
  const h = harness(options);
  return h.GET(new Request("https://goldie.test/callback?state=sales_abc&code=test"))
    .then(result => ({ result, statements: h.statements }));
};

test("an inactive connection is updated in place, and stays where it was", async () => {
  const { result, statements } = await runSales();
  const written = statements.filter(row => /UPDATE etsy_connections SET encrypted_access_token/.test(row.sql));
  assert.equal(written.length, 1, "exactly one connection is written");
  assert.ok(written[0].args.includes(16538900), "and it is the targeted one");
});

test("no row is inserted and no other connection is deactivated", async () => {
  const { statements } = await runSales();
  const sql = statements.map(row => row.sql).join(" | ");
  assert.doesNotMatch(sql, /INSERT INTO etsy_connections/);
  assert.doesNotMatch(sql, /SET is_active=0/);
  assert.equal(statements.filter(row => row.sql === "BATCH").length, 0,
    "the add-a-shop batch must never run for a sales authorisation");
});

test("the duplicate guard does not fire when the shop is the intended one", async () => {
  const { result } = await runSales();
  assert.doesNotMatch(decodeURIComponent(result.url), /already connected/);
  assert.doesNotMatch(decodeURIComponent(result.url), /Sign out of Etsy/);
});

test("it returns to that shop's capability state", async () => {
  const { result } = await runSales();
  assert.equal(result.url, "https://goldie.test/api/shop-map/capability?shop=16538900");
});

test("the scope Etsy granted is stored against that connection", async () => {
  const { statements } = await runSales();
  const written = statements.find(row => /UPDATE etsy_connections SET encrypted_access_token/.test(row.sql));
  assert.match(written.sql, /scopes=\?/);
  assert.ok(written.args.some(value =>
    typeof value === "string" && value.includes("transactions_r")),
    "the granted scope must reach the row");
});

test("an already-active connection is handled the same way, without reactivating anything", async () => {
  const { result, statements } = await runSales({ existing: { shop_name: "shesawolfclothing", is_active: 1 } });
  assert.equal(result.url, "https://goldie.test/api/shop-map/capability?shop=16538900");
  assert.doesNotMatch(statements.map(row => row.sql).join(" | "), /SET is_active/);
});

test("a genuinely different Etsy account is refused before anything is written", async () => {
  const { result, statements } = await runSales({
    returnedShop: { shop_id: 99999, shop_name: "someoneelse" },
  });
  assert.match(decodeURIComponent(result.url), /does not own/);
  assert.doesNotMatch(statements.map(row => row.sql).join(" | "),
    /UPDATE etsy_connections SET encrypted_access_token/);
});

test("a state with no target still refuses to insert or activate", async () => {
  /* The hole that let this reach the add path in the first place. */
  const { statements } = await runSales({ targetShopId: null });
  const sql = statements.map(row => row.sql).join(" | ");
  assert.doesNotMatch(sql, /INSERT INTO etsy_connections/);
  assert.doesNotMatch(sql, /SET is_active=0/);
});
