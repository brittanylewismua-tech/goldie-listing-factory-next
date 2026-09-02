import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const tools=readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D946: the product chooser states its instruction once",()=>{
  assert.match(app,/title: "Choose a product or bundle", copy: "Select one to start your batch\."/);
  assert.match(app,/"Saved products and bundles"/);
  assert.doesNotMatch(tools,/>Select a product to use for this batch\.<\/p>/);
});

test("D946: create-product and create-bundle actions share one button treatment",()=>{
  assert.match(app,/>＋ Add a new product<\/button>/);
  assert.match(app,/>＋ Create a new bundle<\/button>/);
  assert.match(css,/\.factory-panel-actions \.panel-create-action\{[\s\S]*min-height:40px/);
});

test("D946: restart dialog has one primary action and a quiet destructive choice",()=>{
  assert.match(app,/<header className="restart-batch-head">/);
  assert.match(app,/"Save batch \+ start new"/);
  assert.match(css,/\.restart-batch-actions \.save-restart\{grid-column:1\/-1;grid-row:1\}/);
  assert.match(css,/\.restart-batch-actions \.discard-restart\{background:#fff!important;color:#9b334c!important/);
});
