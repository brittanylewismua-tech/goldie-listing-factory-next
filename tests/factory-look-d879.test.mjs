import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8");

test("D879: the rail gear is texture, not a foreground illustration", async () => {
  const css = await read("app/interface-v2.css");
  assert.match(css, /fill-opacity%3D%27\.19%27/);
  assert.doesNotMatch(css, /fill-opacity%3D%27\.30%27/);
});

test("D879: the black rail carries readable white footer copy", async () => {
  const css = await read("app/clarity-pass.css");
  assert.match(css, /\.app-shell \.etsy-api-disclosure\{color:rgba\(255,255,255,\.6\)!important\}/);
  assert.doesNotMatch(css, /\.app-shell \.etsy-api-disclosure\{color:rgba\(74,42,62,\.95\)!important\}/);
});

test("D879: retired aubergine gradients cannot return on factory or management actions", async () => {
  const css = (await Promise.all([
    read("app/approved-functional.css"),
    read("app/management-aesthetic.css"),
  ])).join("\n");
  assert.doesNotMatch(css, /linear-gradient\(145deg,#5b304f,#45263c\)/);
  assert.doesNotMatch(css, /linear-gradient\(145deg,#6a3c61,#4b2c47\)/);
  assert.match(css, /\.app-shell \.batch-title-preview\{background:#0d0b0c/);
  assert.match(css, /\.keyword-page \.save-toast\{[^}]*background:#0d0b0c/);
});

test("D879: the blocking dialog uses the factory action language", async () => {
  const css = await read("app/interface-v2.css");
  assert.match(css, /\.blocking-modal \.publish-confirm-icon\{background:var\(--lf-pink\);color:#171014\}/);
  assert.match(css, /\.blocking-modal \.publish-confirm-actions button,[\s\S]*?box-shadow:none!important/);
});
