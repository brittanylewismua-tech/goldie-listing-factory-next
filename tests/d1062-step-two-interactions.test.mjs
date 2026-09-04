import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1062 keeps Printify actions truthful and explains the required account context",()=>{
  assert.match(app,/openLabel:draft\.editorUrl&&draft\.id\?"Adjust in Printify"/);
  assert.doesNotMatch(app,/openLabel:[^\n]*"Printify opened"/);
  assert.match(app,/className="placement-printify-note"[^>]*>To adjust these designs in Printify, sign in to Printify first and make sure the correct shop is selected\./);
});

test("D1062 blank space cannot collapse interactive color or shipping workspaces",()=>{
  assert.match(app,/\["draft-pricing","draft-colors","draft-shipping"\]\.includes\(row\.task\|\|""\)/);
});

test("D1062 flattens shipping and keeps utility controls readable",()=>{
  assert.match(css,/\.post-draft-shipping-review>[.]variant-pricing/);
  assert.match(css,/\.post-draft-shipping-review \.shipping-pricing-section/);
  assert.match(css,/shipping-combobox-trigger:hover[\s\S]{0,160}background:#f8f5f7!important;color:#111!important/);
  assert.match(css,/post-draft-heading \.open-all-button:hover[\s\S]{0,180}background:transparent!important;color:#2f242b!important/);
});
