import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { completedGeneratedTags } from "../app/listing-title-tags.ts";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const handoff = await readFile(new URL("../app/photo-delivery-handoff.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const usage = await readFile(new URL("../app/usage/page.tsx", import.meta.url), "utf8");

test("D1219 fills partial generated tag sets from valid keyword fallbacks", () => {
  const tags=completedGeneratedTags(["Jane Austen"],["Pride and Prejudice"],["Jane Austen","Most Ardently","This phrase is far too long to be an Etsy tag","Book Lover Gift"]);
  assert.deepEqual(tags,["jane austen","pride and prejudice","most ardently","book lover gift"]);
  assert.ok(tags.every(tag=>tag.length<=20));
  assert.match(app, /completedGeneratedTags\(payload\.tags\|\|\[\],payload\.keywords\|\|\[\],keywords\)/);
  assert.doesNotMatch(app, /returnedTags\.length\?returnedTags:fallback/);
});

test("D1219 makes Review batch delays and blockers explicit", () => {
  assert.match(app, /Before you can review this batch/);
  assert.match(app, /Opening final review…/);
  assert.match(app, /Saving your latest listing changes\. This can take about 15 seconds\./);
  assert.match(app, /This is optional and does not block Review batch\./);
  assert.match(app, /failures\.push\(`Listing \$\{item\.index\+1\}: \$\{message\}`\)/);
  assert.match(app, /stopWith\("Some Etsy details were not saved\.",failures\)/);
});

test("D1219 uses a compact scalable product overview on Step 4", () => {
  assert.match(app, /className="final-product-overview"/);
  assert.match(app, /className="final-product-grid"/);
  assert.match(app, /false,finalProductOverview\(\)\)\}/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(220px,1fr\)\)/);
});

test("D1219 separates Batch History from Printify and Etsy destinations", () => {
  assert.doesNotMatch(app, />Save as draft<\/button>/);
  assert.match(app, />Save to Batch History<\/button>/);
  assert.match(app, /Choose where to keep these listings/);
  assert.match(app, />Keep in Printify</);
  assert.match(app, />Send to Etsy Drafts</);
  assert.match(app, /className="workflow-next"[^]*?"Save to Etsy Drafts"/);
});

test("D1219 removes the confusing handoff essay and product nickname", () => {
  assert.doesNotMatch(handoff, /Goldie sends and checks everything/);
  assert.doesNotMatch(handoff, /What Goldie checks/);
  assert.doesNotMatch(handoff, /Checking lasts up to 24 hours/);
  assert.match(handoff, /The Listing Factory never publishes or renews a listing/);
  assert.doesNotMatch(app, /Goldie sends finished listings|sign in to Goldie/i);
  assert.doesNotMatch(usage, /Goldie (successfully|never)|Goldie AI calculates/);
  assert.match(usage, /The Listing Factory never publishes to Etsy/);
  assert.doesNotMatch(usage, /from "next\/link"/);
});
