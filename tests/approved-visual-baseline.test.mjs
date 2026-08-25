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
  /* D284 · The page title already reads "Connect your accounts"; this card
     repeated it word for word directly beneath, the same defect as the Colors
     panel (D236) and the Product card (D257). The step still names itself —
     that is the page title's job. */
  assert.match(page, /title: "Connect your accounts"/);
  assert.doesNotMatch(page, /<h2>Connect your accounts<\/h2>/,
    "the card must not restate the page title");
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
  /* D224 · This panel moved onto the Images page, where its only job is creating
     drafts, so the icon is no longer conditional on a pricing step that no longer
     exists — it was rendering a calculator on a page about drafts. */
  assert.match(page, /launch-step-icon create-drafts-icon/);
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
  assert.match(page, /setFinishPhase\(index===8\?"final":"details"\)/);
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
  /* D374 · The "1." and "2." prefixes only render when both sections are shown
     together; as card panels each is opened on its own, so they are gone from
     that path. Anchor on the section headings, which are stable. */
  const itemPrices = page.indexOf('item-pricing-heading');
  /* D303 · The "See how Goldie calculated these prices" expander is gone. The ✓
     line at the top of the card already states the calculation, and saying it
     twice on one card is what this was. The FEE FIGURES it contained are a
     control, not an explanation, so they stayed — and they still have to sit
     with item prices, before shipping. */
  const feeSummary = page.indexOf('className="fee-profile-summary"');
  const shipping = page.indexOf('shipping-section-heading');
  assert.ok(itemPrices >= 0 && shipping > itemPrices, "item prices appear before shipping");
  assert.ok(feeSummary > itemPrices && feeSummary < shipping, "the fee figures stay with item prices, before shipping");
  assert.doesNotMatch(page, /See how Goldie calculated these prices/,
    "the card must not explain the calculation a second time");
  assert.doesNotMatch(page, /<span>1\. Shipping<\/span>/);
  assert.doesNotMatch(page, /<h4>2\. Item prices<\/h4>/);
  assert.match(page, /<small className="profit-fee-note">Shipping not included<\/small>/);
  assert.match(page, /className="pricing-section-heading shipping-section-heading"/);
  assert.match(page, /\{section==="all"\?"2\. ":""\}Etsy shipping profile/);
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
  /* D509 - the same table now serves a bundle, where a design can be undersized
     for some products and not others, so the rows are built once from whichever
     source applies and both still carry the recommended size. */
  assert.match(page, /belowRecommendedPixels\.map\(file=>\(\{id:file\.id/);
  assert.match(page, /needWidth:recommendedPixelSize\.width,needHeight:recommendedPixelSize\.height/);
  assert.match(page, /bundleQualityIssues\.map\(issue=>\(\{id:issue\.key/);
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
  /* Order reversed in D148: the Printify preview is a white garment on white,
   * cropped to 54px, so every listing in a batch rendered as the same blank
   * square. The artwork identifies the listing; the garment does not.
   * D541 - the per-listing table this belonged to is gone; the same preference
   * now picks the thumbnail on every task row. */
  assert.match(page, /const thumb=design\.previewUrl\|\|drafts\.find\(draft=>draft\.clientId===design\.id\)\?\.previewUrl/);
  /* D541 - step 3 was one block: an always-open title builder, a collapsible
   * description and an always-open table of every listing, numbered 1, 2, 3.
   * Her rows were bookmarks into it, so opening Description showed titles and
   * tags too. Three tasks, three panels, and the numbering goes with the block. */
  assert.doesNotMatch(page, /<b>2\. Edit description<\/b>/);
  assert.doesNotMatch(page, /className="design-table"/);
  assert.match(page, /Build this title yourself from a keyword bank/);
  assert.match(page, /It does not verify that the keyword bank itself matches the design, and it will not reject mismatched phrases\./);
  assert.match(css, /\.app-shell \.finish-mode \.batch-limits,[\s\S]*display:none!important/);
  assert.match(css, /\.app-shell \.quality-pill\.pass,\.app-shell \.quality-pill\.check\{[^}]*background:linear-gradient/);
  /* D375 · was width:min(250px,100%) — a small centred pill on this step while
     the same button was a full-width bar on steps 1 and 2. */
  assert.match(css, /\.app-shell \.finish-mode \.listing-editor>\.workflow-next\{display:flex;width:100%;margin:28px auto 2px/);
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
  /* D151: this label used to be a CSS ::after over font-size:0 DOM text.
   * It now lives in the TSX, so assert it there and assert the hack is gone. */
  assert.doesNotMatch(css, /\.open-all-button:after/,
    "The open-all button must not be relabelled in CSS.");
  const appSource = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  assert.match(appSource, /Review all listings in Printify/);
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
  /* Lazy-loading is right for the Printify photo picker (477 images, 92%
   * off-screen). It is WRONG for the product-step mockup grid: only ~10 images,
   * all in view, and lazy-loading made them paint blank and fill in late while
   * the seller scrolled. Scope it to the big grids. See D138. */
  const eagerImg = /<img src=\{(src|design\.previewUrl|file\.previewUrl|draftPreview)\}(?![^>]*loading="lazy")/;
  assert.doesNotMatch(page, eagerImg,
    "A repeated listing image is loading eagerly. On a 20-design batch that is thousands of simultaneous requests.");
  assert.ok((page.match(/loading="lazy" decoding="async"/g) || []).length >= 4,
    "The large repeated grids must stay lazy-loaded.");
  assert.match(page, /<img src=\{item\.src\} alt=\{`Scene \$\{index \+ 1\}`\}\/>|<img src=\{item\.src\} alt=\{`Scene \$\{index\+1\}`\}\/>/,
    "The ~10 product-step mockups must load eagerly - they are all on screen.");
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
  const page = await readFile(listingFactoryPage, "utf8");

  /* D101 guarded a summary line that read "$10 profit · Standard shipping ·
   * Choose a keyword bank · description from Printify · Etsy details 5 saved" —
   * four settled values and one to-do in identical formatting. That line lived
   * in the "<product> settings" block, which D232 deleted: every setting in it
   * now lives on the page that owns it, each with its own state.
   *
   * The rule it protected still holds — an unanswered facet must never be
   * formatted like a settled one — and is enforced by the readiness states
   * themselves, covered in tests/product-readiness.test.mjs. */
  assert.doesNotMatch(page, /className="everything-else"/, "the mixed summary block is gone");
  assert.doesNotMatch(page, /activeRecipe\?\.keywordListId\?"Keyword bank saved":"Choose a keyword bank"/);
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
  /* D399 · Also requires `complete`: while the drafts do not exist the step's one
     action is "Continue to create drafts" in the product card, and this button
     only scrolled down to it. */
  assert.match(page, /\{workflowStep!=="setup"&&complete&&<button className="workflow-next" disabled=\{!designsFinished\} onClick=\{continueFromDesigns\}>/,
    "The designs-block forward button renders on the setup step again, above Colours and Mockups.");
  // the real gate must keep naming what is missing
  /* D383 · The forward button used to relabel itself with whatever was missing
     ("Pick a keyword bank for Gildan Hoodie", "Choose product colors to
     continue"). It says "Next step" on every step now; the gate dialog names
     each unfinished item when you press it. What still has to hold is the
     ENFORCEMENT, which is what these assert. */
  assert.match(page, /disabled=\{!complete&&Boolean\(productStepBlocker\(\)\)\}/,
    "colours and sizes still gate the forward button, when the product has them");
  assert.match(page, /Next step <span>→<\/span>/);
});

test("a saved later step cannot overwrite an explicit safe return to setup — D108",async()=>{
  const page=await readFile(listingFactoryPage,"utf8");
  assert.match(page,/function restoredWorkflowStep\(saved:WorkflowStep,requested:string\|null,complete:boolean\)/);
  assert.match(page,/complete\|\|order\.indexOf\(target\)<=order\.indexOf\(saved\)\?target:saved/,
    "Backward navigation must respect the requested URL while unfinished batches still cannot deep-link forward past gates.");
  /* D379 · restoreBatchById takes the requested step as a parameter now, because
     opening a product card loads a batch without a page navigation. Same rule. */
  assert.match(page,/restoredWorkflowStep\(payload\.batch\.step\|\|"connect",requestedStep,Boolean\(state\.complete\)\)/);
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
  assert.match(page, /loaded\?"No compatible mockup sets for this product":"Loading mockup sets…"/,
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
  assert.match(page, /if\(!productName\|\|seededDefault\.current\|\|!templates\.length\)return;seededDefault\.current=true;/,
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
  /* D209 moved the shipping select into the readiness card, where options are
     built by shippingProfileOptionLabel. The decode requirement is unchanged —
     it just lives one function along, and now carries the price too. */
  assert.match(page, /function shippingProfileOptionLabel\(profile:EtsyShippingProfile\)\{return`\$\{decodeProfileTitle\(profile\.title\)\}/,
    "Profile options must decode the title before rendering.");
  assert.match(page, /<option key=\{profile\.id\} value=\{profile\.id\}>\{shippingProfileOptionLabel\(profile\)\}<\/option>/);
  assert.match(page, /function friendlyShippingProfileTitle\(raw\?:string\)\{const title=raw\?decodeProfileTitle\(raw\):raw;/);
});

test("sizes are chosen in Goldie, not just inherited from Printify — D123, superseded by D164", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* D123 measured that the setup step had 43 colour toggles and NO size control,
   * and settled for a note pointing sellers at Printify. That note's own
   * rationale was: "a seller who can change colours here will reasonably expect
   * to change sizes here too". D164 does the real thing instead — sizes are a
   * selectable axis with a per-product default, so the note is now false and
   * must not come back. */
  assert.doesNotMatch(page, /Sizes come from your Printify product/,
    "That note is obsolete: sizes are chosen here now.");
  assert.match(page, /<p className="mini-label">SIZES FOR THIS BATCH<\/p>/,
    "The setup step must offer sizes beside colours.");
  assert.match(page, /Save these as this product’s default sizes/,
    "Sizes must be savable per product, exactly like colours.");
});

test("shipping profiles are product-aware, searchable, and never hard-filtered — D117", async () => {
  const [page,styles]=await Promise.all([
    readFile(listingFactoryPage,"utf8"),
    readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),
  ]);
  /* D319 · Search used to be an input ABOVE a native <select>, shown only past
     20 profiles. It filtered the <option> list, which is invisible while the
     dropdown is closed — so typing appeared to do nothing and connect to
     nothing. The search now lives INSIDE the open list, above the options it
     filters, and is always present rather than appearing at a threshold. */
  assert.match(page,/className="shipping-combobox-search"/,
    "search must sit inside the open list, above the options it filters");
  assert.match(page,/role="listbox"/);
  assert.doesNotMatch(page,/profiles\.length>20&&<input/,
    "search is not gated behind a profile count any more");
  assert.match(page,/Currently attached to this product/);
  assert.match(page,/Recommended for \$\{productName\}/);
  assert.match(page,/Other apparel profiles/);
  assert.match(page,/All other shipping profiles/,
    "Non-matching profiles must remain reachable; classification cannot silently hide a money-affecting option.");
  assert.match(page,/shippingProfileOptionLabel\(profile\)/,
    "Options must expose first-item and additional-item buyer charges.");
  assert.match(page,/selectedProfileNeedsReview&&<div className="shipping-profile-family-warning"/);
  assert.match(styles,/\.app-shell \.shipping-combobox-search\{/);
  assert.match(styles,/\.app-shell \.shipping-combobox-panel\{/,
    "the list needs a panel to render into, above the page");
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
  assert.match(page, /if\(!value&&savedValue&&themes\.includes\(savedValue\)\)/,
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
  const page = await readFile(listingFactoryPage, "utf8");

  /* D126 grouped the "Saved for this product" disclosure and stopped "Usually no
   * changes needed" sitting under an outstanding-item warning. D232 deleted that
   * block outright — every setting in it moved to the page that owns it — so
   * there is no longer a grouped block to police, and the dismissive subtitle is
   * gone with it. */
  assert.doesNotMatch(page, /className="everything-else"/);
  assert.doesNotMatch(page, /Usually no changes needed/);
});

test("a product with no saved defaults is framed as first-time setup — D125", async () => {
  const page = await readFile(listingFactoryPage, "utf8");

  /* Saving a new product auto-selects it and used to land on the returning-product
   * view: "Saved for this product", "From your last batch", for a product that had
   * never had a batch. Readiness replaced that copy switch, and D232 removed the
   * settings block this test tracked through three renamings. */
  /* D513 - first run is a fact about the product, not about how it was opened, so
     a bundle member being set up for the first time is framed that way too. And
     it is finally passed to the component that asks for it; before, this value
     was computed and read by nobody. */
  assert.match(page, /const productFirstRun=Boolean\(activeRecipe\)\n\s*&&!activeRecipe\?\.defaultColorIds/);
  assert.match(page, /<MockupSetSelector firstRun=\{productFirstRun\}/);
  assert.doesNotMatch(page, /className="everything-else"/);
  assert.match(page, /Choose the colors you want to offer/); /* D191: US spelling */
});

test("new products require completed setup and saved products own exact mockup scenes — D125/D123", async () => {
  const [page,tools,api,finish] = await Promise.all([
    readFile(listingFactoryPage,"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(tools,/setupComplete=editingId\?existing\?\.setupComplete!==false:false/);
  /* D457 · The button is gone: a product saves its own defaults as they are
     chosen, because the first setup IS the default and every later change is the
     new one. Readiness reads the saved recipe, so until it saved, a new product
     stayed stuck on "Pick a shipping profile" after one had been picked. */
  assert.doesNotMatch(page,/Save these as \$\{activeRecipe\.name\}’s defaults/);
  assert.match(page, /setupComplete:true,\s*defaultColorIds:selectedColorIds/,
    "the defaults are written without being asked for");
  assert.match(api,/mockupIds:Array\.isArray\(saved\.mockupIds\)/);
  assert.match(page,/className="product-mockup-scenes"/);
  assert.match(page,/Click any scene to remove or re-add it/);
  assert.match(finish,/goldie-batch-mockups/);
});

test("the colour selector never reads parent-only first-run state — D131", async () => {
  const page=await readFile(listingFactoryPage,"utf8");
  const selector=page.slice(page.indexOf("function ProductColorSelector"),page.indexOf("function MockupSetSelector"));
  assert.match(selector,/const productFirstRun=false/,
    "ProductColorSelector must define every value it reads instead of crashing after product selection.");
});

test("saved mockup scenes must match the selected garment — D132", async () => {
  const page=await readFile(listingFactoryPage,"utf8");
  /* D543 - the rule moved to app/mockup-compatibility.ts, because this copy and
     the one in integrated-mockups.tsx had drifted apart and only one was fixed.
     tests/mockup-compatibility.test.mjs holds the behaviour. */
  assert.match(page,/import \{ productAcceptsMockup \} from "\.\/mockup-compatibility"/);
  assert.match(page,/compatibleTemplates=templates\.filter\(item=>productAcceptsMockup\(item\.surfaceKind,productName\)\)/);
  assert.match(page,/if\(value&&!themes\.includes\(value\)\)\{onChange\("",\[\]\);return\}/,
    "A tee-only saved set must be cleared from a crewneck batch instead of displayed as valid.");
  assert.match(page,/matchingTemplates\.slice\(0,8\)\.map\(item=>item\.id\)/,
    "Legacy whole-set preferences must resolve to visible scene selections.");
});

test("in-card buttons are one system and fit their column — D130", async () => {
  const [clarity, tools] = await Promise.all([
    readFile(new URL("app/clarity-pass.css", root), "utf8"),
    readFile(new URL("app/factory-tools.tsx", root), "utf8"),
  ]);

  /* Measured on the live product step:
   *   outside a card (.workflow-restart-button)  10px / 650 · 34px tall
   *   inside  a card (.recipe-use em)            10px / 850 · 25px tall
   * The in-card primary was smaller, 200 weight heavier and tighter, which is
   * why it read as dense and unformatted.
   *
   * Two traps found while fixing it, both verified in the browser:
   *  - the quiet buttons use font-size:0 with a ::after label, so setting any
   *    font-size on them un-hides the original text ("Rename / reconnectRename")
   *  - the pill lives in a 117px column, so "Choose this product →" cannot fit
   *    at any sane size — the label had to shorten, not the type */
  assert.match(clarity, /:is\(\.recipe-use,\.bundle-use\) em\{[\s\S]*font-weight:700!important/);
  assert.doesNotMatch(clarity, /:is\(\.edit-recipe,\.change-product,\.add-product-button\)\{[^}]*font-size/,
    "Never set font-size on the font-size:0 buttons — it duplicates their label.");
  assert.match(tools, /"Choose →"/,
    "The tile CTA must fit its column without clipping.");
  assert.doesNotMatch(tools, /"Choose this product →"/);
});

test("status chips are visually distinct from buttons — D139", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Measured on the live product step:
   *   .saved-settings-summary span (status)  white · 1px border · 999px · 750
   *   .edit-recipe                (button)   white · 1px border · 999px · 650
   * Identical boxes, so "$10 profit" and "Description ready" read as controls.
   *
   * Rule: a control is white with a border and a pill radius. A status is
   * tinted, borderless, softer, and squarer. Nothing unclickable gets a
   * button's box. */
  assert.match(clarity, /\.app-shell \.saved-settings-summary span\{[\s\S]*border:0!important/);
  assert.match(clarity, /\.app-shell \.saved-settings-summary span\{[\s\S]*cursor:default!important/);
  assert.doesNotMatch(clarity, /\.app-shell \.saved-settings-summary span\{[^}]*border-radius:999px/,
    "Status must not borrow the pill radius that marks a control.");
});

test("the publish checklist is one column and warns in warning colours — D141", async () => {
  const [page, clarity] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    readFile(new URL("app/clarity-pass.css", root), "utf8"),
  ]);

  /* Measured on Publish: `.final-checklist` is a single 642px column of five
   * ticks, then `.final-safety-readiness` is a separate 316px+316px grid with
   * the last two — five full-width rows followed by two half-width ones.
   *
   * And "! Etsy details and personalization still need review" rendered in the
   * same colour as every tick (rgb(99,67,94), transparent). On the last screen
   * before listings go live, a warning must not look like a tick. */
  /* D439 · The separate readiness grid is gone; those two items are now rows in
     .final-checklist, so they inherit its column and colours. */
  assert.doesNotMatch(clarity.replace(/\/\*[\s\S]*?\*\//g, ""), /\.final-safety-readiness/,
    "The readiness row must match the checklist's single column.");
  assert.match(page, /className=\{allCreatedListingsHaveImages\(selectedPublishDrafts\(\)\)\?"":"content-review"\}/,
    "Readiness items must carry a state class so a warning can be coloured.");
  assert.match(clarity, /\.final-checklist>span\.content-review\{[\s\S]{0,240}color:#7c3350!important/,
    "Readiness items must carry a state class so a warning can be coloured.");
});

test("tile CTAs size to their label, not the column — D143", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* D130 set the CTA to width:100%, which was only needed for the long
   * "Choose this product →" label in a 117px column. D130 also shortened that
   * label. The side effect: choosing a product collapses the grid to one 642px
   * column, so every CTA stretched to 553px and the two products the seller did
   * NOT choose became the loudest elements on screen, while her actual
   * selection rendered as a pale full-width bar that reads as disabled. */
  assert.match(clarity, /:is\(\.recipe-use,\.bundle-use\) em\{[\s\S]*width:fit-content!important/,
    "The CTA must size to its label so it cannot dominate the post-selection layout.");
  /* Careful: "max-width:100%" contains "width:100%". Anchor on the property
   * start so the guard checks the real declaration, not a substring. */
  assert.doesNotMatch(clarity, /:is\(\.recipe-use,\.bundle-use\) em\{[^}]*[;{]\s*width:100%!important/,
    "The CTA must not stretch to its column again.");
});

test("the chosen-product confirmation sits with the products, not inside the bundles — D144", async () => {
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  /* Seen while scrolling the real page: the order ran
   *   saved products → SAVED PRODUCT BUNDLE list → "PRODUCT SELECTED" summary
   *   → "Want one batch to cover several products?" prompt → designs
   * so the confirmation of the product you just chose was wedged between the
   * two halves of the bundle section. Bundle content either side of an
   * unrelated confirmation is the D12 "sandwiched mid-flow" complaint again. */
/* D365 · The summary is wrapped so the "choose a different bundle" link can sit
     under it, attached to the card it changes. Its POSITION is what this test is
     about and that is unchanged. */
  const summary = tools.indexOf('{activeId&&<div className="selected-summary-block">');
  /* D169 also gates both bundle blocks on a bundle not already being the
   * selection, so match on the stable part of each. Ordering is what matters. */
  const bundles = tools.indexOf('<div className="recipe-library-head bundle-card-heading"');
  const bundleLibrary = tools.indexOf('<details className="bundle-library"');
  assert.ok(summary > 0 && bundles > 0 && bundleLibrary > 0);
  assert.ok(summary < bundles,
    "The chosen-product confirmation must render before the bundle list, not between the bundle list and the bundle prompt.");
  assert.ok(bundles < bundleLibrary);
});

test("the mockup scene grid spans its block — D145", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* D138 set the scene grid to auto-fill minmax(132px,1fr) and it still rendered
   * two columns. The rule was applied; the container was the problem —
   * .batch-default-block.mockup-default-block is a 340px/290px grid, and the
   * scene grid auto-placed into the 340px column while the right half of the
   * card sat empty and the "8 of 8 selected" caption floated beside the tiles
   * instead of under them.
   *
   * Measured after: grid 340px -> 644px, two columns -> four, caption below. */
  /* D179 made the block a single column, so spanning is moot for the caption —
   * but the rule stays as the guarantee that neither is stranded in a side column. */
  assert.match(clarity, /\.app-shell \.mockup-default-block>small\{grid-column:1\/-1!important\}/,
    "The scene caption must never be stranded in a side column.");
  assert.match(clarity, /\.app-shell \.product-mockup-scenes/,
    "The scene grid keeps its full-width rule.");
});

test("nothing in the app relies on smooth scrolling — D146", async () => {
  const files = ["listing-factory-app.tsx", "support-chat.tsx", "factory-tools.tsx"];
  for (const file of files) {
    const source = await readFile(new URL(`app/${file}`, root), "utf8");
    /* Measured on BOTH surfaces, not assumed:
     *   /keywords (.management-page)  scrollTo({behavior:"smooth"}) -> 0
     *   /listing-factory (.app-shell) scrollTo({behavior:"smooth"}) -> 0
     *   both, without `behavior`                                   -> 1200
     * Smooth scrolling never fires anywhere in this app, so every call using it
     * is a silent no-op with no error and no console output. */
    assert.doesNotMatch(source, /behavior:\s*"smooth"/,
      `${file} uses smooth scrolling, which never fires in this app. Scroll instantly.`);
  }
});

test("the 13th tag chip cannot escape its row and hit the button below — D149", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* .draft-card-top .tag-row is deliberately a scroller: max-height 82px, a
   * painted scrollbar thumb, scrollbar-gutter:stable. A later, broader rule
   * (.app-shell .draft-card .tag-row) added overflow:visible!important to stop
   * chips being clipped horizontally, and took the vertical scroll down with it.
   *
   * Measured on a 13-tag listing at 1440 wide, before:
   *   row clientHeight 80, scrollHeight 118, computed overflow-y "visible"
   *   chip "mermaid bachelorette" 269-301, .edit-draft-button top 280
   *   -> the chip painted on top of the button.
   * After: computed overflow-y "scroll", row bottom 264, button top 280,
   * 16px gap, chip clipped (elementFromPoint returns the card, not the chip)
   * and reachable by scrolling the row. */
  const broadRule = approved.match(/^\.app-shell \.draft-card \.tag-row\{.*$/m);
  assert.ok(broadRule, "The .draft-card .tag-row rule should still exist.");
  assert.doesNotMatch(broadRule[0], /overflow(-y)?:\s*visible/,
    "This rule must not re-enable vertical overflow — the tag row is a scroller.");

  assert.match(approved, /\.app-shell \.draft-card-top \.tag-row\{[^}]*overflow-y:scroll/,
    "The tag row must keep its scroller so overflowing chips stay inside it.");
});

test("no button is relabelled by CSS over hidden DOM text — D150/D151/D152", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* The app had six buttons whose visible label came from `font-size:0` on the
   * element plus a `::after{content:"..."}`. Measured consequences:
   *   - .draft-mockups>summary lost its ▶ disclosure marker (font-size:0 collapses
   *     ::marker), so it read as inert text next to "▶ Choose Printify flatlays".
   *   - .open-all-button carried TWO stacked ::after relabels (lines 246 and 1468).
   *   - .recipe-card .edit-recipe{content:"Rename"} also matched the BUNDLE card's
   *     "Edit bundle" button. Proven by injecting that exact button into the live
   *     .unified-bundle-grid: computed font-size 0px, ::after "Rename".
   *   - the accessible name, find-in-page and any text assertion all read the
   *     hidden DOM text, never the label on screen.
   * Real labels now live in the TSX. */
  assert.doesNotMatch(approved, /font-size:0!important/,
    "Relabelling a button via font-size:0 + ::after hides the real DOM text. Put the label in the TSX.");
});

test("the Printify placement button is readable — D150", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");
  const theme = await readFile(new URL("app/theme.css", root), "utf8");

  /* theme.css:24 is the original gold-era rule: .edit-draft-button{...font-size:9px}.
   * The lilac re-theme recoloured the button but never resized it, so the main
   * "Open in Printify to resize or reposition" action rendered at 9px with an
   * 8.5px sub-line, against a 16px baseline for every other button on the page. */
  assert.match(theme, /\.edit-draft-button\{[^}]*font-size:9px/,
    "Guard assumes the stale 9px rule is still in theme.css; update this test if it moved.");
  assert.match(approved, /\.app-shell \.edit-draft-button\{[^}]*font-size:12\.5px!important/,
    "The placement button must override theme.css's 9px with a readable size.");
});

test("the publish checklist's needs-review chip is plum, not gold — D153", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");

  /* Brittany rejected this brown once already ("why is keyword bank still to set
   * brown?"). D101/D126 replaced it with plum #8a3f66 — but only on
   * .everything-else summary .setup-todo. The publish checklist kept a full
   * gold-era chip: border #dfbd7f, background #fff5dd, text #7a5010, plus
   * .final-listing-card .content-review at #8a5a12 — sitting directly beside the
   * plum "✓" chips from .final-checklist span. Same defect, second surface.
   * .content-review is live markup: every unmet item on Review + publish
   * ("! One or more titles need review") renders with it. */
  for (const gold of ["#8a5a12", "#7a5010", "#dfbd7f", "#fff5dd"]) {
    assert.ok(!approved.includes(gold),
      `${gold} is a gold-era colour and reads as mud on the lavender cards.`);
  }
  assert.match(approved, /\.app-shell \.final-checklist \.content-review\{[^}]*color:#8a3f66!important/,
    "The needs-review chip must use the app's plum 'needs attention' colour.");
});

test("the Publish screen uses one success language, not three — D155/D156", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Measured on the Publish phase, all three listings ready:
   *   .final-checklist span        left-aligned 11px/400, plum #63435e   (5 rows)
   *   .final-safety-readiness .ready CENTRED 12px/750                     (2 rows)
   *   .step-success-banner         green text #245d3b, ✓ circle #3f9a63
   *   em.ready / .ready            green #286340 on #e7f5ea, #34704c
   * Nine "everything is fine" lines, three visual systems, one screen.
   *
   * DESIGN_SYSTEM.md's frozen palette contains no green, and reserves the
   * signature gradient for "completion moments" — so the banner tick now uses the
   * same gradient as the rail's completed step. */
  assert.doesNotMatch(approved, /#245d3b|#3f9a63|#47745a/,
    "The success banner must not use the old green palette.");
  assert.match(approved, /\.app-shell \.step-success-banner>span\{[^}]*background:linear-gradient\(145deg,#e8b7e1,#c990d0\)/,
    "The banner tick must use the app's completion gradient.");
  assert.match(clarity, /\.app-shell \.ready\{color:#63435e!important\}/,
    "Ready chips must use the plum, not green.");
  assert.doesNotMatch(clarity.replace(/\/\*[\s\S]*?\*\//g, ""), /\.final-safety-readiness/,
    "Readiness rows must match the checklist rows they sit under.");
});

test("the sidebar sits in the same place on every management page — D159", async () => {
  const css = await readFile(new URL("app/management-aesthetic.css", root), "utf8");

  /* Measured, first nav link ("Listing Factory") top edge at 1440x812:
   *   /keywords 146   /mockups 146   /batches 218   /usage 218
   * a 72px jump in the sidebar as you move between pages in the same nav.
   * Cause: `:is(.management-page,.usage-page)>.management-nav a:first-of-type
   * {margin-top:72px}` set it for all four, and a later !important reset put it
   * back to 0 for `.keyword-page` and `.mockupFactory.managementOnly` only —
   * Batch History and Usage were never covered. Removed the stray rule (line 16
   * already sets 0) and the two now-redundant resets.
   * Verified: /usage moved 218 -> 146, matching the other two. */
  assert.doesNotMatch(css, /a:first-of-type\{margin-top:72px\}/,
    "The 72px nav offset only ever applied to two of the four management pages.");
  assert.doesNotMatch(css, /\.mockupFactory\.managementOnly\)\.management-page>\.management-nav a:first-of-type\{margin-top:0!important\}/,
    "The per-page reset is redundant once the stray offset is gone.");
});

test("keyword phrases are readable — D158", async () => {
  const globals = await readFile(new URL("app/globals.css", root), "utf8");
  const management = await readFile(new URL("app/management-aesthetic.css", root), "utf8");

  /* The phrase chips ARE the content of the Keyword Banks page, and they rendered
   * at 9px — measured on all 17 chips of "JANE AUSTEN TEE". Source is the gold-era
   * globals.css rule (background #eee5d5, a tan); management-aesthetic.css
   * recoloured it to plum but never resized it — the same miss as D150. */
  assert.match(globals, /\.bank-grid article span\{[^}]*font-size:9px/,
    "Guard assumes the stale 9px rule is still in globals.css; update if it moved.");
  assert.match(management, /\.bank-grid article span\{[^}]*font-size:11px\}/,
    "The lilac layer must resize these chips, not just recolour them.");
});

test("an unloaded Printify thumbnail looks pending, not missing — D161", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Measured on a 148-photo product, opening "Choose Printify flatlays":
   *   117 thumbnail requests, ~1.97MB, median 508ms, slowest 994ms
   *   sources are 1200x1200; tiles render at 88x88 css px
   *   1.2s after opening: 16 tiles in view, 0 painted
   * .printify-photo-expand and its img were both transparent, so every unloaded
   * tile was a blank white square with a lone checkbox. Same remedy as D148. */
  assert.match(clarity, /\.app-shell \.printify-photo-expand\{[^}]*background:linear-gradient/,
    "The photo tile needs a pending background so it never reads as empty.");
});

test("saved-product tiles line up regardless of name length — D162", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  /* Measured with three saved products, one of whose names wraps to two lines.
   * All three tiles were 215px tall and started at y=473, but inside them:
   *   .recipe-use  top 480 / 480 / 474   height 138 / 138 / 162
   *   Edit row     top 643 / 643 / 649
   * The taller button overflowed its 161.5px grid row upward by 12px, so the
   * Choose buttons and Edit/Delete rows each sat at two different heights.
   * After: .recipe-use 474/474/474, Choose pill 589/589/589, Edit 649/649/649. */
  /* D190 replaced the 1fr pin: tiles stretch to the tallest in their row, so on a
   * shorter tile the 1fr row consumed the full height and pushed the footer 36px
   * below the card. Auto rows size to content and stay inside. */
  assert.match(clarity, /\.app-shell \.recipe-tile\{grid-template-rows:auto auto!important;align-content:start!important\}/);
  assert.match(clarity, /\.app-shell \.recipe-use\{height:auto!important\}/);
  /* D166 replaced the two-line reservation: it aligned the rows but left a 24px
   * hole under one-line names. Wider tiles (250px min instead of 170px) give the
   * name column 226px instead of 117px, so names fit on one line and there is no
   * hole to reserve. The full name stays reachable via title={recipe.name}. */
  /* D170: 250px tiles fixed the wrapping but cost density — with many saved
   * products that is a wall of large cards. Room comes from the icon and type
   * instead: 26px icon, 13px name, tile 215px tall -> 163px, 3 per row. */
  assert.match(clarity, /\.app-shell \.recipe-grid\{grid-template-columns:repeat\(auto-fill,minmax\(184px,1fr\)\)!important/,
    "Tiles must stay compact so a long product list does not become a wall of cards.");
  assert.match(clarity, /\.app-shell \.recipe-copy>b:first-child\{[^}]*text-overflow:ellipsis/,
    "A name too long for one line truncates rather than reflowing the card.");

  /* The name is clamped to two lines, so the full name must stay reachable. */
  assert.match(tools, /className="recipe-use" title=\{recipe\.name\}/);
  assert.match(tools, /className="recipe-use" title=\{bundle\.name\}/);
});

test("small text meets AA against the surface it is painted on — D163", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Measured by compositing each text node over its real painted background.
   * Eight styles failed AA for their size (3.00-4.24:1); worst was
   * .delete-recipe at 3.00 — an enabled control that read as disabled.
   * The sidebar's pink rgb(232,177,200) cannot carry the app ink at AA below
   * ~0.95 alpha (at 0.80 it tops out at 4.43), hence the near-opaque tokens.
   * After: 0 of 8 failing. */
  assert.match(clarity, /\.app-shell \.recipe-card \.delete-recipe\{color:rgba\(74,42,62,\.72\)!important\}/);
  assert.match(clarity, /\.app-shell \.hero-step-count\{color:rgba\(74,42,62,\.9\)!important\}/);
  assert.match(clarity, /\.app-shell \.etsy-api-disclosure\{color:rgba\(74,42,62,\.95\)!important\}/);
});

test("management pages meet AA too — D165", async () => {
  const management = await readFile(new URL("app/management-aesthetic.css", root), "utf8");
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* D163 fixed the workflow shell. Sweeping the four management pages with the
   * same compositing method found two more, measured against their painted beds:
   *   .mini-label   #744d69  3.84:1  — the eyebrow on EVERY management page
   *                                    ("BATCH HISTORY", "YOUR LIBRARY", ...)
   *   shared secondary text  .78     4.24:1 at 12px
   * and four on Usage + Plan, which is the billing screen and so the worst place
   * in the app for unreadable text:
   *   h3 small "/month" beside $29/$59/$99   3.28:1
   *   .usage-plan-fineprint (what a credit is) 4.19:1
   *   .usage-plan-heading>p:last-child         4.42:1
   * Measured after: /batches 0 failing. */
  assert.match(management, /color:#653f5c!important/,
    "The management eyebrow must clear AA on the pink page gradient (#744d69 was 3.84:1).");
  assert.doesNotMatch(management, /color:rgba\(74,42,62,\.78\)!important/,
    "The shared secondary-text token was 4.24:1 at 12px.");
  assert.match(clarity, /\.usage-page h3 small,?\s*\n?\.usage-page h3 small\{color:rgba\(74,42,62,\.8\)!important\}|\.usage-page h3 small\{color:rgba\(74,42,62,\.8\)!important\}/,
    "The price cadence next to the plan prices must be readable.");
  assert.match(clarity, /\.usage-page \.usage-plan-fineprint\{color:rgba\(74,42,62,\.82\)!important\}/);
});

test("every section of the setup column shares one edge — D172", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Eleven ordered sections, only some carrying width:min(980px,100% - 32px),
   * and the nested ones applying it twice against an already-inset parent.
   * Measured on the deployed build with a bundle selected, width@left:
   *   recipe-card 720@504, product-setup-framing 720@504,
   *   color-default-block 688@520, bundle-color-selectors 688@520,
   *   mockup-default-block 688@520, everything-else 688@520,
   *   saved-settings-summary 688@520, keyword-bank-required 720@504
   * so the cards sat 16px inside the heading above and the button below.
   * After: all ten measure 720@504. */
  assert.match(clarity, /\.app-shell \.steps-column\.setup-column > \*,[\s\S]*?\.app-shell \.steps-column\.setup-column \.batch-preferences-after-designs > \*,[\s\S]*?width:100%!important/,
    "Nested setup sections must not re-apply the column inset.");
});

test("selecting a product does not blow the product list up — D173", async () => {
  const approved = await readFile(new URL("app/approved-functional.css", root), "utf8");
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* approved-functional.css collapses the grid to one full-width column whenever
   * data-product-selected="true". The attribute selector outranks the plain class
   * rule, so the compact grid was discarded exactly when the seller is most
   * likely to be scanning the list.
   * Measured: tile 207px -> 642px wide, ~158px tall. Twelve saved products would
   * be ~1,900px of stacked full-width cards. */
  assert.match(approved, /\.app-shell\[data-product-selected="true"\] \.recipe-grid\{grid-template-columns:1fr!important\}/,
    "Guard assumes the collapsing rule still exists; update this test if it is removed.");
  assert.match(clarity, /\.app-shell\[data-product-selected="true"\] \.recipe-grid\{\s*grid-template-columns:repeat\(auto-fill,minmax\(184px,1fr\)\)!important;?\s*\}/,
    "The compact grid must survive selection.");
});

test("the bundle banner uses the app's heading face — D174", async () => {
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* It read "You are working on Gildan Hoodie" as an 18px Manrope <b>, wrapping
   * to two lines, immediately above section headings set in Fraunces. The phrase
   * also repeated the eyebrow directly above it ("PRODUCT BUNDLE · PRODUCT 1 OF 2"). */
  assert.doesNotMatch(app, /You are working on/,
    "The eyebrow already says which product of the bundle this is.");
  assert.match(clarity, /\.app-shell \.bundle-progress>div b\{[^}]*"Fraunces"/,
    "The banner heading must use the same face as every other heading on the page.");
});

test("the mockup card has no dead column — D179", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* .mockup-default-block is grid-template-columns: minmax(0,1fr) minmax(210px,290px).
   * With no mockup set saved, the right column contains only the 17px
   * "Create or edit mockup sets" link — ~290px of empty space through the middle
   * of the card, reported five times.
   *
   * It stayed broken because the fix was verified by injecting CSS into the live
   * page and never written to the stylesheet. Measured after, in source:
   * one 676px column. */
  assert.match(clarity, /\.app-shell \.mockup-default-block\{grid-template-columns:minmax\(0,1fr\)!important\}/,
    "One column, so nothing is stranded when there is no mockup set.");
});

test("a selected product tile does not clip its own actions — D186", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* The tile is a rigid 4-column grid with overflow:hidden. A selected tile gains
   * a third action ("Change product"), and 102+46+37px plus gaps exceeds the 207px
   * card, so "Delete" was cut at the edge. Measured on the deployed build twice:
   * the first fix was verified by injecting CSS into the page and never written
   * here — the same way the mockup dead column survived five reports. */
  /* The wrapping-flex attempt made it worse — one button per row, tile 163px ->
   * 296px. The grid was nearly right; the label was too long. */
  assert.match(clarity, /\.app-shell \.recipe-grid \.recipe-tile\{overflow:visible!important\}/);
  assert.match(clarity, /\.app-shell \.recipe-card \.change-product:after\{content:"Change"/);
  assert.doesNotMatch(clarity, /\.recipe-grid \.recipe-tile\{[^}]*flex-wrap:wrap/,
    "Flex made each action take its own row.");
});

test("keyword bank cards keep Delete quiet and end their row on one line — D195/D431", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* D195 measured two banks of 17 and 50 phrases: both cards 406px, with 77px of
   * dead space above "Edit bank" in the shorter one. Delete also rendered at
   * 16px — larger than the phrase chips — so the destructive action was the
   * loudest element on the card.
   *
   * D431 · align-items:start fixed the dead space by letting each card size to
   * its own content, but that put the row's Edit buttons on three different
   * lines (measured live: 640, 609, 688), which she reported. Both goals hold at
   * once by stretching the cards and pushing the button to the bottom, so the
   * slack lands below the content instead of above the action. */
  assert.match(clarity, /\.keyword-page \.bank-grid\{align-items:stretch!important\}/);
  assert.match(clarity, /\.keyword-page \.bank-grid>article>button:last-child\{margin-top:auto!important\}/);
  assert.match(clarity, /\.keyword-page \.bank-grid article button:not\(\.bank-keyword-toggle\)\{font-size:11px!important\}/);
});

test("D197: product tiles pad their actions and drop the meaningless Printify initial", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  // Padding moved off the tile and onto the children, so Edit/Delete stop
  // sitting flush against the frame (measured 0px padding, delete right:10).
  assert.match(css, /\.app-shell \.recipe-grid \.recipe-tile\{[^}]*padding:0!important/);
  assert.match(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile>button:not\(\.recipe-use\):last-child\{margin-right:12px!important\}/,
    "the last action keeps a right margin off the tile edge",
  );
  assert.match(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile>button:not\(\.recipe-use\)\{margin-bottom:12px!important\}/,
    "the action row keeps a bottom margin off the tile edge",
  );

  // The primary button spans the tile via width, not negative margins — those
  // measured 181px inside a 207px tile and left the hairline stopping short.
  assert.match(css, /\.app-shell \.recipe-grid \.recipe-tile>\.recipe-use\{[^}]*width:100%!important/);
  assert.doesNotMatch(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile>\.recipe-use\{[^}]*margin:0 -12px/,
    "no negative-margin bleed on the primary button",
  );

  // "P" on every product card is Printify's initial and identical across all of
  // them; "3" on a bundle tile is the member count and stays.
  assert.match(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile:not\(\.bundle-as-product\) \.recipe-icon\{display:none!important\}/,
    "product tiles hide the icon",
  );
  assert.doesNotMatch(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile \.recipe-icon\{display:none/,
    "the bundle tile keeps its member-count badge",
  );
});

test("D198: the card CTA spans the tile and the subtitle says something real", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  // The pill measured 81px in a 205px card while the whole card was clickable.
  assert.match(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile \.recipe-copy em\{[^}]*width:100%!important/,
    "the Choose CTA spans the card instead of leaving 111px of dead space",
  );

  // A real summary can run long; one line keeps tiles the same height.
  assert.match(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile \.recipe-copy small\{[^}]*text-overflow:ellipsis!important/,
    "the subtitle is clamped so tiles cannot go ragged",
  );

  // "Printify product connected" was true of every saved product by definition.
  // Strip comments first — the D198 note in the source quotes the old string.
  const code = tools.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /"Printify product connected"/, "the dead subtitle string is gone");
  assert.match(tools, /export function recipeSummary\(recipe: Recipe\): string/);
  assert.match(tools, /return parts\.length \? parts\.join\(" \\u00b7 "\) : "No details saved yet"/);
  assert.match(tools, /<small>\{selecting\?"Loading product details…":recipeSummary\(recipe\)\}<\/small>/);
});

test("D198: recipeSummary reports saved detail and is honest when there is none", async () => {
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");
  const body = tools.slice(tools.indexOf("export function recipeSummary"));
  const source = body.slice(0, body.indexOf("\n}") + 2)
    .replace("export function recipeSummary(recipe: Recipe): string", "function recipeSummary(recipe)")
    .replace(/: string\[\]/g, "");
  const recipeSummary = new Function(`${source}; return recipeSummary;`)();

  assert.equal(recipeSummary({}), "No details saved yet");
  assert.equal(recipeSummary({ defaultColorIds: [], defaultSizeIds: [] }), "No details saved yet");
  /* D272 · A half-configured recipe must say so. Zero colours used to drop the
     word entirely, so a tee with sizes but no saved colours read exactly like a
     product that has no colour choices at all. */
  assert.equal(recipeSummary({ defaultColorIds: [1] }), "1 color · sizes not set");
  assert.equal(recipeSummary({ defaultSizeIds: [1, 2, 3, 4, 5] }), "colors not set · 5 sizes");
  assert.equal(recipeSummary({ defaultColorIds: [1, 2], defaultSizeIds: [3, 4, 5] }), "2 colors · 3 sizes");
  // The mockup theme is deliberately excluded: this screen cannot verify that a
  // set fits the product, and asserting an incompatible one contradicts the
  // wizard on the very next screen.
  assert.equal(
    recipeSummary({ defaultColorIds: [1], defaultMockupTheme: "BACH TEES", keywordListId: "k1" }),
    "1 color · sizes not set · keyword bank",
  );
  assert.equal(recipeSummary({ defaultMockupTheme: "BACH TEES" }), "No details saved yet");
});

test("D202: the art placeholder joins the plum palette and drops the 7px label", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const theme = await readFile(new URL("app/theme.css", root), "utf8");

  // theme.css still carries the legacy rule; clarity-pass.css loads last and wins.
  assert.match(theme, /\.product-thumb\{[^}]*background:#f3ead7/, "the legacy rule is what we are overriding");
  assert.match(css, /\.app-shell \.product-thumb\{[^}]*background:rgba\(255,255,255,\.55\)!important/);
  assert.match(css, /\.app-shell \.product-thumb\{[^}]*color:#654362!important/);
  assert.doesNotMatch(css, /\.app-shell \.product-thumb\{[^}]*font-size:7px/);
  assert.match(css, /\.app-shell \.product-thumb\{[^}]*font-size:8px!important/);
});

test("D202: the product summary states the choices, not Printify's word for them", async () => {
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const code = app.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /selected variants/, "'variants' is internal vocabulary");


  /* The arithmetic itself moved to the D204 test below, which covers the
     axis-aware signature. What this test still guards is that Printify's
     internal word for a variant never reaches the seller. */
  assert.match(app, /function variantSummary\(axes:\{colorsChosen:boolean/);
});

test("D203: one nav renders both sidebars, so icons cannot go missing on half the app", async () => {
  const icons = await readFile(new URL("app/nav-icons.tsx", root), "utf8");
  const management = await readFile(new URL("app/management-nav.tsx", root), "utf8");
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");

  /* Batch History, Keyword Banks, Mockup Library and Usage render
     ManagementNav, which had bare text links, while the workflow rendered its
     own .top-nav with icons. Same five destinations, two components. */
  for (const key of ["listingFactory", "batches", "keywords", "mockups", "usage", "operations"]) {
    assert.match(icons, new RegExp(`case "${key}":`), `${key} has a shared icon`);
  }
  assert.match(management, /import \{ NavIcon \} from "\.\/nav-icons"/);
  assert.match(management, /<NavIcon name="listingFactory"\/>Listing Factory/);
  assert.match(management, /<NavIcon name=\{link\.key\}\/>\{link\.label\}/);

  // The workflow nav renders from the same source rather than inline markup.
  const navBlock = app.slice(app.indexOf('<nav className="top-nav"'), app.indexOf("</nav>", app.indexOf('<nav className="top-nav"')));
  assert.doesNotMatch(navBlock, /<svg/, "no inline icon markup left to drift");
  assert.equal((navBlock.match(/<NavIcon /g) || []).length, 5);
});

test("D203: cross-screen alignment and destructive-action faults are fixed", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const batches = await readFile(new URL("app/batches/page.tsx", root), "utf8");

  // Back pinned to the top of a centred 64px footer row on every workflow step.
  assert.match(css, /\.workflow-footer-actions>\.workflow-back\{align-self:center!important\}/);
  // The "?" beside every step heading hung 5px low on a hardcoded margin.
  assert.match(css, /\.heading-with-help>\.context-help-trigger\{margin:0!important/);
  // Permanent delete was 9px underlined text 14px under the primary button.
  assert.match(css, /\.remove-batch\{[^}]*font-size:11px!important/);
  assert.match(css, /\.remove-batch\{[^}]*margin-top:14px!important/);
  // Legacy warm brown at 9px, 2.8:1.
  assert.match(css, /\.individual-size-guide small\{color:#654362!important;font-size:10\.5px!important\}/);

  // A batch's first initial is not information — "0 las vegas..." rendered "0".
  assert.doesNotMatch(batches, /display_name\.slice\(0,1\)\.toUpperCase\(\)/, "no initial-as-thumbnail");
  assert.match(batches, /batch-history-thumbnail empty" aria-hidden="true"><svg/, "a neutral no-photo glyph instead");
});

test("D204: the product line never reports template defaults as the seller's choices", async () => {
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");

  // The line asks the same readiness the facet rows do.
  assert.match(app, /function summaryAxes\(product:TemplateDetails,recipe:Recipe\|null\)/);
  assert.match(app, /const readiness=readinessFor\(product,recipe\);/);
  assert.match(app, /colorsChosen:!asked\.has\("colors"\)/);
  assert.match(app, /sizesChosen:!asked\.has\("sizes"\)/);
  assert.match(app, /variantSummary\(summaryAxes\(templateDetails,activeRecipe\)\)/);
  assert.doesNotMatch(
    app,
    /variantSummary\(selectedColorIds\.length,selectedSizeIds\.length/,
    "the line no longer reads raw selection state",
  );

  const body = app.slice(app.indexOf("function variantSummary("));
  const source = body.slice(0, body.indexOf("\n}") + 2)
    .replace(/:\{[^}]*\}/, "")
    .replace(/:string\[\]/g, "").replace(/\(n:number,word:string\)/, "(n,word)");
  const variantSummary = new Function(`${source}; return variantSummary;`)();

  const base = { colors: 4, sizes: 6, availableColors: 25, availableSizes: 8, total: 200 };

  // Established product: report the choices, which multiply out.
  assert.equal(
    variantSummary({ ...base, colorsChosen: true, sizesChosen: true }),
    "4 colors × 6 sizes",
  );

  // The live hoodie: nothing chosen. It must describe the product, not claim
  // "4 colors × 6 sizes" while the rows below say "Pick colors".
  assert.equal(
    variantSummary({ ...base, colorsChosen: false, sizesChosen: false }),
    "25 colors available · 8 sizes available",
  );

  // Mixed: each axis reported honestly on its own terms.
  assert.equal(
    variantSummary({ ...base, colorsChosen: true, sizesChosen: false }),
    "4 colors · 8 sizes available",
  );
  assert.equal(
    variantSummary({ ...base, colorsChosen: false, sizesChosen: true }),
    "25 colors available · 6 sizes",
  );

  // One-size, no-colour products still fall back to a plain count.
  assert.equal(
    variantSummary({ colors: 0, sizes: 0, availableColors: 0, availableSizes: 0, total: 1, colorsChosen: true, sizesChosen: true }),
    "1 option",
  );
  assert.equal(
    variantSummary({ colors: 1, sizes: 0, availableColors: 1, availableSizes: 0, total: 1, colorsChosen: true, sizesChosen: true }),
    "1 color",
  );
});

test("D204: the suggestion button names what it will set", async () => {
  /* D388 · The suggestion button is gone at her direction - Printify's template
     is not a choice the seller made. Tombstoned so it is not reintroduced. */
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Use Printify&rsquo;s \{suggestion\}/);

});

test("D205: establishing a facet refreshes the saved-product tiles", async () => {
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  /* Live: picking 4 colors and 8 sizes on the hoodie persisted correctly — the
     API returned defaultColorIds of length 4 and defaultSizeIds of length 8 —
     while its card above still read "No details saved yet". The data was right
     and the screen contradicted it, because SavedWorkflow fetches the recipe
     list once on mount and establish() never told it anything had changed. */
  assert.match(app, /const \[savedRevision,setSavedRevision\]=useState\(0\);/);
  assert.match(app, /setSavedRevision\(current=>current\+1\);/, "establish bumps the revision");
  /* D523 added bundleChosen ahead of it; what matters is that the revision is
     still handed to the same component. */
  assert.match(app, /<SavedWorkflow [\s\S]{0,160}?savedRevision=\{savedRevision\}/, "and passes it down");

  // The bump must land inside establish(), after the write.
  const establish = app.slice(app.indexOf("async function establish("));
  const body = establish.slice(0, establish.indexOf("\n  }") + 4);
  assert.match(body, /api\/product-recipes[\s\S]*setSavedRevision/, "bump comes after the POST");

  assert.match(tools, /savedRevision\?: number;/);
  assert.match(tools, /\}, \[props\.savedRevision\]\);/, "the child reloads when it changes");
  // Must not refetch on the first render — reload() already runs on mount.
  assert.match(tools, /if \(firstRevision\.current\) \{ firstRevision\.current = false; return; \}/);
});

test("D208: the reset control is sized like a control, not a footnote", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");

  /* The reset existed all along and was reported as missing. Measured at 10px
     against 14.5px nav links — the smallest text in the sidebar. */
  assert.match(css, /\.app-shell \.workflow-restart-button\{[^}]*font-size:13px!important/);
  assert.match(css, /\.app-shell \.workflow-restart-button\{[^}]*min-height:40px!important/);

  // Both entry points must stay wired.
  assert.match(app, /className="workflow-restart-button"[^>]*onClick=\{startOver\}/);
  assert.match(app, /function startOver\(\)/);
  assert.match(app, /Discard this batch \+ start new/);
});

test("D212: adding a product can be cancelled, the same as editing one", async () => {
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  /* Cancel was gated on editingId, which is empty when adding. "Add another
     product" therefore opened a form whose only control was "Save product",
     disabled until the form validated. Escapable only by clicking a saved
     product, which nothing announced. */
  assert.match(tools, /\{editing&&<button type="button" className="secondary-action"/);
  assert.doesNotMatch(tools, /\{editingId&&<button type="button" className="secondary-action"/);
  // Cancel must clear what the form was holding, including the keyword choice.
  assert.match(tools, /setEditing\(false\);setEditingId\(""\);setName\(""\);setKeywordListId\(""\);setMessage\(""\)\}\}>Cancel<\/button>/);
});

test("D215: selecting a product does not break the other product tiles", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Measured live with Gildan Tee selected: the selected tile's actions sat at
   * rightInset 13, and the Hoodie and crewneck beside it at leftInset 1 /
   * rightInset 108 — flush left with 108px of dead space. Cause: this selector
   * was grouped into the .bundle-library display:block rule, so every unselected
   * tile lost `display:grid` the moment any product was chosen, and its buttons
   * fell back to normal flow.
   *
   * It is invisible until something is selected, which is exactly why the D197
   * measurements missed it. */
  assert.doesNotMatch(
    rules,
    /\[data-product-selected="true"\]\s*\.recipe-tile:not\(\.selected\)\s*,/,
    "unselected tiles must not be grouped into the bundle-library display:block rule",
  );
  assert.doesNotMatch(
    rules,
    /\[data-product-selected="true"\]\s*\.recipe-tile:not\(\.selected\)\s*\{[^}]*display:\s*block/,
    "and must not be given display:block anywhere",
  );

  // The rule it was wrongly attached to still does its own job.
  assert.match(rules, /\.app-shell\[data-product-selected="true"\] \.bundle-library\{display:block!important\}/);
});

test("D233: one heading system, two typefaces, no child larger than its parent", async () => {
  const css = await readFile(new URL("app/clarity-pass.css", root), "utf8");

  /* Measured on the Product page before this, in one viewport:
   *   h1 34px DM Serif Display · h2 27px DM Serif Display
   *   h3 25px Fraunces · h3 18px Manrope · h4 26px DM Serif Display
   * Three typefaces in one scale, two h3s differing by 7px AND typeface, and an
   * h4 LARGER than the h3 above it. Across pages the same role rendered two
   * ways: workflow titles DM Serif Display 34px, management titles Fraunces 40px.
   *
   * Four roles, two typefaces. Titles are DM Serif Display, anything functional
   * is Manrope, and Fraunces leaves the heading scale. */
  assert.match(css, /D233 · ONE HEADING SYSTEM FOR THE WHOLE APP/);

  const scale = css.slice(css.indexOf("D233 · ONE HEADING SYSTEM"));
  const sizeOf = (selector) => {
    const block = scale.slice(scale.indexOf(selector));
    return Number(/font-size:\s*(\d+)px/.exec(block.slice(0, block.indexOf("}")))?.[1]);
  };

  const page = sizeOf(".app-shell .workflow-hero h1");
  const card = sizeOf(".app-shell .workflow-stage h2");
  const group = sizeOf(".app-shell .workflow-stage h4");

  assert.ok(page > card, `page title ${page} must outrank card title ${card}`);
  assert.ok(card > group, `card title ${card} must outrank group title ${group}`);

  /* Management and workflow page titles must be the same role, one size. */
  assert.match(scale, /\.management-page h1[\s\S]{0,160}font-size: 34px/);
  /* And Fraunces must not reappear in a heading RULE — the comment above the
     scale names it as the thing being removed, so strip comments first. */
  const rules = scale.slice(scale.indexOf("*/") + 2).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /Fraunces/);
});
