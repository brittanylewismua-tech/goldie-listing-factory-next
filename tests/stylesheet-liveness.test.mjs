import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);

/* WHY THIS FILE EXISTS
 *
 * Twice a fix shipped, changed nothing, and cost a deploy plus a round trip to
 * discover — both times because a rule in clarity-pass.css described markup that
 * had moved or been deleted:
 *
 *   D211  `.batch-product-rows .row-panel` — the panel was a SIBLING of that
 *         element, so every rule for it was inert. Shipped, looked wrong, redeployed.
 *   D234  `.batch-product-card > .product-color-selector` — D218 had renested the
 *         panel inside the rows list, so the padding fix matched nothing. Shipped,
 *         looked identical, redeployed.
 *
 * Both were invisible to the suite because the tests asserted the rule's TEXT
 * existed in the file. A stylesheet rule that selects nothing is not a style; it
 * is a comment with syntax. This checks liveness in the only way possible
 * without a browser: every class the stylesheet targets must exist somewhere in
 * the markup that renders. It cannot prove a selector matches, but it does catch
 * the whole family of rules left behind when markup is deleted — which is what
 * made the file misleading enough to fool me twice.
 */

async function collect(dir, extensions, out = []) {
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const next = `${dir}${entry.name}${entry.isDirectory() ? "/" : ""}`;
    if (entry.isDirectory()) await collect(next, extensions, out);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(next);
  }
  return out;
}

test("no stylesheet targets a class the application no longer renders", async () => {
  const sourceFiles = await collect("app/", [".tsx", ".ts"]);
  const markup = (await Promise.all(sourceFiles.map((f) => readFile(new URL(f, root), "utf8")))).join("");
  const styleFiles = await collect("app/", [".css"]);
  const dead = [];
  for (const file of styleFiles) {
    const css = (await readFile(new URL(file, root), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/url\([^)]*\)/g, "");
    const targeted = new Set([...css.matchAll(/\.([a-zA-Z][\w-]+)/g)].map((m) => m[1]));
    for (const name of targeted) if (!markup.includes(name)) dead.push(`${file}: .${name}`);
  }
  dead.sort();
  assert.deepEqual(dead, [],
    `these classes are styled but never rendered — delete the rules or fix the selector:\n${dead.join("\n")}`);
});

test("current placement, preview, and size-guide controls retain their protections", async () => {
  const [app, clarity] = await Promise.all([
    readFile(new URL("app/listing-factory-app.tsx", root), "utf8"),
    readFile(new URL("app/clarity-pass.css", root), "utf8"),
  ]);
  assert.match(app, /className="placement-printify-link"/);
  assert.match(clarity, /\.placement-printify-link\{[^}]*font:800 11px\/1\.35/,
    "the live Printify placement action must remain readable");
  assert.match(clarity, /\.placement-review-grid \.printify-preview-button\{[^}]*height:250px!important/,
    "the live design preview must remain large enough to identify");
  assert.match(app, /className="secondary-action size-guide-remove"/);
  assert.match(clarity, /\.size-guide-remove\{[^}]*color:#6b4a60/,
    "the live size-guide removal control must remain visibly destructive");
});

/* D236 · An orphaned selector list is invisible and contagious. D234 removed a
   rule's declaration block and left `a, b, c,` with a trailing comma; the next
   rule's selector joined that list, so three panels silently took
   `overflow:visible` and the rule below was applied to elements it was never
   written for. A blank line inside a selector list is never deliberate. */
test("no stylesheet has an orphaned selector list", async () => {
  const orphans = [];
  for (const file of await readdir(new URL("app/", root))) {
    if (!file.endsWith(".css")) continue;
    const raw = await readFile(new URL(`app/${file}`, root), "utf8");
    const bare = raw.replace(/\/\*[\s\S]*?\*\//g, "\n");
    for (const chunk of bare.split("}")) {
      const head = chunk.slice(0, chunk.indexOf("{"));
      if (chunk.indexOf("{") === -1 || !head.includes(",")) continue;
      if (/,\s*\n\s*\n/.test(head)) orphans.push(`${file}: ${head.trim().split("\n")[0]} …`);
    }
  }
  assert.deepEqual(orphans, [], `a selector list is missing its declaration block, so it is
absorbing the next rule:\n${orphans.join("\n")}`);
});

/* D244 · A card's icon must follow the class that says what the card IS, never
   its position among siblings. `.step-card:first-child>.step-number:after`
   outranked every semantic rule because :first-child adds specificity, so the
   four-page restructure silently handed each card the previous occupant's icon.
   Positional selectors are how markup moves break styling without any rule
   going dead — the liveness test above cannot see this, because every class
   involved is real. */
test("no icon is chosen by DOM position", async () => {
  const offenders = [];
  for (const file of await readdir(new URL("app/", root))) {
    if (!file.endsWith(".css")) continue;
    const css = (await readFile(new URL(`app/${file}`, root), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
      const sel = rule.slice(0, rule.indexOf("{"));
      if (!/step-number:after|:after\{[^}]*mask-image/.test(rule)) continue;
      if (/:(?:first-child|last-child|nth-child|nth-of-type|first-of-type)/.test(sel))
        offenders.push(`${file}: ${sel.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `these icons are picked by position, so moving a
card changes its meaning:\n${offenders.join("\n")}`);
});

/* D246 · A component rendered in two shells cannot rely on a stylesheet scoped
   to one of them. The nav icons had no intrinsic size, and the only rules that
   sized them were `.app-shell .top-nav svg` — so on every management page they
   fell back to ~150px of solid black over the labels. */
test("nav icons carry their own size and stroke", async () => {
  const src = await readFile(new URL("app/nav-icons.tsx", root), "utf8");
  for (const key of ["width", "height", "stroke", "fill"])
    assert.match(src, new RegExp(`${key}:`), `nav icons must set ${key} on the element`);
  assert.doesNotMatch(src, /<svg viewBox="0 0 24 24" aria-hidden="true">/,
    "a bare <svg> here renders 150px black wherever the factory stylesheet is absent");
});

/* D254 · The factory pages and the management pages were running two different
   type scales — 64px page titles against 34px, and seven sizes for one card
   title. Anything that reintroduces a hard-coded heading size outside the
   D233 scale should be visible in review, so keep the scale itself in one file
   and assert the sizes it declares are the ones the app is allowed to use. */
test("headings use the D233 scale only", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const allowed = new Set(["34px", "22px", "15px", "12px", "10px", "18px"]);
  const bad = [];
  for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
    const sel = rule.slice(0, rule.indexOf("{"));
    if (!/\bh[1-5]\b/.test(sel)) continue;
    for (const [, size] of rule.matchAll(/font(?:-size)?:[^;}]*?(\d+px)/g))
      if (!allowed.has(size)) bad.push(`${sel.trim().slice(0, 60)} -> ${size}`);
  }
  assert.deepEqual(bad, [], `heading sizes outside the D233 scale:\n${bad.join("\n")}`);
});

/* D275 · `.app-shell` wraps the Listing Factory only. Verified on the deployed
   site: document.querySelector('.app-shell') is null on /keywords, /mockups,
   /batches and /usage. Two rules written tonight for management-page elements
   were scoped to it and therefore matched nothing — the same shape as D246,
   twice more. A rule for a management-only class must not require .app-shell. */
test("management-page rules are not scoped to the factory shell", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  /* D292 · The help dialog is portalled to <body>, so it is outside .app-shell
     too — the same trap as the management pages. */
  const managementOnly = ["management-nav", "bank-delete", "management-page",
    "usage-card", "usage-page", "keyword-workspace", "mockupHero", "setTitleRow",
    "context-help-dialog"];
  const bad = [];
  for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
    const group = rule.slice(0, rule.indexOf("{")).split(",").map((x) => x.trim());
    for (const sel of group) {
      if (!sel.includes(".app-shell")) continue;
      if (!managementOnly.some((cls) => sel.includes(`.${cls}`))) continue;
      /* A group may carry both the scoped and unscoped form; that is fine. */
      const unscoped = sel.replace(/\.app-shell\s*/, "").trim();
      if (group.includes(unscoped)) continue;
      bad.push(sel.slice(0, 70));
    }
  }
  assert.deepEqual([...new Set(bad)], [],
    `these target management-page elements but require .app-shell, which those pages do not render:\n${bad.join("\n")}`);
});

/* D280 · `display:grid` on an element whose content is a bare text node makes
   every WORD a grid item. It shipped on the Publish checklist and rendered the
   whole list one word per line. A rule may only impose grid or flex on an
   element the markup fills with real child ELEMENTS. */
test("no grid or flex is imposed on text-only containers", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const offenders = [];
  for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
    const sel = rule.slice(0, rule.indexOf("{"));
    const body = rule.slice(rule.indexOf("{"));
    if (!/display:\s*(grid|flex)/.test(body)) continue;
    if (!/grid-template-columns|gap/.test(body)) continue;
    /* Only child-combinator span/em/small targets — the shapes that in this app
       are written as <span>{"text"}</span> rather than as containers. */
    const m = sel.match(/>\s*(span|em|small|b|p)\s*$/);
    if (!m) continue;
    const parent = sel.match(/\.([\w-]+)\s*>/);
    if (!parent) continue;
    const rendered = new RegExp(`className="${parent[1]}"[^>]*>\\s*\\{`).test(app);
    if (rendered) offenders.push(`${sel.trim().slice(0, 60)} lays out a text-only child`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

/* D369 · `order` only means anything for the DIRECT children of a flex or grid
   container, but the ordering block for the setup column was written with
   descendant selectors — `.setup-column .template-proof`. That kept matching
   after the element was wrapped one level deeper, so the wrapper became a grid
   whose card carried order:11 while its sibling link carried the default 0, and
   the "Choose a different product bundle" link rendered ABOVE the bundle card
   it belonged to.

   Checked against the live page: of the fifteen selectors in that block only
   two were ever direct children of the column. The rest ordered nothing — they
   just sat there waiting to leak into whatever got nested under them next.

   `.app-shell` and `.keyword-page` are page namespaces rather than layout
   parents, so they are stripped before the check. */
test("D369: order is only ever set on a direct child", async () => {
  const files = await collect("app/", [".css"]);
  const offenders = [];
  for (const file of files) {
    const css = (await readFile(new URL(file, root), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/(^|;)\s*order\s*:/.test(match[2])) continue;
      for (const selector of match[1].split(",")) {
        const trimmed = selector.trim();
        if (!trimmed) continue;
        const scoped = trimmed.replace(/^\.(app-shell|keyword-page)\s+/, "");
        /* Collapse whitespace around child and sibling combinators; any space
           still standing is a descendant combinator. */
        const tail = scoped.replace(/\s*([>+~])\s*/g, "$1");
        if (!/\s/.test(tail)) continue;
        offenders.push(`${file}: ${trimmed}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `order: is set through a descendant selector, so it reaches elements it does not lay out:\n${offenders.join("\n")}`);
});

/* D375 · The rail-forward button rendered two ways: a 720px lilac gradient bar
   on step 1, a 210px plum pill on step 2. Same class, same job — the only
   difference was that step 2's copy happens to sit inside a .step-card, and a
   rule in clarity-pass.css restyled anything named .workflow-next that landed
   in one. A container deciding what a semantic action looks like is how you end
   up with two formats for one button.

   .workflow-next means "the way forward". Where it sits is not allowed to
   change that. */
test("D375: the forward button is not restyled by the container it sits in", async () => {
  const files = await collect("app/", [".css"]);
  const offenders = [];
  for (const file of files) {
    const css = (await readFile(new URL(file, root), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      /* A container may POSITION the button. It may not restyle it. */
      const appearance = /(^|;)\s*(background|border(?!-)|border-radius|border-color|color|box-shadow|font-size|font-weight|min-height|padding)\s*:/;
      if (!appearance.test(match[2])) continue;
      for (const selector of match[1].split(",")) {
        const trimmed = selector.trim();
        if (!/\.workflow-next(?![-\w])/.test(trimmed)) continue;
        /* Everything before the compound that carries .workflow-next. */
        const head = trimmed.slice(0, trimmed.search(/\.workflow-next(?![-\w])/));
        /* .app-shell and .finish-mode are page/mode namespaces, not the kind of
           container this is guarding against. */
        const containers = head.replace(/\.app-shell|\.finish-mode|[>+~\s]/g, "");
        if (containers) offenders.push(`${file}: ${trimmed}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `.workflow-next is restyled based on where it sits, which is what made one button look like two:\n${offenders.join("\n")}`);
});

/* D381 · The rail on steps 2-4 carried `batch-products` so it would inherit
   step 1's card layout. That class is declared
   `.app-shell .batch-products{...display:grid!important}`, so nothing could hide
   the rail - not .hidden-panel, not an inline display:none. It stayed open on
   every step, and step 2's drafts panel rendered on step 1.

   Borrowing a class for its layout also borrows its !important. Anything the app
   needs to hide must not be wearing a class that forces display. */
test("D381: nothing that gets hidden also wears a class that forces display", async () => {
  const files = await collect("app/", [".css"]);
  const forced = new Set();
  for (const file of files) {
    const css = (await readFile(new URL(file, root), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/display\s*:[^;}]*!important/.test(match[2])) continue;
      for (const selector of match[1].split(",")) {
        /* Only single-class subjects matter: those are the ones that get reused
           on another element for their layout. */
        const solo = selector.trim().match(/\.([\w-]+)$/);
        if (solo) forced.add(solo[1]);
      }
    }
  }

  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const offenders = [];
  /* Every className that is paired with a hidden/style-driven visibility switch. */
  for (const match of app.matchAll(/className="([^"]*)"\s+style=\{hidden\?/g)) {
    for (const name of match[1].split(/\s+/)) if (forced.has(name)) offenders.push(name);
  }
  for (const match of app.matchAll(/className=\{`([^`]*)\$\{hidden\?/g)) {
    for (const name of match[1].split(/\s+/)) if (forced.has(name)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `these classes force display with !important, so an element wearing one can never be hidden: ${offenders.join(", ")}`);
});

/* D382 · A short-window rule bought space by hiding .etsy-api-disclosure. That
   line is the Etsy API attribution, required by their terms and placed
   deliberately next to the copyright. Space comes from padding and type size,
   never from that. */
test("D382: the Etsy attribution is never hidden to make room", async () => {
  const files = await collect("app/", [".css"]);
  for (const file of files) {
    const css = (await readFile(new URL(file, root), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/\.etsy-api-disclosure/.test(match[1])) continue;
      assert.doesNotMatch(match[2], /display\s*:\s*none/,
        `${file} hides the Etsy attribution: ${match[1].trim()}`);
    }
  }
});

/* D389 · A panel that is wider than the card holding it gets cut off. The cause
   is always the same shape: a negative inline margin written when the element
   lived somewhere wider. D310 was this. D389 was this again, on .variant-pricing
   inside the product card. Anything that sits inside a product card must not
   pull itself outward. */
test("D389: nothing inside a product card widens itself with negative margins", async () => {
  const files = await collect("app/", [".css"]);
  const offenders = [];
  for (const file of files) {
    const css = (await readFile(new URL(file, root), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const selector = match[1];
      if (!/batch-product-card|step-product-body/.test(selector)) continue;
      const body = match[2];
      const negative = body.match(/margin(-inline|-left|-right)?\s*:\s*[^;}]*-\d/);
      if (negative) offenders.push(`${file}: ${selector.trim().slice(0, 90)} → ${negative[0]}`);
    }
  }
  assert.deepEqual(offenders, [],
    `a negative margin inside a product card makes the panel wider than the card:\n${offenders.join("\n")}`);
});

/* D395 · A grid container with no explicit column gets one implicit auto track,
   and an auto track sizes to its content - so a wide row makes the track wider
   than the container and everything inside spills past the card edge. That is
   what cut off every product row, buttons included. Any grid that holds the
   product rows must declare a constrained track. */
test("D395: the product rows grid declares a constrained track", async () => {
  /* D721 · the shell migration moved ownership of these selectors to
     interface-v2.css. The rule and the defect it prevents are unchanged. */
  const css = (await readFile(new URL("app/interface-v2.css", root), "utf8"));
  assert.match(css, /\.app-shell \.batch-product-rows\{grid-template-columns:minmax\(0,1fr\)\}/,
    "an implicit auto track sizes to the row, not to the card");
  assert.match(css, /\.app-shell \.batch-product-row\{min-width:0\}/);
});

/* D398 · The management pages are a separate layout with no .app-shell, which is
   why they never inherited the sidebar footer and why every .app-shell-scoped
   fix has always skipped them. The Etsy API attribution has to appear wherever
   Etsy data is shown, and these pages show it. */
test("D398: the management pages carry the Etsy attribution too", async () => {
  const nav = await readFile(new URL("app/management-nav.tsx", root), "utf8");
  assert.match(nav, /etsy-api-disclosure/,
    "Etsy attribution is required on every page that shows Etsy data");
  assert.match(nav, /management-nav-footer/);
  assert.match(nav, /approved-powered/);

  const css = await readFile(new URL("app/factory-navigation.css", root), "utf8");
  assert.match(css, /\.management-nav-footer\{margin-top:auto/,
    "pinned to the bottom like the workflow rail");
});

/* D405 · .top-actions is a column with justify-content:flex-end. Make it
   shrinkable and, the moment its content is taller than the space it was shrunk
   to, the overflow leaves through the TOP - the nav rendered straight over the
   Goldie wordmark. Measured at a 756px viewport: .top-nav sat at y=59 while its
   own parent started at y=155.

   A column that packs its content to one end must never be shrunk below that
   content. */
test("D405: the sidebar nav column is never shrunk below its content", async () => {
  /* D721 · same move; interface-v2.css owns the sidebar now and loads last. */
  const css = await readFile(new URL("app/interface-v2.css", root), "utf8");
  assert.match(css, /\.topbar>\.top-actions\{flex:0 0 auto;justify-content:flex-start\}/,
    "flex:0 1 auto here pushes the nav up over the wordmark");
  assert.doesNotMatch(css, /\.topbar>\.top-actions\{flex:0 1 auto/);

  /* The space has to come from somewhere, and it has to be in the stylesheet
     that loads last or it is silently outranked. */
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  assert.match(clarity, /@media \(max-height:900px\)\{[\s\S]{0,400}\.app-shell \.topbar\{padding-top:22px/);
});

/* D401/D408 · Both listing previews were built at ~150px and both were later cut
   to thumbnail size (56px on Listing, 72px on Images) by rules carrying
   !important. At that size the artwork is unreadable, so the card cannot tell
   you which design or which product you are working on. They are the same size
   as each other, deliberately. */
test("D418: every management page keeps its eyebrow", async () => {
  const css = await readFile(new URL("app/approved-functional.css", root), "utf8");
  assert.doesNotMatch(css, /\.managementOnly \.mockupHero \.mockupEyebrow[^{]*\{display:none/,
    "the page eyebrow is part of the heading system, not decoration");
});

test("D417/D431: a row of bank cards ends on one line", async () => {
  const nav = await readFile(new URL("app/factory-navigation.css", root), "utf8");
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  /* D431 - the D417 rule below is correct but was silently outranked: clarity-pass
     loads last and carried align-items:start!important from D195. Measured live,
     three cards at 377/346/425px put their buttons on three different lines. */
  assert.doesNotMatch(clarity, /\.keyword-page \.bank-grid\{align-items:start!important\}/,
    "the last stylesheet must not undo the alignment");
  assert.match(clarity, /\.keyword-page \.bank-grid\{align-items:stretch!important\}/);
  assert.match(clarity, /\.keyword-page \.bank-grid>article>button:last-child\{margin-top:auto!important\}/,
    "and the slack falls below the content, not above the action");
  assert.match(nav, /\.bank-grid\{align-items:stretch\}/);
  assert.match(nav, /\.bank-grid>article>button:last-child\{margin-top:auto\}/,
    "and each card's action sits on its own bottom edge");
});

/* D434 · The last screen before publishing. Items needing review sat in source
   order among the ready ones, told apart only by a slightly different pale
   colour, so the two things that needed her were buried between five that did
   not — on the screen where money gets spent. */
test("D437: a saved bundle shows what is in it", async () => {
  const clarity = await readFile(new URL("app/clarity-pass.css", root), "utf8");
  const rule = clarity.slice(clarity.indexOf(".app-shell .recipe-tile.bundle-as-product .recipe-copy small{"));
  assert.match(rule.slice(0, 400), /white-space:normal!important/,
    "measured live: 192px of product names in a 122px nowrap box");
  assert.match(rule.slice(0, 400), /-webkit-line-clamp:2!important/,
    "two lines covers the four products a bundle can hold");
});
