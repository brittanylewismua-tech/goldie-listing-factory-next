import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("keeps the frozen sidebar footer anchored beneath navigation", async () => {
  const html = await readFile(new URL("public/goldie-real.html", root), "utf8");
  assert.match(html, /\.sidebar-bottom\{margin-top:auto;padding-top:24px/);
  assert.match(html, /<div class="sidebar-bottom">[\s\S]*?<div class="plan"><b>Usage<\/b>[\s\S]*?Powered by[\s\S]*?© 2026 Be A Wolf Biz[\s\S]*?<\/div>\s*<\/aside>/);
});

test("keeps Printify token help inside the Printify connection section", async () => {
  const html = await readFile(new URL("public/goldie-real.html", root), "utf8");
  const groupStart = html.indexOf('<section class="printify-service-group">');
  const help = html.indexOf('class="tokenlink" data-token-help', groupStart);
  const groupEnd = html.indexOf("</section>", groupStart);
  const etsy = html.indexOf('data-connection="etsy"', groupStart);

  assert.ok(groupStart >= 0, "Printify section is present");
  assert.ok(help > groupStart && help < groupEnd, "token help stays inside Printify section");
  assert.ok(etsy > groupEnd, "Etsy remains a separate row after Printify");
});

test("documents the approved baseline as a frozen change-control contract", async () => {
  const baseline = await readFile(new URL("docs/APPROVED_VISUAL_BASELINE.md", root), "utf8");
  assert.match(baseline, /Usage card is bottom-anchored/);
  assert.match(baseline, /How to get your Printify token.*inside the Printify section/);
  assert.match(baseline, /functionality change may not alter the frozen visual rules/);
});
