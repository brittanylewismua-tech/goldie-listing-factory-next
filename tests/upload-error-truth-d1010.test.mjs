import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const stage = await readFile(new URL("../app/api/printify/stage/route.ts", import.meta.url), "utf8");
const drafts = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");

test("an HTML upload response cannot be misreported as a bad Printify token", () => {
  assert.doesNotMatch(app, /\/401\|token\|unauthorized\|not accept\/i/);
  assert.match(app, /Unexpected token '<'/);
  assert.match(app, /response\.headers\.get\("content-type"\)/);
  assert.match(app, /response\.status===413/);
  assert.match(app, /Secure artwork delivery returned HTTP/);
});

test("large artwork is validated and stored through one stream", () => {
  assert.doesNotMatch(stage, /request\.body\.tee\(\)/);
  assert.match(stage, /const storageStream = await validateImageHeader\(request\.body, contentType\)/);
  assert.match(stage, /return new ReadableStream<Uint8Array>/);
  assert.match(stage, /new FixedLengthStream\(contentLength\)/);
  assert.match(stage, /Promise\.all\(\[artwork\.put\(stagedId,fixed\.readable,metadata\),piping\]\)/);
});

test("large staged artwork reaches Printify by short-lived URL, not base64", () => {
  assert.match(drafts, /signedArtworkUrl\(requestOrigin, artwork\.stagedId, artworkSecret\)/);
  assert.match(drafts, /JSON\.stringify\(\{ file_name: source\.fileName, url: source\.url \}\)/);
  assert.doesNotMatch(drafts, /contents: source\.contents/);
});

test("credential guidance is reserved for credential-shaped failures", () => {
  assert.match(app, /expired\|invalid\|revoked/);
  assert.match(app, /token\\s\+\(\?:was/);
});
