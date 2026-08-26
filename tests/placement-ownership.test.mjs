/* D598 - identifiers are not trusted merely because the row would end up under
   the signed-in seller.

   Found by a live probe: a PUT naming listingId "forged", designKey "forged" and
   batchId "forged" returned 200 and created a real row. Nothing cross-seller -
   the body's userId was correctly ignored - but nothing checked the named batch,
   listing, design and scene were real, owned, or related to each other. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const route = await read("app/api/mockups/placement/route.ts");
const app = await read("app/listing-factory-app.tsx");
const drafts = await read("app/api/printify/drafts/route.ts");

test("a seller cannot use another seller's scene", () => {
  // The scene lookup is filtered by the session user, so a scene belonging to
  // anyone else simply is not found.
  assert.match(route, /\.where\(and\(eq\(mockupTemplates\.id, want\.sceneId\), eq\(mockupTemplates\.userId, userId\)\)\)/);
  assert.match(route, /if \(!scene\) return false/);
});

test("a seller cannot write against another seller's batch", () => {
  /* D599 - the draft row IS the proof of batch ownership: it is written with the
     creating seller's id under this exact batch. Filtering it by the session
     user is what stops one seller naming another seller's batch. */
  assert.match(route, /FROM printify_draft_results WHERE user_id = \? AND batch_id = \?/);
  assert.match(route, /\.bind\(userId, want\.batchId, want\.designKey\)/);
  assert.match(route, /if \(!draft\?\.response_json\) return false/);
});

test("D599 - the batch id is checked in the namespace it actually comes from", () => {
  /* The outage D599 fixes: two unrelated ids are both called "batchId".

     The editor's batchId travels draft.batchId -> templateDetails.batchId ->
     printify_draft_results.batch_id. It is NOT a listing_batches id, so looking
     it up there rejected every real request while still answering 404 to forged
     ones, which made a total outage look like a passing security fix. */
  assert.match(app, /<IntegratedMockups[^>]*batchId=\{draft\.batchId\|\|""\}/,
    "the editor is handed draft.batchId");
  assert.match(app, /body: JSON\.stringify\(\{ batchId: templateDetails\?\.batchId,/,
    "draft.batchId originates as templateDetails.batchId");
  assert.match(drafts, /INSERT INTO printify_draft_results \(request_key, user_id, batch_id, client_id/,
    "and that same id is stored as printify_draft_results.batch_id");

  const code = route.slice(route.indexOf("async function relationshipsHold"), route.indexOf("const notFound"))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!code.includes("listing_batches"),
    "the Printify batch id must never be looked up in listing_batches");
});

test("D599 - the design key is checked against the column it was written to", () => {
  // designKey is design.id on the client; the draft stores it as client_id.
  assert.match(app, /designKey=\{design\.id\|\|design\.name\|\|""\}/);
  assert.match(app, /clientId: design\.id \}\)/);
  assert.match(drafts, /\.bind\(idempotencyKey, user\.userId, body\.batchId, body\.clientId \?\? body\.fileName\)/);
  assert.match(route, /AND client_id = \?/);
});

test("a listing from one batch cannot be used with another", () => {
  // The draft is looked up by batch AND design, then the listing id it actually
  // produced must equal the one being claimed.
  assert.match(route, /FROM printify_draft_results WHERE user_id = \? AND batch_id = \? AND client_id = \?/);
  assert.match(route, /if \(!parsed\.id \|\| parsed\.id !== want\.listingId\) return false/);
});

test("a design key not present in the listing is rejected", () => {
  // client_id IS the design key; no row means no such design in that batch.
  assert.match(route, /AND client_id = \?/);
  assert.match(route, /if \(!draft\?\.response_json\) return false/);
});

test("a stale or deleted scene is rejected", () => {
  // A deleted template cannot be selected, so relationshipsHold returns false
  // and the caller answers 404 rather than reading or writing.
  assert.match(route, /const notFound = \(\) => NextResponse\.json\(\{ error: "Not available\." \}, \{ status: 404 \}\)/);
  assert.match(route, /return notFound\(\)/);
});

test("a mismatched print side is rejected", () => {
  assert.match(route, /if \(want\.printSide && \(scene\.printSide \|\| "front"\) !== want\.printSide\) return false/,
    "a back-print record must not attach to a front-facing photograph");
});

test("a rejected request creates no row", () => {
  // Both records are validated BEFORE either insert runs.
  const put = route.slice(route.indexOf("async function handlePUT"));
  const geometryCheck = put.indexOf("body.geometry?.sceneId && !await relationshipsHold");
  const overrideCheck = put.indexOf("body.override?.sceneId && !await relationshipsHold");
  const firstInsert = put.indexOf(".insert(");
  assert.ok(geometryCheck > 0 && overrideCheck > 0, "both records are validated");
  assert.ok(firstInsert > overrideCheck,
    "no insert may run before every relationship has been proved");
});

test("GET validates before returning anything", () => {
  const get = route.slice(route.indexOf("async function handleGET"), route.indexOf("async function handlePUT"));
  const check = get.indexOf("await relationshipsHold");
  const firstSelect = get.indexOf("db.select()");
  assert.ok(check > 0 && firstSelect > check, "the relationship check precedes the read");
});

test("ownership is never taken from the request body", () => {
  // userId always comes from the session; the body cannot supply or influence it.
  assert.match(route, /relationshipsHold\(user\.userId,/);
  assert.ok(!/relationshipsHold\((body|o|g)\./.test(route));
  assert.ok(!/userId: *(body|o|g)\./.test(route));
});

test("validation runs server-side against the database, not on claims", () => {
  // Every branch of the validator hits a table.
  const validator = route.slice(route.indexOf("async function relationshipsHold"), route.indexOf("const notFound"))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const table of ["mockupTemplates", "printify_draft_results"])
    assert.ok(validator.includes(table), `${table} must be consulted`);
  assert.ok(!/req\.|request\.body/.test(validator), "the validator reads no request claims");
});
