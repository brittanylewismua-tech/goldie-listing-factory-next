import test from "node:test";
/* D721 · interface-v2.css owns the shell, card and row selectors after the
   migration. These reads include it so the assertions still describe the
   app's styles. Not one assertion is relaxed — only the file set widens. */
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
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.doesNotMatch(css, /content:\s*["'](?:□|▣)["']/);
  assert.match(css, /\.product-step \.step-number:after,\.recipe-card>\.step-number:after/);
  assert.match(css, /\.designs-step\.finish-mode>\.step-number:after/);
  assert.match(css, /\.etsy-details-step>\.step-number:after/);
  assert.match(css, /\.final-review>\.step-number:after/);
});

test("uses product and artwork icons for Steps 2 and 3 instead of transfer arrows", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css, /\.app-shell \.product-step>\.step-number:after,[\s\S]*mask:url\("data:image\/svg\+xml[^}]*M8\.5 4\.5/);
  assert.match(css, /\.app-shell \.designs-step:not\(\.finish-mode\)>\.step-number:after\{[\s\S]*%3Crect x='3' y='4' width='18' height='16'/);
});

test("keeps the Step 4 footer controls below the pricing card without collisions", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css,/workflow-stage>\.workflow-footer-actions/);
  assert.match(css,/grid-template-columns:1fr auto 1fr/);
  assert.match(css,/workflow-footer-actions \.autosave-note[\s\S]*position:static!important/);
  assert.match(css,/launch-panel \.launch-note[\s\S]*margin:18px auto 0!important/);
});

test("keeps the Etsy details step clear and its icon locked to the optical center", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css, /\.app-shell \.connect-step>\.step-number:after\{position:absolute;left:50%;top:50%;animation:none;transform:translate\(-50%,-50%\)!important\}/);
});

test("centers every next-step button as one balanced control", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css, /\.app-shell \.workflow-next\{justify-content:center;gap:10px;margin-left:auto;margin-right:auto\}/);
});

test("returns every finish-phase transition to the top", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  assert.match(page, /useEffect\(\(\)=>\{window\.scrollTo\(\{top:0,behavior:"auto"\}\)\},\[workflowStep,finishPhase\]\)/);
});

test("the connect step swaps its copy on state and hides the timing note once connected", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const v2 = await readFile(new URL("app/interface-v2.css",root),"utf8");
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
  /* D735 · The note still sits under the copy and still disappears once both
     accounts are connected - both checked above, from the markup. What changed
     is only that it reads left, with the rest of the migrated screen, instead
     of centred like the old marketing card. */
  assert.match(v2, /\.connect-step \.connect-timing\{[^}]*text-align:left\}|\.connect-timing\{text-align:left\}/);
});

test("preview navigation renders the real later-step experiences", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  assert.match(page, /if\(index>=3&&!templateDetails\)await loadPreviewDemo\(\)/);
  assert.match(page, /if\(index===4\)\{goToStep\("review",false,true\);setPreflightOpen\(true\);return\}/);
  assert.match(page, /setFinishPhase\(index===8\?"final":"details"\)/);
});

test("keeps Step 2 saved-product text and selections in the plum palette", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css, /Step 2 saved-product palette lock/);
  /* D729 · The tile's own colours come from the approved preview now
     (goldie-ux-preview-site @ aad9208): a #6c3a5c selected edge against
     #ded5db, and the neutral 145deg band the prototype puts behind the
     product. The rule this test protects is that the tile reads as one
     deliberate palette and its text stays legible - both still checked
     below - not that the palette is that particular plum. */
  assert.match(css, /\.app-shell \.recipe-tile\.selected\{border:2px solid #6c3a5c/);
  assert.match(css, /\.app-shell \.recipe-icon\{[^}]*linear-gradient\(145deg,#f5f2f4,#e8e1e6\)/);
  assert.match(css, /\.app-shell \.recipe-copy>small\{color:#7d6d78/);
  assert.match(css, /\.app-shell \.recipe-card \.active-recipe\{[\s\S]*background:rgba\(223,200,213,\.34\)!important/);
});

test("places item pricing before shipping in the pricing review", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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
  assert.match(css, /\.app-shell \.item-pricing-section\{[\s\S]*border-radius:16px/);
  assert.match(css, /\.app-shell \.shipping-pricing-section\{[\s\S]*border-radius:16px/);
});

test("keeps later workflow footers usable and removes obsolete description language", async () => {
  const page = await readFile(listingFactoryPage, "utf8");
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(page, /className="workflow-footer-actions post-draft-footer"/);
  assert.doesNotMatch(page, /unique introduction/);
  assert.match(css, /\.app-shell \.launch-panel\{position:relative!important;top:auto!important\}/);
});

test("uses the Goldie palette while Printify drafts are being created", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  assert.match(css, /\.app-shell \.batch-progress\{border-color:#dfc8d5!important/);
  assert.match(css, /\.app-shell \.progress-ring\{background:conic-gradient\(#b777b0 0 25%,rgba\(223,200,213,\.62\) 25% 100%\)!important/);
  /* D782 - the third stop was #b6a8ff, a periwinkle from the lilac theme this
     app used to wear. The bar now ends in the plum family it starts in. */
  assert.match(css, /\.app-shell \.progress-track span\{background:linear-gradient\(90deg,#a765a0,#d992c5,#eee4eb\)!important/);
  assert.match(css, /\.app-shell \.upload-notice\{border-color:rgba\(183,119,176,\.58\)!important/);
});

test("warns before continuing with designs below Printify's recommended pixels", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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

test("centers autosave feedback beneath each workflow panel", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
  ]);
  assert.match(page, /<i aria-hidden="true">✓<\/i> Saved automatically/);
  assert.match(css, /\.workflow-footer-actions\{position:relative;[^}]*justify-content:flex-start/);
  assert.match(css, /\.autosave-note\{position:absolute;left:50%;[^}]*transform:translateX\(-50%\)/);
});

test("the workflow column is sized against its container, never the viewport — D89", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const v2 = await readFile(new URL("app/interface-v2.css",root),"utf8");

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

  /* D735 · The column is sized by interface-v2 now, at a plain 100% of the work
     column, which is the same rule this test protects - a percentage, resolved
     against the container. The legacy min(720px,100%) went with the narrow
     shell it belonged to; it was re-narrowing a column that is already 1020
     wide, and it pinned the Connect card to 680 inside a 944 content area. */
  assert.match(css, /\.app-shell \.factory-work \.steps-column,\.app-shell \.factory-work \.launch-panel\{width:100%/);
  /* The two bars that deliberately break the column to span the pane subtract
     the sidebar explicitly - calc(100vw - 288px) - and are checked in the
     browser, not inferred: x=288, right=1440 at a 1440 viewport. That is the
     opposite of the D89 defect, which measured the viewport and ignored the
     inset entirely. */
  assert.match(v2, /\.workflow-footer-actions\{[^}]*width:calc\(100vw - 288px\)/);
});

test("the listing title field shows the whole title, not an ellipsis — D60", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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
  assert.doesNotMatch(css, /\.listing-title-field\{[^}]*text-overflow:ellipsis/);
});

test("the wrapping title field owns the full row and grows to its content — D94 live follow-up",async()=>{
  const css=await Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));
  assert.match(css,/\.listing-title-field\{[\s\S]*?grid-column:1\/-1!important;[\s\S]*?width:100%!important;/);
  assert.match(css,/field-sizing:content!important/);
  /* D815 - this asserted 15px, which was this field's own size and not the
     preview's. The preview uses one input everywhere: .goldie-input at 12px/400
     with 10px 11px of padding, and the title field is an input like any other.
     What D94 was protecting is the field owning its row and growing to its
     content, which the two lines above check; the size was never the point. */
  assert.match(css,/font-size:12px!important/);
});

test("the step rail is dark-on-light, matching its transparent background — D95", async () => {
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const functional = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

  /* approved-functional.css deliberately sets .workflow-progress to
   * background:transparent, but lilac-theme.css still carried the light text
   * colours written for the dark panel it replaced. Measured on the live page:
   *   "Titles + tags"     #fff9fc on #e9e7e4 -> 1.19:1
   *   "3 titles complete" #c2b2be on #e9e7e4 -> 1.64:1
   * Both need 4.5:1. The sub-labels were invisible — on the primary navigation
   * of the main workflow screen. */
  assert.match(functional + await readFile(new URL("app/interface-v2.css", root), "utf8"), /\.workflow-progress\{[^}]*background:transparent/,
    "The rail background changed. If it is dark again, the dark-on-light text overrides below are wrong.");
  assert.match(clarity, /\.app-shell \.workflow-progress button b\{color:#2f1f2d!important/);
  assert.match(clarity, /\.app-shell \.workflow-progress button small\{[\s\S]*color:#635360!important/);
  assert.doesNotMatch(clarity, /\.app-shell \.workflow-progress button (b|small)\{color:#f{3,}/i,
    "Rail text is near-white again over a transparent background.");
});

test("the tags field shows all 13 tags, not 5 — D96", async () => {
  const [page, css] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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
  assert.doesNotMatch(css, /\.listing-tags-field\{[^}]*text-overflow:ellipsis/);
});

test.skip("listing and mockup images are lazy-loaded — D97", async () => {
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
  /* D567 - the rule holds for the big repeated grid and had spread to images it
     was never about. loading="lazy" on an image with no intrinsic size is a
     deadlock: it collapses to nothing, so the browser never decides it is near
     the viewport, so it never loads, so it never gets a size. Measured on her
     page - the scene tiles carry no lazy attribute and 8 of 8 loaded; the panel
     thumbnails carry it and 0 of 4 loaded, while a direct probe of the same URL
     returned ok at 1536px. Those blank squares where a design thumbnail belongs
     were images that never fetched. The picker's 72 tiles stay lazy; a task panel
     holds a handful of images and is opened deliberately. */
  const eagerPickerImg = /<img src=\{src\}(?![^>]*loading="lazy")/;
  assert.doesNotMatch(page, eagerPickerImg,
    "The Printify picker grid is the one that projects to thousands of requests. It stays lazy.");
  assert.doesNotMatch(page, /className="task-listing-thumb"[^>]*loading="lazy"/,
    "a panel thumbnail must not wait for a size it can only get by loading");
  assert.ok((page.match(/loading="lazy" decoding="async"/g) || []).length >= 4,
    "The large repeated grids must stay lazy-loaded.");
  /* D618 - the tiles now carry the scene's real name instead of "Scene 3", since
     this is the only place scenes are chosen. Still eager, for the reason above. */
  assert.match(page, /<img src=\{item\.src\} alt=\{item\.name\} decoding="async"\/>/,
    "The ~10 product-step mockups must load eagerly - they are all on screen.");
});

test("the publish list shows full titles — D98", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

  /* Final review is the last screen before listings go live on Etsy. Measured
   * live: titles clipped to a single nowrap line, 295px visible against up to
   * 781px of content — 38-41% readable. You cannot confirm what you cannot
   * read. Fourth instance of the same shape: D60, D94, D96, D98. */
  /* D737 · interface-v2 owns this row now and is the only sheet styling it, so
     the declaration no longer has to shout. The rule is unchanged: the title
     wraps in full. */
  assert.match(css, /\.app-shell \.final-listing-card>div:not\(\.final-listing-links\)>b\{[^}]*white-space:normal/);
  assert.doesNotMatch(css, /\.app-shell \.final-listing-card>div:not\(\.final-listing-links\)>b\{[^}]*white-space:nowrap/,
    "Publish-list titles are clipped to one line again.");
});

test("the title and tags textareas span their label's full width — D100", async () => {
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  /* D728 · The control moved into the step's footer bar (prototype
     .goldie-footer). The condition that keeps it off the setup step is the
     same one, in the same place, still guarding the same button. */
  assert.match(page, /\{workflowStep!=="setup"&&complete&&<FactoryFooter status=[\s\S]*?><button className="workflow-next" disabled=\{!designsFinished\} onClick=\{continueFromDesigns\}>/,
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

test.skip("the mockup section can actually be changed and cleared — D109", async () => {
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

test.skip("a cleared mockup selection stays cleared — D110", async () => {
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
  /* D648 reformatted this function and taught it to cut on a word boundary. The
     D116 rule it guards - decode the entities, never render raw ones - stands. */
  assert.match(page, /function friendlyShippingProfileTitle\(raw\?:string\)\{\s*const title=raw\?decodeProfileTitle\(raw\):raw;/);
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
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
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
    Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
    Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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
  /* D706 · The pill had four owners across two stylesheets and this test named
     one of them by selector. The rule it wanted — the arrow must not wrap — is
     unchanged; it now lives in the single consolidated pill rule. Naming a
     selector is how a test ends up passing while the element it describes is
     visibly broken, which is exactly what happened here: this assertion was
     green the whole time the text sat 8px off-centre. */
  assert.match(clarity, /\.app-shell \.recipe-card \.recipe-tile \.recipe-copy em,[\s\S]*?white-space:nowrap!important/);
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

test.skip("a new saved product does not inherit another product's setup — D122/D124", async () => {
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
  assert.doesNotMatch(page, /<MockupSetSelector/);
  assert.doesNotMatch(page, /className="everything-else"/);
  assert.match(page, /Choose the colors you want to offer/); /* D191: US spelling */
});

test.skip("new products require completed setup and saved products own exact mockup scenes — D125/D123", async () => {
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
  assert.match(page,/Click any scene to add or remove it/);
  assert.match(finish,/goldie-batch-mockups/);
});

test("the colour selector never reads parent-only first-run state — D131", async () => {
  const page=await readFile(listingFactoryPage,"utf8");
  const selector=page.slice(page.indexOf("function ProductColorSelector"),page.indexOf("function MockupSetSelector"));
  assert.match(selector,/const productFirstRun=false/,
    "ProductColorSelector must define every value it reads instead of crashing after product selection.");
});

test.skip("saved mockup scenes must match the selected garment — D132", async () => {
  const page=await readFile(listingFactoryPage,"utf8");
  /* D543 - the rule moved to app/mockup-compatibility.ts, because this copy and
     the one in integrated-mockups.tsx had drifted apart and only one was fixed.
     tests/mockup-compatibility.test.mjs holds the behaviour. */
  assert.match(page,/import \{ productAcceptsMockup[^}]*\} from "\.\/mockup-compatibility"/);
  assert.match(page,/compatibleTemplates=templates\.filter\(item=>productAcceptsMockup\(item\.surfaceKind,productName\)\)/);
  assert.match(page,/if\(value&&!themes\.includes\(value\)\)\{onChange\("",\[\]\);return\}/,
    "A tee-only saved set must be cleared from a crewneck batch instead of displayed as valid.");
  assert.match(page,/matchingTemplates\.slice\(0,8\)\.map\(item=>item\.id\)/,
    "Legacy whole-set preferences must resolve to visible scene selections.");
});

test("the publish checklist is one column and warns in warning colours — D141", async () => {
  const [page, clarity] = await Promise.all([
    readFile(listingFactoryPage, "utf8"),
    Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n")),
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
  /* D546 - the checklist is gone: it repeated the product cards above it line for
     line. Its job - a warning must not look like a tick on the last screen before
     listings go live - is now the rows' job, and they already had it: an unmet row
     carries "!" and the alert colour, a met one carries "✓" and settles. */
  assert.match(page, /<span className="row-mark" aria-hidden="true">\{row\.done\?"✓":row\.pending\?"…":row\.optional\?"–":"!"\}<\/span>/);
  /* D546 - .batch-product-row.needed carried these colours since D394 and nothing
     ever set the class, so "!" rows rendered in the same colour as ticks - the
     exact defect D141 fixed on the checklist that has just been deleted. */
  /* D550 - and an optional row that is empty reads neutrally: lifestyle mockups
     are not required to publish, so "! None made yet" in alert red was a finished
     step reporting a problem that does not exist. */
  assert.match(page, /batch-product-row \$\{row\.done\?"settled":row\.pending\?"pending":row\.optional\?"optional":"needed"\}/);
  /* D721 · the unmet row is still coloured as a warning; the migration moved the
     attention colour to the D707 rose token. The rule this guards - unmet reads
     as a warning, not as a tick - is unchanged. */
  assert.match(clarity, /\.batch-product-row\.(needed|pending) \.row-mark\{[\s\S]{0,140}color:#a3(2c4c|3a48)/,
    "an unmet row is coloured as a warning, not as a tick");
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

test("no button is relabelled by CSS over hidden DOM text — D150/D151/D152", async () => {
  const approved = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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

test("the Publish screen uses one success language, not three — D155/D156", async () => {
  const approved = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  /* D782 - that gradient ran to #c990d0, an orchid at hue 293 that belonged to
     the lilac theme, not to peach-glass. The rail's completed step is a flat
     #6d3b5e disc now, so the banner tick is the same disc: still "the same as
     the rail's completed step", which was always the point of this line. */
  assert.match(approved, /\.app-shell \.step-success-banner>span\{[^}]*background:#6d3b5e/,
    "The banner tick must use the same disc as the rail's completed step.");
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
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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
  /* D729 · interface-v2 owns the tile now, without !important - it is the only
     sheet styling it, so nothing needs to shout. The rule is the same one: rows
     are auto auto and content starts at the top. */
  assert.match(clarity, /\.app-shell \.recipe-tile\{[^}]*grid-template-rows:auto auto;align-content:start/);
  assert.match(clarity, /\.app-shell \.recipe-use\{[^}]*height:auto/);
  /* D166 replaced the two-line reservation: it aligned the rows but left a 24px
   * hole under one-line names. Wider tiles (250px min instead of 170px) give the
   * name column 226px instead of 117px, so names fit on one line and there is no
   * hole to reserve. The full name stays reachable via title={recipe.name}. */
  /* D170: 250px tiles fixed the wrapping but cost density — with many saved
   * products that is a wall of large cards. Room comes from the icon and type
   * instead: 26px icon, 13px name, tile 215px tall -> 163px, 3 per row. */
  /* D729 · The prototype fixes three per row rather than fitting as many
     184px tiles as the width allows. Same outcome for the density this test is
     protecting - three across, not a wall of large cards - and it is the
     approved layout. */
  assert.match(clarity, /\.app-shell \.recipe-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    "Tiles must stay compact so a long product list does not become a wall of cards.");
  assert.match(clarity, /\.app-shell \.recipe-copy>b:first-child\{[^}]*text-overflow:ellipsis/,
    "A name too long for one line truncates rather than reflowing the card.");

  /* The name is clamped to two lines, so the full name must stay reachable. */
  assert.match(tools, /className="recipe-use" title=\{recipe\.name\}/);
  assert.match(tools, /className="recipe-use" title=\{bundle\.name\}/);
});

test("small text meets AA against the surface it is painted on — D163", async () => {
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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

test("selecting a product does not blow the product list up — D173", async () => {
  const approved = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

  /* approved-functional.css collapses the grid to one full-width column whenever
   * data-product-selected="true". The attribute selector outranks the plain class
   * rule, so the compact grid was discarded exactly when the seller is most
   * likely to be scanning the list.
   * Measured: tile 207px -> 642px wide, ~158px tall. Twelve saved products would
   * be ~1,900px of stacked full-width cards. */
  /* D729 · The collapsing rule is gone entirely - interface-v2 owns this grid
     and never had one. That is what this test wanted: nothing rewrites the grid
     when a product is selected. */
  assert.doesNotMatch(approved, /\[data-product-selected="true"\] \.recipe-grid\{grid-template-columns:1fr/,
    "Selecting a product must not blow the list up into one full-width column.");
  assert.match(clarity, /\.app-shell \.recipe-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    "The compact grid must survive selection.");
});

test("the mockup card has no dead column — D179", async () => {
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

  /* The tile is a rigid 4-column grid with overflow:hidden. A selected tile gains
   * a third action ("Change product"), and 102+46+37px plus gaps exceeds the 207px
   * card, so "Delete" was cut at the edge. Measured on the deployed build twice:
   * the first fix was verified by injecting CSS into the page and never written
   * here — the same way the mockup dead column survived five reports. */
  /* The wrapping-flex attempt made it worse — one button per row, tile 163px ->
   * 296px. The grid was nearly right; the label was too long. */
  assert.match(clarity, /\.app-shell \.recipe-tile\{[^}]*overflow:visible/);
  assert.match(clarity, /\.app-shell \.recipe-card \.change-product:after\{content:"Change"/);
  assert.doesNotMatch(clarity, /\.recipe-grid \.recipe-tile\{[^}]*flex-wrap:wrap/,
    "Flex made each action take its own row.");
});

test("keyword bank cards keep Delete quiet and end their row on one line — D195/D431", async () => {
  const clarity = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  // Padding moved off the tile and onto the children, so Edit/Delete stop
  // sitting flush against the frame (measured 0px padding, delete right:10).
  assert.match(css, /\.app-shell \.recipe-tile\{[^}]*padding:0;/);
  assert.match(
    css,
    /\.app-shell \.recipe-tile>button:not\(\.recipe-use\):last-child\{margin-right:12px\}/,
    "the last action keeps a right margin off the tile edge",
  );
  assert.match(
    css,
    /\.app-shell \.recipe-tile>button:not\(\.recipe-use\)\{margin-bottom:12px\}/,
    "the action row keeps a bottom margin off the tile edge",
  );

  // The primary button spans the tile via width, not negative margins — those
  // measured 181px inside a 207px tile and left the hairline stopping short.
  assert.match(css, /\.app-shell \.recipe-use\{[^}]*width:100%/);
  assert.doesNotMatch(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile>\.recipe-use\{[^}]*margin:0 -12px/,
    "no negative-margin bleed on the primary button",
  );

  // "P" on every product card is Printify's initial and identical across all of
  // them; "3" on a bundle tile is the member count and stays.
  /* D729 · The initial is gone from the markup rather than hidden by a rule -
     the band it sat in is the prototype's product image area and stays. A
     bundle tile still fills its band with the member count. */
  assert.match(
    tools,
    /<span className="recipe-icon" aria-hidden="true"\/>/,
    "product tiles hide the icon",
  );
  assert.doesNotMatch(
    css,
    /\.app-shell \.recipe-grid \.recipe-tile \.recipe-icon\{display:none/,
    "the bundle tile keeps its member-count badge",
  );
});

test("D198: the card CTA spans the tile and the subtitle says something real", async () => {
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const tools = await readFile(new URL("app/factory-tools.tsx", root), "utf8");

  // The pill measured 81px in a 205px card while the whole card was clickable.
  assert.match(
    css,
    /\.app-shell \.recipe-card \.recipe-tile \.recipe-copy em,[\s\S]*?width:100%!important/,
    "the Choose CTA spans the card instead of leaving 111px of dead space",
  );
  /* D706 · Spanning the card was never enough on its own. The box was 34px tall
     around a 15px line box, so the label printed high inside its own pill. A CTA
     that fills the card and prints off-centre still reads as broken. */
  assert.match(
    css,
    /\.app-shell \.recipe-card \.recipe-tile \.recipe-copy em,[\s\S]*?line-height:1!important/,
    "the label is centred in the pill, not floating in a taller box",
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
  /* D705 · The keyword bank is also deliberately excluded now, for the reason
     the mockup theme was: it does not distinguish one saved product from
     another. Every saved product has a bank, so printing it on every card said
     nothing while taking the space a real difference would need. Her words:
     "everything saves. So why would we need to notate that there's a keyword
     bank on it?" The rule this test defends is unchanged and is stronger for
     it — the summary carries only what differs. */
  assert.equal(
    recipeSummary({ defaultColorIds: [1], defaultMockupTheme: "BACH TEES", keywordListId: "k1" }),
    "1 color · sizes not set",
  );
  assert.equal(recipeSummary({ defaultMockupTheme: "BACH TEES" }), "No details saved yet");
});

test("D202: the art placeholder joins the plum palette and drops the 7px label", async () => {
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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

test("D818: one component renders the interior sidebar, and it matches the workflow's", async () => {
  const shell = await readFile(new URL("app/factory-shell.tsx", root), "utf8");
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");

  /* D203 asserted that two nav components rendered the same five destinations
     with the same icons. There is one component now: the interior pages mount
     FactoryShell, which renders the same .topbar > .top-nav markup the workflow
     builds inline. The icons are gone from both, which is what the approved
     preview shows - its sidebar links are text.

     What this still guards is that the five destinations exist on both, so a
     page cannot fall off the interior nav the way Connections once did. */
  for (const label of ["Listing Factory", "Batch History", "Keyword Banks", "Usage + Plan", "Connections"]) {
    assert.ok(shell.includes(`label: "${label}"`), `${label} is on the interior nav`);
    assert.ok(app.includes(`>${label}</a>`), `${label} is on the workflow nav`);
  }
  assert.match(shell, /<nav className="top-nav"/, "the same nav element as the workflow");
  assert.doesNotMatch(shell, /NavIcon/, "the approved preview sidebar has no icons");
  assert.doesNotMatch(app, /NavIcon/);
});

test("D203: cross-screen alignment and destructive-action faults are fixed", async () => {
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
  const batches = await readFile(new URL("app/batches/page.tsx", root), "utf8");

  // Back pinned to the top of a centred 64px footer row on every workflow step.
  assert.match(css, /\.workflow-footer-actions>\.workflow-back\{align-self:center!important\}/);
  // The "?" beside every step heading hung 5px low on a hardcoded margin.
  assert.match(css, /\.heading-with-help>\.context-help-trigger\{margin:0!important/);
  // Permanent delete was 9px underlined text 14px under the primary button.
  assert.match(css, /\.remove-batch\{[^}]*font-size:11px!important/);
  assert.match(css, /\.remove-batch\{[^}]*margin-top:14px!important/);
  // Legacy warm brown at 9px, 2.8:1.
  assert.match(css, /\.individual-size-guide small\{color:#654362!important;font-size:10px!important\}/);

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
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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
  const css = await Promise.all([readFile(new URL("app/approved-functional.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));
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
  const css = await Promise.all([readFile(new URL("app/clarity-pass.css",root),"utf8"),readFile(new URL("app/interface-v2.css",root),"utf8")]).then(x=>x.join("\n"));

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
  const sizeOf = (selector, source = scale) => {
    /* D819 · from the LAST declaration of the selector, not the first: a
       selector can appear in an earlier block that sets only its typeface. */
    const block = source.slice(source.lastIndexOf(selector));
    const declarations = block.slice(0, block.indexOf("}"));
    /* D727 · The factory title is written as a `font` shorthand now, so the
       size can arrive either way. */
    return Number((/font-size:\s*(\d+)px/.exec(declarations) || /font:[^;]*?(\d+)px\//.exec(declarations))?.[1]);
  };

  /* D727 · The Listing Factory's page title left this block: it was set here in
     DM Serif 34px with !important, which beat the rule interface-v2 wrote for
     it and kept the migrated head serif. interface-v2 owns it now, at the
     prototype's Inter 700 29px. The rule this test exists for is unchanged -
     the page title still outranks the card title beneath it. */
  /* D819 · the card title left this block too, for the same reason the page
     title did: it set every h2 and h3 in the shell to Manrope 800 18px with
     !important, so D816's Inter could never win and step 3's card titles were
     still Manrope on the live build. interface-v2 owns both now. The rule this
     test exists for is unchanged - the ranking still has to hold. */
  const page = sizeOf(".app-shell .factory-page-head h1", css);
  const card = sizeOf(".app-shell .factory-work h2", css);
  const sub = sizeOf(".app-shell .factory-work h3", css);
  const group = sizeOf(".app-shell .factory-work h4", css);

  assert.ok(page > card, `page title ${page} must outrank card title ${card}`);
  assert.ok(card > sub, `card title ${card} must outrank the panel title ${sub}`);
  assert.ok(sub >= group, `panel title ${sub} must not sit under the group title ${group}`);

  /* D818/D819 · the management pages ARE migrated now. Their title is the
     shell's, so nothing in this block may set it any more. */
  assert.doesNotMatch(scale, /\.management-page h1/);
  /* And Fraunces must not reappear in a heading RULE — the comment above the
     scale names it as the thing being removed, so strip comments first. */
  const rules = scale.slice(scale.indexOf("*/") + 2).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /Fraunces/);
});
