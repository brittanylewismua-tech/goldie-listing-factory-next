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

test("keeps the Printify and Etsy panels visually separated", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(css, /\.connect-step \.connection-stack\{display:grid;gap:18px;/);
  assert.match(page, /connection-stack connection-setup connected-connection-stack/);
});

test("documents the approved baseline as a frozen change-control contract", async () => {
  const baseline = await readFile(new URL("docs/APPROVED_VISUAL_BASELINE.md", root), "utf8");
  assert.match(baseline, /Usage card is bottom-anchored/);
  assert.match(baseline, /How to get your Printify token.*inside the Printify section/);
  assert.match(baseline, /functionality change may not alter the frozen visual rules/);
});

test("uses intentional workflow icons instead of placeholder glyphs", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.doesNotMatch(css, /content:\s*["'](?:□|▣)["']/);
  assert.match(css, /\.product-step \.step-number:after,\.recipe-card>\.step-number:after/);
  assert.match(css, /\.designs-step\.finish-mode>\.step-number:after/);
  assert.match(css, /\.etsy-details-step>\.step-number:after/);
  assert.match(css, /\.final-review>\.step-number:after/);
});

test("keeps the connection icon optically centered without rotating the link", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.connect-step>\.step-number:after\{position:absolute;left:50%;top:50%;animation:none;transform:translate\(-50%,-50%\)!important\}/);
});

test("centers every next-step button as one balanced control", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.workflow-next\{justify-content:center;gap:10px;margin-left:auto;margin-right:auto\}/);
});

test("places the connection subtitle before the centered timing note", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(page, /Connect the Printify shop where Goldie will create your product drafts\.<\/p>\s*<p className="connect-timing">/);
  assert.match(css, /\.connect-timing\{margin:0 auto 22px!important;[^}]*text-align:center\}/);
});

test("stacks the connected Etsy shop name for long shop names", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(page, /<b>\{etsyConnected\?"Etsy connected":"Etsy"\}<\/b>\{etsyConnected&&<em className="etsy-shop-name">/);
  assert.match(css, /\.etsy-shop-name\{display:block;[^}]*font-style:italic;[^}]*text-overflow:ellipsis;white-space:nowrap\}/);
assert.match(css, /\.connected-connection-stack>\.connection-row\{width:100%;height:84px;min-height:84px;[^}]*padding:14px 15px;box-sizing:border-box\}/);
assert.match(css, /Final cascade lock:[\s\S]*\.app-shell \.step-card>\.step-number,[\s\S]*width:64px;[\s\S]*height:64px;[\s\S]*background:conic-gradient/);
assert.match(css, /\.app-shell \.recipe-card>\.step-number:after\{[\s\S]*M12 16V4[\s\S]*center\/contain no-repeat!important/);
assert.match(page, /launch-step-icon.*create-drafts-icon.*pricing-icon/);
assert.match(css, /\.launch-panel>\.pricing-icon:after\{[\s\S]*rect x='4' y='3'/);
assert.match(css, /\.launch-panel>\.create-drafts-icon:after\{[\s\S]*M11 13h4/);
});

test("preview navigation renders the real later-step experiences", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /if\(index>=3&&!templateDetails\)await loadPreviewDemo\(\)/);
  assert.match(page, /if\(index===4\)\{goToStep\("review",false,true\);setPreflightOpen\(true\);return\}/);
  assert.match(page, /setFinishPhase\(index===5\?"details":index===6\?"etsy":index===7\?"mockups":"final"\)/);
});

test("images and mockups begins with real content instead of an empty stage", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.workspace\.mockup-workspace\{display:contents!important\}/);
  assert.match(css, /\.workspace\.mockup-workspace \.workflow-stage\{display:none!important\}/);
  assert.match(css, /\.workspace\.mockup-workspace\+\.recommended-listing-photos\+\.post-draft-workspace\{grid-row:4/);
});
