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

test("uses product and artwork icons for Steps 2 and 3 instead of transfer arrows", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.product-step>\.step-number:after,[\s\S]*mask:url\("data:image\/svg\+xml[^}]*M8\.5 4\.5/);
  assert.match(css, /\.app-shell \.designs-step:not\(\.finish-mode\)>\.step-number:after\{[\s\S]*%3Crect x='3' y='4' width='18' height='16'/);
});

test("uses one Goldie aesthetic across every linked management page", async () => {
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const css = await readFile(new URL("app/management-aesthetic.css", root), "utf8");
  assert.match(layout, /import "\.\/management-aesthetic\.css"/);
  assert.match(css, /:is\(\.management-page,\.usage-page,\.keyword-page,\.mockupFactory\)/);
  assert.match(css, /\.keyword-page \.management-topbar/);
  assert.match(css, /\.managementOnly \.mockupTopbar/);
  assert.match(css, /\.usage-page \.usage-track i\{background:linear-gradient/);
  assert.doesNotMatch(css, /#dcae43|#080808|#d69d2d/);
});

test("keeps the Step 4 footer controls below the pricing card without collisions", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css,/workflow-stage>\.workflow-footer-actions/);
  assert.match(css,/grid-template-columns:1fr auto 1fr/);
  assert.match(css,/workflow-footer-actions \.autosave-note[\s\S]*position:static!important/);
  assert.match(css,/launch-panel \.launch-note[\s\S]*margin:18px auto 0!important/);
});

test("keeps Step 7 clear and its icon locked to the optical center", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(page, /Review your Etsy listing details/);
  assert.match(page, /Goldie has pre-filled the Etsy category and every product field it could confidently match for each listing\. Look everything over and change any selection that does not fit\./);
  assert.match(page, /Titles, tags, descriptions, sizes, colors, and prices are set\./);
  assert.match(page, /This step contains additional Etsy category and product fields\. Optional fields stay blank when there is not a clear match\./);
  assert.doesNotMatch(page, /standardized attributes/);
  assert.doesNotMatch(page, /are already handled/);
  assert.match(css, /\.app-shell \.step-card>\.step-number:after,[\s\S]*left:50%;[\s\S]*top:50%;[\s\S]*transform:translate\(-50%,-50%\)!important/);
  assert.match(css, /\.app-shell \.etsy-details-step>\.step-number:after\{[\s\S]*mask:url\([\s\S]*center\/contain no-repeat!important/);
});

test("keeps the connection icon optically centered without rotating the link", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.connect-step>\.step-number:after\{position:absolute;left:50%;top:50%;animation:none;transform:translate\(-50%,-50%\)!important\}/);
});

test("centers every next-step button as one balanced control", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.workflow-next\{justify-content:center;gap:10px;margin-left:auto;margin-right:auto\}/);
});

test("keeps Step 8 listing summaries compact and on-brand", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.draft-state\{color:#865675!important\}/);
  assert.match(css, /\.app-shell \.draft-card-top\{[\s\S]*grid-template-columns:minmax\(320px,48%\) minmax\(0,1fr\)!important/);
  assert.match(css, /\.app-shell \.draft-card-top \.tag-row\{[\s\S]*max-height:82px;[\s\S]*overflow:auto/);
});

test("returns every finish-phase transition to the top", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /useEffect\(\(\)=>\{if\(workflowStep==="finish"\)window\.scrollTo\(\{top:0,behavior:"smooth"\}\)\},\[workflowStep,finishPhase\]\)/);
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
assert.ok(page.indexOf('className="workflow-footer-actions"') > page.indexOf('className={`launch-panel workflow-panel'), "Back and autosave must render after the active step content");
assert.equal((page.match(/Clear batch \+ start over/g) || []).length, 1, "Only one clear-batch control should be present");
assert.match(css, /UX readability lock[\s\S]*\.app-shell \.batch-limits\{[\s\S]*justify-content:center[\s\S]*font-size:12px!important/);
assert.match(css, /\.app-shell \.folder-drop small\{[\s\S]*font-size:12px!important/);
assert.match(css, /\.app-shell \.variant-table th\{font-size:12px!important/);
assert.match(page, /"Save new shipping profile"/);
assert.match(css, /\.app-shell \.custom-shipping-actions button:first-child\{[\s\S]*background:linear-gradient\(145deg,#6a3456,#4b283e\)!important/);
assert.match(css, /\.app-shell \.custom-shipping-actions button\{[\s\S]*font-size:12\.5px!important[\s\S]*text-transform:none!important/);
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

test("locks workflow states to the Goldie lilac, pink, and plum palette", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /Final palette lock[\s\S]*\.app-shell \.file-reminder[\s\S]*border-left:3px solid #b56fa6!important/);
  assert.match(css, /\.app-shell \.design-status-icon,[\s\S]*border-color:#b777b0!important;[\s\S]*border-top-color:transparent!important/);
  assert.match(css, /\.app-shell \.design-status-track i,[\s\S]*linear-gradient\(90deg,#a765a0,#d992c5,#b6a8ff\)!important/);
  assert.match(css, /\.app-shell \.recipe-icon\{background:linear-gradient\(145deg,#d591c3,#a86ba2\)!important/);
  assert.match(css, /\.app-shell \.variant-pricing\.approved\{border-color:rgba\(139,89,137,\.28\)!important/);
  assert.match(css, /\.app-shell \.final-checklist span\{border-color:rgba\(139,89,137,\.22\)!important/);
});

test("keeps Step 2 saved-product text and selections in the plum palette", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /Step 2 saved-product palette lock/);
  assert.match(css, /\.app-shell \.recipe-card \.recipe-copy small,[\s\S]*color:#654362!important/);
  assert.match(css, /\.app-shell \.recipe-card \.recipe-tile\.selected\{[\s\S]*border-color:#b777b0!important/);
  assert.match(css, /\.app-shell \.recipe-card \.recipe-icon,[\s\S]*linear-gradient\(145deg,#d591c3,#a86ba2\)!important/);
  assert.match(css, /\.app-shell \.recipe-card \.active-recipe\{[\s\S]*background:rgba\(225,194,231,\.34\)!important/);
});

test("places item pricing before shipping in the pricing review", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  const itemPrices = page.indexOf('<h4>1. Item prices</h4>');
  const pricingMath = page.indexOf('className="pricing-math"');
  const shipping = page.indexOf('<h4>2. Shipping</h4>');
  assert.ok(itemPrices >= 0 && shipping > itemPrices, "item prices appear before shipping");
  assert.ok(pricingMath > itemPrices && pricingMath < shipping, "the pricing explanation stays with item prices, before shipping");
  assert.doesNotMatch(page, /<span>1\. Shipping<\/span>/);
  assert.doesNotMatch(page, /<h4>2\. Item prices<\/h4>/);
  assert.match(page, /<small className="profit-fee-note">All Etsy fees included<\/small>/);
  assert.match(page, /className="pricing-section-heading shipping-section-heading"/);
  assert.match(page, /<h4>2\. Shipping<\/h4>/);
  assert.match(css, /\.app-shell \.pricing-section-heading h4\{[\s\S]*font-size:26px!important/);
  assert.match(css, /\.app-shell \.item-pricing-section\{[\s\S]*border-radius:18px/);
  assert.match(css, /\.app-shell \.shipping-pricing-section\{[\s\S]*border-radius:18px/);
});

test("uses the Goldie palette while Printify drafts are being created", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(css, /\.app-shell \.batch-progress\{border-color:rgba\(139,89,137,\.28\)!important/);
  assert.match(css, /\.app-shell \.progress-ring\{background:conic-gradient\(#b777b0 0 25%,rgba\(224,195,241,\.62\) 25% 100%\)!important/);
  assert.match(css, /\.app-shell \.progress-track span\{background:linear-gradient\(90deg,#a765a0,#d992c5,#b6a8ff\)!important/);
  assert.match(css, /\.app-shell \.upload-notice\{border-color:rgba\(183,119,176,\.58\)!important/);
});

test("warns before continuing with designs below Printify's recommended pixels", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /const belowRecommendedPixels=useMemo/);
  assert.match(page, /setPixelWarningOpen\(true\)/);
  assert.match(page, /below Printify’s recommended pixel size/);
  assert.match(page, /One or more of these designs fall below Printify’s pixel size recommendations for this product\./);
  assert.match(page, /Proceed anyway/);
  assert.match(page, /className="pixel-comparison-head"[\s\S]*Uploaded size[\s\S]*Printify recommends/);
  assert.match(page, /belowRecommendedPixels\.map\(file=>/);
  assert.match(page, /recommendedPixelSize\.width\.toLocaleString\(\)/);
  assert.match(css, /\.app-shell \.pixel-warning-inline\{/);
  assert.match(css, /\.app-shell \.pixel-warning-modal \.pixel-proceed\{/);
  assert.match(css, /\.app-shell \.pixel-comparison-row\{display:grid;grid-template-columns:/);
});

test("gives Step 6 a cohesive titles, tags, and descriptions layout", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /Finish titles, tags, and descriptions/);
  assert.doesNotMatch(page, /Complete the listing words/);
  assert.match(page, /draftPreview=drafts\.find\(draft=>draft\.clientId===design\.id\)\?\.previewUrl\|\|design\.previewUrl/);
  assert.match(page, /className="listing-preview-button"/);
  assert.match(page, /<b>2\. Edit description<\/b>/);
  assert.match(page, /Build this title yourself from a keyword bank/);
  assert.match(page, /It does not verify that the keyword bank itself matches the design, and it will not reject mismatched phrases\./);
  assert.match(css, /\.app-shell \.finish-mode \.batch-limits,[\s\S]*display:none!important/);
  assert.match(css, /\.app-shell \.batch-description>summary b\{[^}]*font-size:18px!important/);
  assert.match(css, /\.app-shell \.design-line\{grid-template-columns:152px minmax\(0,1fr\) 138px/);
  assert.match(css, /\.app-shell \.quality-pill\.pass,\.app-shell \.quality-pill\.check\{[^}]*background:linear-gradient/);
  assert.match(css, /\.app-shell \.finish-mode \.listing-editor>\.workflow-next\{display:flex;width:min\(250px,100%\);margin:28px auto 2px/);
});

test("keeps required dialogs and selected controls inside the approved palette", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /Finish all sections first\./);
  assert.doesNotMatch(page, /listing words/i);
  assert.match(page, /className="publish-confirm blocking-modal"/);
  assert.match(css, /\.blocking-modal>\.publish-confirm-icon,\.blocking-modal>\.mini-label\{[^}]*text-align:center!important/);
  assert.match(css, /\.title-style-toggle button\.active\{[^}]*background:linear-gradient\(145deg,#6a3456,#4b283e\)!important/);
  assert.match(css, /\.new-recipe\.active,\.live-dpi\.check,\.batch-size-guide/);
});

test("centers autosave feedback beneath each workflow panel", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /<i aria-hidden="true">✓<\/i> Saved automatically/);
  assert.match(css, /\.workflow-footer-actions\{position:relative;[^}]*justify-content:flex-start/);
  assert.match(css, /\.autosave-note\{position:absolute;left:50%;[^}]*transform:translateX\(-50%\)/);
});

test("keeps Step 8 controls ordered, separated, and inside the warm Goldie palette", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(css, /Step 8 final lock/);
  assert.match(css, /\.app-shell \.draft-card>\.draft-mockups\{order:3\}/);
  assert.match(css, /\.app-shell \.draft-card>\.individual-size-guide\{order:4\}/);
  assert.match(css, /\.app-shell \.integrated-mockups \.generate-inline,[\s\S]*linear-gradient\(145deg,#6a3456,#4b283e\)!important/);
  assert.match(css, /\.app-shell \.inline-mockup-grid label\.selected\{[\s\S]*border-color:#b777b0!important/);
  assert.match(css, /\.app-shell \.post-draft-workspace>\.mockup-next\{[\s\S]*margin:34px auto 16px!important/);
  assert.match(css, /\.app-shell \.publish-live-warning\{[\s\S]*rgba\(239,211,237,\.66\)/);
  assert.match(page, /Recommended listing photo mix/);
  assert.match(css, /\.post-draft-heading \.open-all-button:after\{content:"Open all listings to review in Printify"/);
  assert.match(css, /\.integrated-mockups \.batch-mockup-button,[\s\S]*width:min\(100%,290px\)!important/);
  assert.match(css, /\.integrated-mockups \.generate-inline\{margin:16px 0 0!important\}/);
});

test("keeps supporting workflow copy readable and explains slower Etsy preparation", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /This can take a moment when your batch has several listings\. Keep this page open while Goldie prepares each one\./);
  assert.match(css, /\.app-shell \.etsy-preparing-note\{[\s\S]*font-size:12px/);
  assert.match(css, /\.app-shell \.variant-transfer-note small\{font-size:12px!important/);
  assert.match(css, /\.app-shell \.step-content small,[\s\S]*font-size:11\.5px!important/);
  assert.match(css, /\.app-shell \.etsy-detail-card label,[\s\S]*font-size:12px!important/);
});
