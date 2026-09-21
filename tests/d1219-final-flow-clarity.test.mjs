import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { completedGeneratedTags } from "../app/listing-title-tags.ts";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const handoff = await readFile(new URL("../app/photo-delivery-handoff.tsx", import.meta.url), "utf8");
const css = (await Promise.all(["interface-v2.css","lilac-theme.css"].map(name=>readFile(new URL(`../app/${name}`, import.meta.url), "utf8")))).join("\n");
const usage = await readFile(new URL("../app/usage/page.tsx", import.meta.url), "utf8");

test("generated tags contain only relevant phrases selected from the current bank", () => {
  const tags=completedGeneratedTags(["Jane Austen","Summerween"],["Pride and Prejudice"],["Jane Austen","Pride and Prejudice","Most Ardently","Book Lover Gift"]);
  assert.deepEqual(tags,["jane austen","pride and prejudice"]);
  assert.ok(tags.every(tag=>tag.length<=20));
  assert.ok(!tags.includes("most ardently"),"unused bank phrases must not fill empty tag slots");
  assert.ok(!tags.includes("summerween"),"a returned phrase outside the current bank is rejected");
  assert.match(app, /completedGeneratedTags\(payload\.tags\|\|\[\],payload\.keywords\|\|\[\],keywords\)/);
  assert.doesNotMatch(app, /returnedTags\.length\?returnedTags:fallback/);
});

test("D1219 makes Review batch delays and blockers explicit", () => {
  assert.match(app, /Opening final review…/);
  assert.match(app, /Saving your latest listing changes before review…/);
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
  assert.match(app, />Open drafts in Printify ↗<\/a>/);
  assert.doesNotMatch(app, /<summary>Other options<\/summary>/);
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
