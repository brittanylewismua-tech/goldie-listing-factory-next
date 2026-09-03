import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const review = await readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");

test("D960: the empty Product step names the actual missing requirement", () => {
  assert.match(app, /FactoryFooter status=\{`\$\{missingRequirement\} to continue`\}/);
  assert.match(app, /disabled>\{missingRequirement\}<\/button>/);
});

test("D960: bundle upload guidance explains one upload across every product", () => {
  assert.match(app, /Upload each \$\{uploadPrimaryLabel\} design once\. Goldie uses it on every product in this bundle\./);
});

test("D960: completed drafts suppress the stale missing-local-file warning", () => {
  assert.match(app, /design\.originalUnavailable&&!savedDrafts\.some\(draft=>draft\.clientId===design\.id&&draft\.status==="Created"&&draft\.id\)/);
});

test("D960: hoodie and sweatshirt products cannot be described as short sleeve", () => {
  const longIndex = app.indexOf('/long.?sleeve|sweatshirt|crewneck|hoodie/');
  const shortIndex = app.indexOf('/short.?sleeve|\\bt-?shirt\\b|\\btee\\b/');
  assert.ok(longIndex >= 0 && shortIndex > longIndex);
  assert.doesNotMatch(app, /sweatshirt\|hoodie\?"Crew"/);
});

test("D960: final Printify handoff has one save action and honest non-blocking advice", () => {
  assert.doesNotMatch(app, />Save this batch for later<\/button>/);
  assert.match(review, /handoffOnly\?`\$\{attention\} optional \$\{attention===1\?"improvement":"improvements"\}`:`\$\{attention\} \$\{attention===1\?"needs":"need"\} a look`/);
  assert.match(review, /handoffOnly\?"advice":"needs-attention"/);
  assert.match(css, /final-design-group summary em\.advice\{/);
});

test("D960: internal confirmation is black and final handoff copy is readable", () => {
  assert.match(css, /\.app-shell \.preflight \.preflight-confirm\{background:#0d0b0c!important;color:#fff!important/);
  assert.match(css, /\.factory-publish-box \.printify-handoff-button \.publish-all-shop\{color:rgba\(255,255,255,\.72\)!important/);
});
