import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const listingFactoryPage = new URL("app/listing-factory-app.tsx", root);

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
  const page = await readFile(listingFactoryPage, "utf8");
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

test("keeps the Etsy details step clear and its icon locked to the optical center", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(page, /Review your Etsy listing details/);
  assert.match(page, /Goldie has pre-filled the Etsy category and every product field it could confidently match for each listing\. Look everything over and change any selection that does not fit\./);
  // Copy updated when the nine-step rail became five. The banner is now a
  // completion confirmation rather than a list of what the previous step did.
  assert.match(page, /<b>Titles, tags, and descriptions complete<\/b>/);
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
  const page = await readFile(listingFactoryPage, "utf8");
  assert.match(page, /useEffect\(\(\)=>\{window\.scrollTo\(\{top:0,behavior:"auto"\}\)\},\[workflowStep,finishPhase\]\)/);
});

test("the connect step swaps its copy on state and hides the timing note once connected", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  // C4: the heading covers both accounts, not just Printify.
  assert.match(page, /<h2>Connect your accounts<\/h2>/);
  // C2: "usually takes about 2 minutes" used to render underneath two already-
  // connected accounts. It must only appear when something is still unconnected.
  assert.match(page, /\{\(!connected\|\|!etsyConnected\)&&<p className="connect-timing">/);
  // C1: a returning seller sees a confirmation, not setup instructions.
  assert.match(page, /connected&&etsyConnected\?"Both connections are verified\./);
  assert.match(css, /\.connect-timing\{margin:0 auto 22px!important;[^}]*text-align:center\}/);
});

test("stacks the connected Etsy shop name for long shop names", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
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
  const page = await readFile(listingFactoryPage, "utf8");
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
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  const itemPrices = page.indexOf('<h4>1. Item prices <span>');
  const pricingMath = page.indexOf('className="pricing-math"');
  const shipping = page.indexOf('<h4>2. Etsy shipping profile');
  assert.ok(itemPrices >= 0 && shipping > itemPrices, "item prices appear before shipping");
  assert.ok(pricingMath > itemPrices && pricingMath < shipping, "the pricing explanation stays with item prices, before shipping");
  assert.doesNotMatch(page, /<span>1\. Shipping<\/span>/);
  assert.doesNotMatch(page, /<h4>2\. Item prices<\/h4>/);
  assert.match(page, /<small className="profit-fee-note">Shipping not included<\/small>/);
  assert.match(page, /className="pricing-section-heading shipping-section-heading"/);
  assert.match(page, /<h4>2\. Etsy shipping profile — what buyers pay <span>/);
  assert.match(css, /\.app-shell \.pricing-section-heading h4\{[\s\S]*font-size:26px!important/);
  assert.match(css, /\.app-shell \.item-pricing-section\{[\s\S]*border-radius:18px/);
  assert.match(css, /\.app-shell \.shipping-pricing-section\{[\s\S]*border-radius:18px/);
});

test("keeps later workflow footers usable and removes obsolete description language", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.match(page, /className="workflow-footer-actions post-draft-footer"/);
  assert.doesNotMatch(page, /unique introduction/);
  assert.match(css, /\.app-shell \.launch-panel\{position:relative!important;top:auto!important\}/);
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
    readFile(listingFactoryPage, "utf8"),
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
    readFile(listingFactoryPage, "utf8"),
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
    readFile(listingFactoryPage, "utf8"),
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
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /<i aria-hidden="true">✓<\/i> Saved automatically/);
  assert.match(css, /\.workflow-footer-actions\{position:relative;[^}]*justify-content:flex-start/);
  assert.match(css, /\.autosave-note\{position:absolute;left:50%;[^}]*transform:translateX\(-50%\)/);
});

test("keeps Step 8 controls ordered, separated, and inside the warm Goldie palette", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(css, /Step 8 final lock/);
  assert.match(css, /\.app-shell \.draft-card>\.draft-mockups\{order:3\}/);
  assert.match(css, /\.app-shell \.draft-card>\.individual-size-guide\{order:4\}/);
  assert.match(css, /\.app-shell \.integrated-mockups \.generate-inline,[\s\S]*linear-gradient\(145deg,#6a3456,#4b283e\)!important/);
  assert.match(css, /\.app-shell \.inline-mockup-grid label\.selected\{[\s\S]*border-color:#b777b0!important/);
  assert.match(css, /\.app-shell \.post-draft-workspace>\.mockup-next\{[\s\S]*margin:34px auto 16px!important/);
  assert.match(css, /\.app-shell \.publish-live-warning\{[\s\S]*rgba\(239,211,237,\.66\)/);
  assert.match(page, /Recommended photos for \{templateDetails\?\.blueprintTitle/);
  assert.match(css, /\.post-draft-heading \.open-all-button:after\{content:"Open all listings to review in Printify"/);
  assert.match(css, /\.integrated-mockups \.batch-mockup-button,[\s\S]*width:min\(100%,290px\)!important/);
  assert.match(css, /\.integrated-mockups \.generate-inline\{margin:16px 0 0!important\}/);
});

test("keeps supporting workflow copy readable and explains slower Etsy preparation", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);
  assert.match(page, /This can take a moment when your batch has several listings\. Keep this page open while Goldie prepares each one\./);
  assert.match(css, /\.app-shell \.etsy-preparing-note\{[\s\S]*font-size:12px/);
  assert.match(css, /\.app-shell \.variant-transfer-note small\{font-size:12px!important/);
  assert.match(css, /\.app-shell \.step-content small,[\s\S]*font-size:11\.5px!important/);
  assert.match(css, /\.app-shell \.etsy-detail-card label,[\s\S]*font-size:12px!important/);
});

test("the workflow column is sized against its container, never the viewport — D89", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* .steps-column, .launch-panel and .workflow-footer-actions all live inside
   * .app-shell, which is inset by a 288px sidebar. A vw unit measures the whole
   * viewport and knows nothing about that inset, so `min(720px,72vw)` made the
   * column wider than the box holding it: at 860px the page gained 23px of
   * horizontal scroll and the Back button sat off-screen. It also overflowed at
   * 1400px, four pixels at a time, which is why it went unnoticed.
   *
   * Percentages resolve against the container and are correct at every width. */
  assert.doesNotMatch(css, /\.(steps-column|launch-panel|workflow-footer-actions)[^{}]*\{[^}]*width:\s*min\([^)]*vw/,
    "A workflow column is sized in vw. Use a percentage — vw ignores the 288px sidebar inset and overflows the shell.");
  assert.doesNotMatch(css, /72vw/,
    "72vw was the specific value that overflowed .app-shell. It must not come back.");

  assert.match(css, /\.workflow-stage>\.steps-column,\.workflow-stage>\.launch-panel\{width:min\(720px,100%\)\}/);
});

test("the listing title field shows the whole title, not an ellipsis — D60", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);

  /* D60 was marked fixed while the field still truncated. Measured live on a
   * real batch: a 132-character title in a 570px input against 1032px of
   * content — 55% visible. The earlier fix only added text-overflow:ellipsis,
   * which makes truncation tidier, not readable.
   *
   * Reviewing the title is the entire purpose of this screen. */
  assert.match(page, /<textarea className="listing-title-field" rows=\{3\} value=\{design\.title\} maxLength=\{140\}/,
    "The title is a single-line input again. 140 characters cannot fit on one line at this width.");
  assert.match(css, /\.listing-title-field\{[\s\S]*white-space:pre-wrap!important/);
  assert.doesNotMatch(css, /\.listing-title-field\{[\s\S]*text-overflow:ellipsis/);
});

test("the wrapping title field owns the full row and grows to its content — D94 live follow-up",async()=>{
  const css=await readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8");
  assert.match(css,/\.listing-title-field\{[\s\S]*?grid-column:1\/-1!important;[\s\S]*?width:100%!important;/);
  assert.match(css,/field-sizing:content!important/);
  assert.match(css,/font-size:15px!important/);
});

test("the step rail is dark-on-light, matching its transparent background — D95", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const functional = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* approved-functional.css deliberately sets .workflow-progress to
   * background:transparent, but lilac-theme.css still carried the light text
   * colours written for the dark panel it replaced. Measured on the live page:
   *   "Titles + tags"     #fff9fc on #e9e7e4 -> 1.19:1
   *   "3 titles complete" #c2b2be on #e9e7e4 -> 1.64:1
   * Both need 4.5:1. The sub-labels were invisible — on the primary navigation
   * of the main workflow screen. */
  assert.match(functional, /\.workflow-progress\{[^}]*background:transparent/,
    "The rail background changed. If it is dark again, the dark-on-light text overrides below are wrong.");
  assert.match(clarity, /\.app-shell \.workflow-progress button b\{color:#2f1f2d!important/);
  assert.match(clarity, /\.app-shell \.workflow-progress button small\{[\s\S]*color:#635360!important/);
  assert.doesNotMatch(clarity, /\.app-shell \.workflow-progress button (b|small)\{color:#f{3,}/i,
    "Rail text is near-white again over a transparent background.");
});

test("the tags field shows all 13 tags, not 5 — D96", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
  ]);

  /* D79 raised tags from 4-7 to a full 13, which is correct. But 13 phrases is
   * 238 characters, and they were still going into the same 570px single-line
   * input — 1521px of content, 37% visible, 5 of 13 tags readable.
   *
   * The field did not change; what it had to hold tripled. Identical shape to
   * D60/D94, one field further down the same card. Measured live before the
   * fix: 37%. After: 238 chars in 81px with zero overflow. */
  assert.match(page, /<textarea className="listing-tags-field" rows=\{3\} value=\{design\.tags\.join\(", "\)\}/,
    "Tags are a single-line input again. 13 tags is 238 characters and will not fit.");
  assert.match(css, /\.listing-tags-field\{[\s\S]*white-space:pre-wrap!important/);
  assert.doesNotMatch(css, /\.listing-tags-field\{[\s\S]*text-overflow:ellipsis/);
});

test("listing and mockup images are lazy-loaded — D97", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Measured on the Images + mockups phase of a real 3-design batch: 477
   * rendered <img> tags, exactly one of them lazy. 159 images per listing, so
   * the 20-design batch limit projects to roughly 3,180 images loading eagerly
   * on a single page.
   *
   * 92% of them (441 of 477) sit outside the viewport on load. */
  const eagerImg = /<img src=\{(src|item\.src|design\.previewUrl|file\.previewUrl|draftPreview)\}(?![^>]*loading="lazy")/;
  assert.doesNotMatch(page, eagerImg,
    "A repeated listing/mockup image is loading eagerly. On a 20-design batch that is thousands of simultaneous requests.");
  assert.ok((page.match(/loading="lazy" decoding="async"/g) || []).length >= 5,
    "Expected every repeated image in the listing flow to be lazy-loaded.");
});

test("the publish list shows full titles — D98", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* Final review is the last screen before listings go live on Etsy. Measured
   * live: titles clipped to a single nowrap line, 295px visible against up to
   * 781px of content — 38-41% readable. You cannot confirm what you cannot
   * read. Fourth instance of the same shape: D60, D94, D96, D98. */
  assert.match(css, /\.app-shell \.final-listing-card>div:not\(\.final-listing-links\)>b\{[^}]*white-space:normal!important/);
  assert.doesNotMatch(css, /\.app-shell \.final-listing-card>div:not\(\.final-listing-links\)>b\{[^}]*white-space:nowrap/,
    "Publish-list titles are clipped to one line again.");
});

test("seller-authored names wrap instead of inheriting the title truncation pattern — D99 sweep", async () => {
  const [page,css,mockupCss]=await Promise.all([
    readFile(listingFactoryPage,"utf8"),
    readFile(new URL("app/approved-functional.css",root),"utf8"),
    readFile(new URL("app/mockups/mockups.css",root),"utf8"),
  ]);
  assert.doesNotMatch(css,/design-fields>label:nth-of-type\(1\) input\{[^}]*text-overflow:ellipsis/);
  assert.match(css,/\.app-shell \.draft-row b,[\s\S]*white-space:normal!important/);
  assert.match(css,/\.app-shell \.final-design-group>summary span/);
  assert.match(css,/post-draft-heading>div:before/);
  assert.match(mockupCss,/\.collectionToggle h3\{white-space:normal;overflow:visible;text-overflow:clip/);
  assert.match(page,/profile\.title\.replace\(\/\\\.\{2,\}\$\/,"…"\)/,
    "Shipping profile display names can regress to the literal two-dot truncation from Etsy.");
});

test("the title and tags textareas span their label's full width — D100", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* `.design-fields input{width:100%}` matches input only. When the tags field
   * became a textarea (D96) it fell out of that rule and auto-placed into the
   * 139px column of its two-column label — 138px wide against 219px of content,
   * 32% visible, worse than the 37% D96 set out to fix.
   *
   * Any future input->textarea swap in this grid needs the same treatment. */
  assert.match(css, /textarea\.listing-tags-field,[\s\S]*textarea\.listing-title-field\{[\s\S]*grid-column:1\/-1!important;[\s\S]*width:100%!important/,
    "The listing textareas must span the label grid and take its full width.");
});

test("unfinished setup items are not formatted as settled values — D101", async () => {
  const [page, clarity] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/clarity-pass.css", root), "utf8"),
  ]);

  /* The summary read "$10 profit · Standard shipping · Choose a keyword bank ·
   * description from Printify · Etsy details 5 saved" — four settled values and
   * one to-do, identical formatting, buried in the middle. Missing the keyword
   * bank is what makes title generation fail two steps later, so it is the one
   * item that must not read as done. Logged as P2 in AUDIT-PASS-2 and unfixed
   * until the full run surfaced it again. */
  assert.doesNotMatch(page, /activeRecipe\?\.keywordListId\?"Keyword bank saved":"Choose a keyword bank"/,
    "The keyword-bank to-do is back inline with the settled values.");
  assert.match(page, /className="setup-todo"/,
    "Outstanding setup items must render separately from the settled summary.");
  /* A dedicated 720x66 alert already sits 169px below this summary carrying the
   * full instruction. The summary must not repeat that sentence — it only has
   * to stop listing an unfinished item as though it were settled. */
  assert.match(page, /still to set/);
  assert.doesNotMatch(page, /setup-todo">\{\[\.\.\.\(!activeRecipe\?\.keywordListId\?\["Pick a keyword bank/,
    "The summary is repeating the instruction the alert below it already gives.");
  assert.match(clarity, /\.setup-todo\{[\s\S]*color:#8a3f66!important/);
});

test("the setup step has exactly one forward control, and it gates every section — D107", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Reported by Brittany after a full day of testing, which is the worst way to
   * find it. Choose a saved product, upload designs, press the button that
   * appears — and you land past Colours and Mockups without ever seeing them.
   *
   * Measured on the live build. Uploading designs spawned a SECOND, enabled
   * forward control inside the designs block:
   *   "Review this batch →"                  enabled,  top 1548
   *   "Colours"  heading                                top 1725
   *   "Mockups"  heading                                top 2464
   *   "Pick a keyword bank to continue →"    disabled, top 3164
   *
   * The correct control is the bottom one — `.setup-forward` gates on
   * selectedColorIds AND autoTitleBankId AND mockupTheme and names whichever is
   * missing. The designs-block button calls continueFromDesigns and bypasses
   * all three. It was correct when Designs was its own step; embedding the
   * designs block above Colours on the setup screen turned it into a trap.
   *
   * RULE: a step may present one forward control, positioned after every
   * section it depends on. */
  assert.match(page, /\{workflowStep!=="setup"&&<button className="workflow-next" disabled=\{!designsFinished\} onClick=\{continueFromDesigns\}>/,
    "The designs-block forward button renders on the setup step again, above Colours and Mockups.");
  // the real gate must keep naming what is missing
  assert.match(page, /!selectedColorIds\.length\?"Choose product colors to continue":!autoTitleBankId\?"Pick a keyword bank to continue"/);
});

test("a saved later step cannot overwrite an explicit safe return to setup — D108",async()=>{
  const page=await readFile(listingFactoryPage,"utf8");
  assert.match(page,/function restoredWorkflowStep\(saved:WorkflowStep,requested:string\|null,complete:boolean\)/);
  assert.match(page,/complete\|\|order\.indexOf\(target\)<=order\.indexOf\(saved\)\?target:saved/,
    "Backward navigation must respect the requested URL while unfinished batches still cannot deep-link forward past gates.");
  assert.match(page,/restoredWorkflowStep\(payload\.batch\.step\|\|"connect",url\.searchParams\.get\("step"\),Boolean\(state\.complete\)\)/);
  assert.doesNotMatch(page,/const step=payload\.batch\.step\|\|"connect";setWorkflowStep\(step\)/);
});

test("the mockup section can actually be changed and cleared — D109", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Brittany: "there's four mockups saved to the saved product, and it says
   * change these anytime, but there's no option to remove the mockups or
   * change them anywhere."
   *
   * Measured on the live setup step: the section renders 4 thumbnails, "+6
   * more", the copy "From your last batch — change it anytime", and exactly one
   * control — a <select> whose only entries were "Loading mockup sets…" (a
   * placeholder that never went away) and the single saved set. No clear
   * option, no way to reach the Mockup Library. The promise was unactionable.
   *
   * A control that claims something can be changed must offer a way to change
   * it, including back to none. */
  assert.match(page, /\{themes\.length\?<option value="">No mockups for this batch<\/option>:<option value="">Loading mockup sets…<\/option>\}/,
    "The loading placeholder must become a real 'no mockups' choice once sets have loaded.");
  assert.match(page, /className="manage-mockup-sets" href="\/mockups"/,
    "The mockup section must offer a route to create or edit sets.");
});

test("a cleared mockup selection stays cleared — D110", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* D109 relabelled the empty option to "No mockups for this batch". Testing it
   * by operating the control rather than reading it showed the label alone was
   * not enough: an effect re-selected the saved set the instant the value went
   * empty. Measured live — setting the mockup select to "" reverted to
   * "BACH TEES" within 4s, while the identical change on the keyword-bank
   * select stuck.
   *
   * Two things had to change: seed the default only once, and stop gating the
   * forward control on mockupTheme, since choosing "no mockups" otherwise
   * disabled the only way forward. */
  assert.match(page, /if\(seededDefault\.current\|\|value\|\|!themes\.length\)return;seededDefault\.current=true;/,
    "The mockup default must seed once, not re-apply whenever the value is empty.");
  assert.doesNotMatch(page, /disabled=\{!complete&&\(!selectedColorIds\.length\|\|!autoTitleBankId\|\|!mockupTheme\)\}/,
    "Mockups are optional; gating the forward control on them makes 'no mockups' unreachable.");
});

test("the Etsy details summary does not invent work on optional-only fields — D112", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Measured live on a Gildan tee: all 11 Etsy attribute fields are OPTIONAL —
   * `required` is false on every one — yet the summary read "5 of 11 set".
   * A completion fraction over a set with nothing to complete reads as 45%
   * done. Across a 20-listing batch that manufactures 120 chores that do not
   * exist, on the screen whose whole promise is doing less work.
   *
   * When a category genuinely has required attributes, count those. When it has
   * none, say what was added and that the rest are optional. */
  assert.match(page, /required\.length\?`\$\{requiredDone\.length\} of \$\{required\.length\} required set`:`\$\{completed\.length\} added · all optional`/,
    "The summary must count required fields, or state that the rest are optional.");
  assert.doesNotMatch(page, /<small>\{completed\.length\} of \{properties\.length\} set/,
    "Counting every optional attribute as outstanding work is the D112 defect.");
});

test("Etsy shipping profile names are decoded, not shown as raw entities — D116", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Measured live on the shipping-profile dropdown: two options rendered as
   * "Kid&#39;s Hero Tee 1598202917". Etsy returns these titles HTML-escaped and
   * they were printed straight into an <option>, so the seller reads the raw
   * entity instead of an apostrophe. */
  assert.match(page, /function decodeProfileTitle\(title:string\)\{/);
  assert.match(page, /<option key=\{profile\.id\} value=\{profile\.id\}>\{decodeProfileTitle\(profile\.title\)\}<\/option>/,
    "Profile options must decode the title before rendering.");
  assert.match(page, /function friendlyShippingProfileTitle\(raw\?:string\)\{const title=raw\?decodeProfileTitle\(raw\):raw;/);
});

test("the Colours section explains that sizes come from Printify — D123", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Verified live: the setup step has 43 colour toggles and NO size control
   * anywhere in the Listing Factory. Sizes are inherited from the Printify
   * product and first become visible on the Pricing step as cost groups
   * (16 variants at $9.79, 4 at $11.64 for 2XL).
   *
   * That is a deliberate design — the Printify product is the source of truth —
   * but a seller who can change colours here will reasonably expect to change
   * sizes here too, and nothing said where to go instead. */
  assert.match(page, /className="sizes-note">Sizes come from your Printify product and apply to every listing\./,
    "The Colours section must say where sizes are controlled.");
});

test("shipping profiles are product-aware, searchable, and never hard-filtered — D117", async () => {
  const [page,styles]=await Promise.all([
    readFile(listingFactoryPage,"utf8"),
    readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/profiles\.length>20&&<input className="shipping-profile-search"/,
    "Large profile libraries need search where the seller chooses shipping.");
  assert.match(page,/Currently attached to this product/);
  assert.match(page,/Recommended for \$\{productName\}/);
  assert.match(page,/Other apparel profiles/);
  assert.match(page,/All other shipping profiles/,
    "Non-matching profiles must remain reachable; classification cannot silently hide a money-affecting option.");
  assert.match(page,/shippingProfileOptionLabel\(profile\)/,
    "Options must expose first-item and additional-item buyer charges.");
  assert.match(page,/selectedProfileNeedsReview&&<div className="shipping-profile-family-warning"/);
  assert.match(styles,/\.app-shell \.shipping-profile-search\{/);
});

test("the product step stays usable after a product is chosen — D122/D119/D120", async () => {
  const [tools, page, functional, clarity] = await Promise.all([
    readFile(new URL("app/factory-tools.tsx", root), "utf8"),
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/approved-functional.css", root), "utf8"),
    readFile(new URL("app/clarity-pass.css", root), "utf8"),
  ]);

  /* D122 — adding a saved product auto-selects it, and selecting a product hid
   * the bundle block entirely, so the seller had no route to a bundle except
   * unselecting the product they had just added. It is a collapsed <details>;
   * it can stay. */
  assert.match(functional, /\.app-shell\[data-product-selected="true"\] \.bundle-library\{display:block!important\}/,
    "Selecting a product must not remove the bundle option.");

  /* D119 — the connected Printify product already knows what it is. */
  assert.match(page, /suggestedProductName=\{templateDetails\?\[templateDetails\.brand,templateDetails\.model\]/);
  assert.match(tools, /if\(nameTouched\.current\|\|editingId\|\|!props\.suggestedProductName\)return;/,
    "The suggested name must never overwrite something the seller typed.");

  /* D120 — the arrow wrapped onto its own line inside the product tiles. */
  assert.match(clarity, /\.app-shell \.recipe-tile \.recipe-use em\{[\s\S]*white-space:nowrap/);
});

test("one help bubble per screen unless the subject is genuinely different — D121", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Connect showed TWO "?" bubbles side by side — one on the step headline and
   * one on the card beneath it — both explaining how to connect, with different
   * text in each. Brittany: "all of the information on both is important, but
   * why is it in two separate ideas?"
   *
   * The page-level bubble (WORKFLOW_HELP) is the screen's help. A card-level
   * bubble is only justified when it covers a genuinely separate subject —
   * Pricing keeps two because item pricing and buyer-paid shipping are
   * different topics with different consequences. */
  assert.doesNotMatch(page, /<ContextHelp label="Explain account connections"/,
    "Connect must not carry a second help bubble duplicating the step help.");
  assert.match(page, /\{heading:"Use matching accounts"/,
    "The unique guidance from the removed bubble must survive in the step help.");
  assert.match(page, /\{heading:"Your publishing safeguard"/);
  assert.equal((page.match(/<ContextHelp label="/g) || []).length, 2,
    "Only the two Pricing bubbles should remain as card-level help.");
});

test("a new saved product does not inherit another product's setup — D122/D124", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* D122 — the mockup seed fell back to `themes[0]`, so a brand-new product
   * silently adopted whichever set happened to be first in the library. Saving
   * a crew neck produced a card already wearing the tee's "BACH TEES" mockups,
   * captioned "From your last batch" for a product that has never had a batch.
   * A product may only adopt the set IT saved. */
  assert.match(page, /seededDefault\.current=true;if\(savedValue&&themes\.includes\(savedValue\)\)onChange\(savedValue\)/,
    "A product must never inherit the first mockup set in the library.");
  assert.doesNotMatch(page, /onChange\(savedValue&&themes\.includes\(savedValue\)\?savedValue:themes\[0\]\)/);
  assert.match(page, /themes\.length\?"No mockup set chosen for this product yet\."/,
    "A product with no saved set must say so, not claim a previous batch.");

  /* D124 — the Etsy fee profile is an account-level pricing input. Pricing
   * already shows it beside the profit figures it affects; the product step had
   * a second copy sitting under Mockups, unrelated to anything around it. */
  assert.doesNotMatch(page, /fee-profile-product-summary/,
    "The fee profile belongs on Pricing, not on the product step.");
  assert.match(page, /className="fee-profile-summary"/);
});

test("the 'Saved for this product' block is one grouped section — D126", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Reported wholesale: a nested purple frame, brown warning text, fields in no
   * order, and status text that reads like buttons. One problem — the block had
   * no hierarchy and no grouping.
   *
   * Verified live after the fix: background transparent, no shadow, the
   * outstanding chip is plum rgb(138,63,102) not brown #8a5a12, and the visual
   * order top-to-bottom is Profit goal, Shipping profile, Keyword bank, Product
   * description, Etsy details, Product connection — money together, listing
   * content together, plumbing last. */
  assert.match(clarity, /\.app-shell \.everything-else\{[\s\S]*background:transparent!important/,
    "The block must not render as a card inside a card.");
  assert.match(clarity, /\.setup-todo\{[\s\S]*color:#8a3f66!important/,
    "The outstanding-item colour must be the app's plum, not #8a5a12 mud.");
  assert.doesNotMatch(clarity, /\.setup-todo\{[\s\S]*color:#8a5a12/);
  assert.match(clarity, /everything-else-body>\*:nth-child\(3\)\{order:2\}/,
    "Shipping must sit with Profit goal, not after the keyword bank.");
  assert.match(clarity, /:has\(\.setup-todo\) span:after\{content:none!important\}/,
    "'Usually no changes needed' must not sit under an outstanding-item warning.");
});

test("a product with no saved defaults is framed as first-time setup — D125", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Saving a new product auto-selects it and landed on the returning-product
   * view: "Saved for this product", "From your last batch — change any", for a
   * product that has never had a batch. */
  assert.match(page, /const productFirstRun=Boolean\(activeRecipe\)&&!activeBundle/);
  assert.match(page, /productFirstRun\?`Set up \$\{activeRecipe\?\.name\|\|"this product"\}`:"Saved for this product"/,
    "A first-run product must be framed as setup, not as saved settings.");
  assert.match(page, /productFirstRun\?"Choose the colours you want to offer/,
    "Colour copy must not claim a previous batch on a first run.");
});
