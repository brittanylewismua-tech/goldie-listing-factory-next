import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/mastermind/migration-export/route.ts", import.meta.url), "utf8");

test("D995 migration export is owner-only and excludes reset copies", () => {
  assert.match(route, /if \(!\(await owner\(\)\)\) return NextResponse\.json\(\{ error: "Not authorized\." \}, \{ status: 403 \}\)/);
  assert.match(route, /name NOT LIKE '_account_reset_%'/);
});

test("D995 rotates connection secrets before export instead of returning plaintext", () => {
  assert.match(route, /decryptPrintifyToken\(encrypted, oldKey\)/);
  assert.match(route, /encryptPrintifyToken\(await decryptPrintifyToken\(encrypted, oldKey\), newKey\)/);
  assert.doesNotMatch(route, /decrypted[_A-Za-z]*\s*:/);
  assert.match(route, /\^\[a-f0-9\]\{64\}\$/);
});

test("D996 exports one table at a time so large accounts do not time out", () => {
  assert.match(route, /if \(!body\.table\) return NextResponse\.json\(\{ tables: schemas\.results/);
  assert.match(route, /schema\.name === body\.table/);
  assert.match(route, /return NextResponse\.json\(\{ table: \{ name: selected\.name, sql: selected\.sql, rows \} \}\)/);
  assert.doesNotMatch(route, /for \(const schema of schemas\.results\)/);
});

test("D995 stored objects are private, authenticated and streamed without buffering", () => {
  assert.match(route, /const object = await bucket\.get\(key\)/);
  assert.match(route, /return new Response\(object\.body/);
  assert.match(route, /cache-control", "private, no-store"/);
  assert.doesNotMatch(route, /arrayBuffer\(\)/);
});
