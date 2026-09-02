import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const tools=await readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");

test("D939: a product being selected stays white instead of becoming maroon",()=>{
  assert.match(tools,/className={`recipe-tile[\s\S]*?\$\{selecting\?"selecting":""\}`}/);
  assert.match(css,/\.app-shell \.recipe-card \.recipe-tile\.selecting\{[^}]*background:#fff!important/);
  assert.match(css,/\.recipe-tile\.selecting \.recipe-use:disabled\{[^}]*background:#fff!important[^}]*opacity:1!important[^}]*filter:none!important/);
  assert.match(css,/\.recipe-tile\.selecting \.recipe-copy>em\{[^}]*background:#fff!important[^}]*color:#62515c!important[^}]*box-shadow:none!important/);
});
