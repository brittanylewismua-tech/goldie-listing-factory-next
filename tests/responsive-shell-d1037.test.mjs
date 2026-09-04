import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");

test("a narrowed desktop window cannot retain the desktop sidebar offset", () => {
  const block = css.match(/\/\* D1037[\s\S]*?@media \(max-width:820px\) and \(pointer:fine\)\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(block, /\.app-shell\{display:block!important;padding-left:0!important\}/);
  assert.match(block, /\.app-shell>\.topbar\{display:none!important\}/);
  assert.match(block, /\.app-shell>\.factory-main\{width:100%!important/);
});

test("the touch-device desktop-required gate remains independently scoped", () => {
  assert.match(readFileSync(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
    /@media\(max-width:820px\) and \(pointer:coarse\)[\s\S]*?\.app-shell>:not\(\.mobile-gate\)\{display:none!important\}/);
});
