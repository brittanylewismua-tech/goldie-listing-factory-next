import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { completedGeneratedTags } from "../app/listing-title-tags.ts";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const handoff = await readFile(new URL("../app/photo-delivery-handoff.tsx", import.meta.url), "utf8");
const css = (await Promise.all(["interface-v2.css","lilac-theme.css"].map(name=>readFile(new URL(`../app/${name}`, import.meta.url), "utf8")))).join("\n");
const usage = await readFile(new URL("../app/usage/page.tsx", import.meta.url), "utf8");

test("D1219 fills partial generated tag sets from valid keyword fallbacks", () => {
  const tags=completedGeneratedTags(["Jane Austen"],["Pride and Prejudice"],["Jane Austen","Most Ardently","This phrase is far too long to be an Etsy tag","Book Lover Gift"]);
  assert.deepEqual(tags,["jane austen","pride and prejudice","most ardently","book lover gift"]);
  assert.ok(tags.every(tag=>tag.length<=20));
  assert.match(app, /completedGeneratedTags\(payload\.tags\|\|\[\],payload\.keywords\|\|\[\],keywords\)/);
  assert.doesNotMatch(app, /returnedTags\.length\?returnedTags:fallback/);
});

test("D1219 makes Review batch delays and blockers explicit", () => {
  assert.match(app, /Finish this before Review/);
  assert.match(app, /Opening final review…/);
  assert.match(app, /Saving your latest listing changes\. This can take about 15 seconds\./);
  assert.match(app, /This is optional and does not block Review batch\./);
  assert.match(app, /failures\.push\(`Listing \$\{item\.index\+1\}: \$\{message\}`\)/);
  assert.match(app, /stopWith\("Some Etsy details were not saved\.",failures\)/);
});

test("D1251 exposes every editable area beneath each listing on Review", () => {
  assert.doesNotMatch(app, /function finalProductOverview\(/);
  assert.match(app, /onEditProduct=\{editReviewedProduct\}/);
  assert.match(css, /recipe-listing-sections/);
  assert.doesNotMatch(css, /recipe-product-settings/);
});

test("D1240 keeps one primary Etsy-draft decision on Review", () => {
  assert.doesNotMatch(app, />Save as draft<\/button>/);
  assert.match(app, />Save to Batch History<\/button>/);
  assert.doesNotMatch(app, /Choose where to keep these listings/);
  assert.doesNotMatch(app, />Keep in Printify</);
  assert.match(app, /<summary>Other options<\/summary>/);
  assert.match(app, /className="review-etsy-draft-button"[^]*?"Save to Etsy Drafts"/);
});

test("D1219 removes the confusing handoff essay and product nickname", () => {
  assert.doesNotMatch(handoff, /Goldie sends and checks everything/);
  assert.doesNotMatch(handoff, /What Goldie checks/);
  assert.doesNotMatch(handoff, /Checking lasts up to 24 hours/);
  assert.doesNotMatch(handoff, /No download or second upload/);
  assert.doesNotMatch(app, /Goldie sends finished listings|sign in to Goldie/i);
  assert.doesNotMatch(usage, /Goldie (successfully|never)|Goldie AI calculates/);
  assert.match(usage, /The Listing Factory never publishes to Etsy/);
  assert.doesNotMatch(usage, /from "next\/link"/);
});
