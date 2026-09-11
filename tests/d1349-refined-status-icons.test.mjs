import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("D1349: review status marks use centered line icons instead of heavy glyphs",async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")
  ]);
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/entry\.done\?<svg viewBox="0 0 16 16"/);
  assert.match(nav,/d="m3\.5 8\.2 2\.7 2\.7 6\.3-6\.3"/);
  assert.doesNotMatch(nav,/entry\.done\?"✓":"×"/);
  assert.match(css,/\.review-section-state\{[^}]*width:22px[^}]*height:22px[^}]*border:1px solid currentColor/);
  assert.match(css,/\.review-section-state svg\{[^}]*width:14px[^}]*stroke-width:2[^}]*stroke-linecap:round/);
});
