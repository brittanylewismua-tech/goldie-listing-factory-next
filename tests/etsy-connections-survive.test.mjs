/**
 * A MULTI-SHOP SELLER KEEPS EVERY SHOP THEY CONNECTED.
 *
 * On 14 September a seller's active shop vanished from their account during a
 * run of failed authorisations. Reconstructing the cause was only possible by
 * elimination, because the one statement that could remove a connection left
 * no record that it ran. These tests hold the invariants that make both halves
 * of that impossible: nothing deletes a connection, and every removal is
 * recorded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
const connect = read("api/etsy/route.ts");
const callback = read("api/etsy/callback/route.ts");
const active = read("api/etsy/active/route.ts");

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = `${dir}/${entry.name}`;
  return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(path) ? [path] : [];
});

test("nothing anywhere deletes an Etsy connection", () => {
  const offenders = [];
  for (const path of walk(new URL("../app", import.meta.url).pathname)) {
    const source = readFileSync(path, "utf8");
    /* Comments explaining the old statement are allowed; code is not. */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/DELETE\s+FROM\s+etsy_connections/i.test(code))
      offenders.push(path.split("/app/")[1]);
  }
  assert.deepEqual(offenders, [],
    "a connection may be retired, never removed");
});

test("disconnecting clears the tokens and keeps the identity", () => {
  assert.match(connect, /SET encrypted_access_token='', encrypted_refresh_token='', expires_at=0, is_active=0/);
  assert.match(connect, /DISCONNECTING IS NOT DELETING ANY MORE/);
});

test("every removal is recorded, so it never has to be inferred again", () => {
  assert.match(connect, /INSERT INTO etsy_connection_events/);
  assert.match(connect, /'disconnected'/);
  assert.match(connect, /A destructive operation with no audit trail/);
});

test("a retired shop is not offered as a publishing destination", () => {
  assert.match(connect, /WHERE user_id=\? AND encrypted_access_token<>'' ORDER BY shop_name/);
  /* And promotion after a disconnect only considers shops that still have a
     token, so the seller is never switched onto a dead connection. */
  assert.match(connect, /encrypted_access_token<>'' ORDER BY updated_at DESC LIMIT 1/);
});

test("switching the active shop updates is_active and nothing else", () => {
  const writes = (active.match(/env\.DB\.prepare\("UPDATE[^"]+"\)/g) ?? []);
  assert.ok(writes.length > 0, "switching must write something");
  for (const write of writes) {
    assert.match(write, /SET is_active=[01]/,
      `switching must not write anything but is_active: ${write.slice(0, 90)}`);
    assert.doesNotMatch(write, /shop_name=|encrypted_access_token=|expires_at=/,
      "switching must never touch identity or tokens");
  }
  /* And it cannot switch onto a shop whose token was cleared. */
  assert.match(active, /That shop was disconnected\. Reconnect it to switch to it\./);
});

test("a declined or failed authorisation writes nothing at all", () => {
  const beforeToken = callback.slice(0, callback.indexOf("const tokenResponse"));
  assert.doesNotMatch(beforeToken, /UPDATE etsy_connections|INSERT INTO etsy_connections/);
  assert.match(beforeToken, /Etsy connection was canceled/);
});

test("a sales authorisation touches one connection and never the rest", () => {
  const branch = callback.slice(
    callback.indexOf('if(intent==="sales"'),
    callback.indexOf("const existing=adding?"));
  assert.match(branch, /WHERE user_id=\? AND shop_id=\?/);
  assert.doesNotMatch(branch, /SET is_active|INSERT INTO etsy_connections/);
});

test("an ordinary connection upserts one shop and only deactivates others", () => {
  /* Deactivating is not removing: the other rows keep their tokens and can be
     switched back to at any time. */
  const batch = callback.slice(callback.indexOf("await env.DB.batch(["), callback.indexOf("]);", callback.indexOf("await env.DB.batch([")));
  assert.match(batch, /UPDATE etsy_connections SET is_active=0 WHERE user_id=\?/);
  assert.match(batch, /ON CONFLICT\(user_id,shop_id\) DO UPDATE SET/);
  assert.doesNotMatch(batch, /DELETE/);
});

test("shop identity is never written onto a different connection's row", () => {
  /* Every statement that writes shop_name must be keyed on that shop. */
  const writes = [...callback.matchAll(/UPDATE etsy_connections SET[^"]*shop_name=\?[^"]*/g)]
    .map(match => match[0]);
  assert.ok(writes.length > 0);
  for (const write of writes)
    assert.match(write, /WHERE user_id=\? AND shop_id=\?/,
      `a shop_name write not keyed on a shop: ${write.slice(0, 90)}`);
});
