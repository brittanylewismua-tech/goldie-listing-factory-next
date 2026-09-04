import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D969: the bulk Printify link is secondary and separated from the products",()=>{
  assert.match(app,/className="open-all-button"[^>]*>Review all listings in Printify/);
  assert.match(css,/\.step-product-cards>\.post-draft-heading\{[^}]*justify-content:flex-end!important;[^}]*margin:0 0 18px!important/);
  assert.match(css,/\.step-product-cards>\.post-draft-heading \.open-all-button\{[^}]*background:transparent!important;[^}]*font:650 11px/);
});

test("D1075: every draft color uses an immediate product illustration",()=>{
  assert.match(app,/className="draft-color-product-glyph"[\s\S]{0,180}<ProductGlyph title=\{product\.blueprintTitle\} color=\{color\.swatch\}/);
  assert.match(css,/\.draft-color-grid button>\.draft-color-product-glyph\{[^}]*width:34px;[^}]*height:34px/);
});
