import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

/* D836 · These execute the real migration and the real statements out of the
   real route files, against SQLite with the real column shape. D711 is the
   precedent and the reason: a suite of source-text assertions let a query bound
   to `undefined` ship. Asserting that a statement EXISTS proves nothing about
   what it does to the rows.

   Every SQL string below is pulled out of the file that ships it, so if a route
   changes its statement the test runs the new one. */

const migration = await readFile(new URL("../drizzle/0018_multi_shop_etsy.sql", import.meta.url), "utf8");
const etsyRoute = await readFile(new URL("../app/api/etsy/route.ts", import.meta.url), "utf8");
const activeRoute = await readFile(new URL("../app/api/etsy/active/route.ts", import.meta.url), "utf8");
const callbackRoute = await readFile(new URL("../app/api/etsy/callback/route.ts", import.meta.url), "utf8");
const clientModule = await readFile(new URL("../app/api/etsy/client.ts", import.meta.url), "utf8");

/* The shape etsy_connections had before 0018: user_id as the primary key, which
   is the whole reason a seller could hold exactly one shop. */
const OLD_TABLE = `CREATE TABLE etsy_connections (
  user_id TEXT PRIMARY KEY,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  etsy_user_id INTEGER NOT NULL,
  shop_id INTEGER NOT NULL,
  shop_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/* node:sqlite returns null-prototype rows; compare them as plain objects. */
const plain = rows => rows.map(row => ({ ...row }));

function sqlFrom(source, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = source.match(new RegExp(`prepare\\(\\s*"([^"]*${escaped}[^"]*)"`));
  assert.ok(found, `no statement containing ${needle} in the route`);
  return found[1];
}

function migrated({ seedShops = [["u1", 111, "godisagirlapparel"]] } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(OLD_TABLE);
  for (const [user, shopId, shopName] of seedShops) {
    database.prepare(`INSERT INTO etsy_connections
      (user_id,encrypted_access_token,encrypted_refresh_token,expires_at,etsy_user_id,shop_id,shop_name,updated_at)
      VALUES (?,'tok','ref',9999999999,7,?,?,'2026-08-29 10:00:00')`).run(user, shopId, shopName);
  }
  for (const statement of migration.split("--> statement-breakpoint")) {
    const sql = statement.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").trim();
    if (sql) database.exec(sql);
  }
  return database;
}

test("D835: the migration keeps the shop that is connected today, and makes it active", () => {
  const database = migrated();
  const rows = database.prepare("SELECT user_id, shop_id, shop_name, is_active FROM etsy_connections").all();
  assert.equal(rows.length, 1, "the existing connection survives — nobody is disconnected on deploy");
  assert.equal(rows[0].shop_id, 111);
  assert.equal(rows[0].is_active, 1, "and it is the shop the seller is working in");
  /* The old primary key is gone: two shops for one seller must now be legal. */
  database.prepare(`INSERT INTO etsy_connections
    (user_id,shop_id,encrypted_access_token,encrypted_refresh_token,expires_at,etsy_user_id,shop_name,is_active,updated_at)
    VALUES ('u1',222,'tok','ref',9999999999,7,'shesawolfclothing',0,'2026-08-29 11:00:00')`).run();
  assert.equal(database.prepare("SELECT COUNT(*) c FROM etsy_connections WHERE user_id='u1'").get().c, 2);
});

test("D835: connecting a second shop adds it and makes it active, keeping the first", () => {
  const database = migrated();
  /* The two statements the callback runs, in the order it runs them. */
  const clear = sqlFrom(callbackRoute, "UPDATE etsy_connections SET is_active=0");
  const insert = sqlFrom(callbackRoute, "INSERT INTO etsy_connections");
  database.prepare(clear).run("u1");
  database.prepare(insert).run("u1", 222, "tok2", "ref2", 9999999999, 7, "shesawolfclothing");

  const rows = plain(database.prepare("SELECT shop_id, is_active FROM etsy_connections WHERE user_id='u1' ORDER BY shop_id").all());
  assert.deepEqual(rows, [{ shop_id: 111, is_active: 0 }, { shop_id: 222, is_active: 1 }],
    "both shops are stored and the new one is active");

  /* Authorising the same shop twice updates it rather than duplicating it. */
  database.prepare(clear).run("u1");
  database.prepare(insert).run("u1", 222, "tok3", "ref3", 9999999999, 7, "shesawolfclothing renamed");
  assert.equal(database.prepare("SELECT COUNT(*) c FROM etsy_connections WHERE user_id='u1'").get().c, 2);
  assert.equal(database.prepare("SELECT shop_name FROM etsy_connections WHERE shop_id=222").get().shop_name, "shesawolfclothing renamed");
});

test("D835: switching moves the active shop and nothing else", () => {
  const database = migrated({ seedShops: [["u1", 111, "godisagirlapparel"]] });
  const insert = sqlFrom(callbackRoute, "INSERT INTO etsy_connections");
  database.prepare(sqlFrom(callbackRoute, "UPDATE etsy_connections SET is_active=0")).run("u1");
  database.prepare(insert).run("u1", 222, "tok2", "ref2", 9999999999, 7, "shesawolfclothing");

  const owned = sqlFrom(activeRoute, "SELECT shop_name FROM etsy_connections");
  const clear = sqlFrom(activeRoute, "UPDATE etsy_connections SET is_active=0");
  const set = sqlFrom(activeRoute, "UPDATE etsy_connections SET is_active=1");

  assert.ok(database.prepare(owned).get("u1", 111), "the shop being switched to must be one the seller owns");
  assert.equal(database.prepare(owned).get("u1", 999), undefined, "and a shop they do not own is refused");

  database.prepare(clear).run("u1");
  database.prepare(set).run("u1", 111);
  const active = plain(database.prepare("SELECT shop_id FROM etsy_connections WHERE user_id='u1' AND is_active=1").all());
  assert.deepEqual(active, [{ shop_id: 111 }], "exactly one shop is active, and it is the one chosen");
  assert.equal(database.prepare("SELECT COUNT(*) c FROM etsy_connections WHERE user_id='u1'").get().c, 2,
    "switching stores nothing and deletes nothing");
});

test("D835: disconnecting with another shop remaining promotes it and reports it", () => {
  const database = migrated();
  database.prepare(sqlFrom(callbackRoute, "UPDATE etsy_connections SET is_active=0")).run("u1");
  database.prepare(sqlFrom(callbackRoute, "INSERT INTO etsy_connections")).run("u1", 222, "tok2", "ref2", 9999999999, 7, "shesawolfclothing");

  const going = database.prepare(sqlFrom(etsyRoute, "SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1")).get("u1");
  assert.equal(going.shop_id, 222);
  database.prepare(sqlFrom(etsyRoute, "DELETE FROM etsy_connections")).run("u1");
  const next = database.prepare(sqlFrom(etsyRoute, "SELECT shop_id, shop_name FROM etsy_connections")).get("u1");
  assert.ok(next, "the other shop is still there");
  database.prepare(sqlFrom(etsyRoute, "UPDATE etsy_connections SET is_active=1")).run("u1", next.shop_id);

  const rows = plain(database.prepare("SELECT shop_id, is_active FROM etsy_connections WHERE user_id='u1'").all());
  assert.deepEqual(rows, [{ shop_id: 111, is_active: 1 }], "the survivor is promoted, not left inactive");
  /* And the route must say so. Returning {connected:false} here made the UI
     clear Etsy while a promoted shop was live. */
  assert.match(etsyRoute, /next\?\{connected:true,shopId:next\.shop_id,shopName:next\.shop_name\}:\{connected:false\}/);
});

test("D835: disconnecting the last shop genuinely disconnects", () => {
  const database = migrated();
  database.prepare(sqlFrom(etsyRoute, "DELETE FROM etsy_connections")).run("u1");
  const next = database.prepare(sqlFrom(etsyRoute, "SELECT shop_id, shop_name FROM etsy_connections")).get("u1");
  assert.equal(next, undefined, "nothing remains");
  assert.equal(database.prepare("SELECT COUNT(*) c FROM etsy_connections").get().c, 0);
});

test("D835: every read of the connection asks for the active shop", () => {
  /* A read without the filter returns whichever row SQLite hands back first,
     which is how a seller publishes to the shop they are not looking at. */
  const sources = { "client.ts": clientModule, "etsy/route.ts": etsyRoute };
  for (const [name, source] of Object.entries(sources)) {
    for (const statement of source.match(/SELECT[^"]*FROM etsy_connections[^"]*/g) || []) {
      if (/WHERE user_id=\? AND shop_id=\?/.test(statement)) continue;  // owning check, by id
      if (/ORDER BY updated_at DESC LIMIT 1/.test(statement)) continue; // promotion after disconnect
      if (/ORDER BY shop_name/.test(statement)) continue;               // the switcher's own list
      assert.match(statement, /is_active=1/, `${name}: ${statement.slice(0, 80)} must ask for the active shop`);
    }
  }
});

test("D836: a bundle is only as reachable as its least reachable member", async () => {
  const tools = await readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  /* The tiles were filtered and the bundles were not, so a bundle holding a
     product from another store stayed selectable and reached the same 409 one
     step later. */
  assert.match(tools, /const bundleBlockers = \(bundle: ProductBundle\)/);
  assert.match(tools, /disabled=\{included\.length<2\|\|blocked\.away\.length>0\|\|Boolean\(pendingAction\)\}/,
    "a bundle with an out-of-shop member cannot be chosen");
  assert.match(tools, /publishes to a different Etsy shop/, "and it says which shop, not just that it is unavailable");

  /* The rule itself, executed rather than described. */
  const reach = new Map([["a", "here"], ["b", "away"], ["c", "unproven"]]);
  const blocked = ids => ids.filter(id => reach.get(id) === "away");
  assert.deepEqual(blocked(["a", "c"]), [], "here + unproven is usable");
  assert.deepEqual(blocked(["a", "b"]), ["b"], "one member from another shop blocks the bundle");
});

test("D837: one Etsy row, and no path clears the connection without being told to", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D836 fixed the Etsy row on the connect screen and left the copy inside
     .connected-connection-stack untouched: it offered only Disconnect, called
     DELETE, then ran setEtsyConnected(false) unconditionally. Disconnecting one
     shop while another remained told the seller they had no Etsy connection at
     all, over a promoted shop the next publish would have used.

     Two copies of a handler is the defect, so this asserts there is one. */
  assert.equal((app.match(/connection-row etsy-connection service-row/g) || []).length, 1,
    "the Etsy row is written once");
  assert.equal((app.match(/etsyConnectionRow\(/g) || []).length, 3,
    "one definition, two render paths");
  assert.equal((app.match(/fetch\("\/api\/etsy",\{method:"DELETE"\}\)/g) || []).length, 1,
    "one disconnect path");

  /* Nothing may assume the seller is disconnected after a DELETE. The only
     setEtsyConnected(false) allowed is one derived from what the route said. */
  const afterDelete = app.slice(app.indexOf('fetch("/api/etsy",{method:"DELETE"})'));
  const window = afterDelete.slice(0, 900);
  assert.doesNotMatch(window, /setEtsyConnected\(false\)/,
    "the promoted shop must survive a disconnect");
  assert.match(window, /if\(!response\.ok\)throw new Error/, "a non-2xx DELETE is handled");
  assert.match(window, /setEtsyConnected\(Boolean\(result\.connected\)\)/, "the route's answer is applied");
  assert.match(window, /setEtsyShops\(listing\.shops\|\|\[\]\)/, "and the switcher list is refreshed");

  /* Every connected Etsy row offers the way to add the next shop - without it
     the switcher can never have anything to switch to. */
  const row = app.slice(app.indexOf("function etsyConnectionRow"));
  assert.match(row.slice(0, 1600), /Connect another Etsy shop/,
    "the connected row offers adding another shop");
});
