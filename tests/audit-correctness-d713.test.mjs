import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("physical Printify facts cannot be overwritten by contradictory AI attributes", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const fn = app.match(/function productEtsyDefaults[\s\S]*?\n\}/)?.[0] || "";
  assert.match(fn, /return \{\.\.\.Object\.fromEntries[\s\S]*\.\.\.derived\}/);
  assert.ok(fn.indexOf("saved||{}") < fn.lastIndexOf("...derived"));
});

test("published state is re-derived when an old batch is opened", async () => {
  const route = await read("app/api/batches/route.ts");
  assert.match(route, /product_id IN \(\$\{marks\}\)/);
  assert.match(route, /status='completed'/);
  assert.match(route, /authoritativeReceipt/);
});

test("warnings are opt-in at final review", async () => {
  const review = await read("app/final-listing-review.tsx");
  assert.match(review, /selectable\.filter\(draft=>!reviewNeeded\(draft\)\)/);
  assert.match(review, /window\.confirm\("This listing still needs a title or tag review\./);
  assert.match(review, /Select every listing that is ready/);
});

test("uploaded artwork can be inspected before draft creation", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /function UploadedDesignPreview/);
  assert.match(app, /aria-label=\{`View \$\{name\} larger`\}/);
  assert.match(app, /Full-size preview of \$\{name\}/);
});

test("the final-review count cannot overlap its heading", async () => {
  const css = await read("app/clarity-pass.css");
  assert.match(css, /\.final-review>\.step-content>\.step-heading>\.done-mark\{[\s\S]*?position:static!important/);
});
