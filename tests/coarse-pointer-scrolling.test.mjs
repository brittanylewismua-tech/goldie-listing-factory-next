/*
  A PHONE-FIRST PAGE THAT CANNOT SCROLL.

  The desktop gate fires at (max-width:820px) and (pointer:coarse) and
  replaces the Listing Factory with a card telling the member to use a bigger
  screen. That card is exactly 100vh, so the block set
  `html,body{overflow:hidden}` to stop it moving.

  D1575 then let the phone-first surfaces — Shop Map, Market Watch, Design
  Scanner — opt out of the gate. The opt-out covered which children stay
  visible (`.app-shell:not(.responsive-shell) > :not(.mobile-gate)`) but not
  the overflow line, which is unconditional inside the block. So on a real
  phone those pages rendered with the document unscrollable and no scroll
  container anywhere in the gate's 25 rules: everything below the first
  viewport was unreachable.

  No narrow-width test could see it. An iframe 375px wide reports a fine
  pointer, so none of these rules apply inside one — which is exactly why
  the coarse-pointer half had to be verified separately.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every declaration block inside a coarse-pointer media query. */
function coarseBlocks(css) {
  const blocks = [];
  const text = strip(css);
  const marker = /@media\s*\(\s*max-width:\s*820px\s*\)\s*and\s*\(\s*pointer:\s*coarse\s*\)\s*\{/g;
  let match;
  while ((match = marker.exec(text))) {
    let depth = 1, index = marker.lastIndex;
    while (index < text.length && depth > 0) {
      if (text[index] === "{") depth += 1;
      else if (text[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(text.slice(marker.lastIndex, index - 1));
  }
  return blocks;
}

test("no coarse-pointer rule stops the document scrolling", () => {
  for (const file of ["approved-functional.css", "interface-v2.css"]) {
    for (const block of coarseBlocks(read(file))) {
      /* html/body must never be given a hidden overflow here: a page that
         cannot scroll is never the safer default on a phone. */
      const htmlBody = block.match(/(?:^|[},;\s])html\s*,\s*body\s*\{([^}]*)\}/);
      if (htmlBody)
        assert.ok(!/overflow(?:-y)?\s*:\s*hidden/.test(htmlBody[1]),
          `${file}: the coarse-pointer gate makes html/body unscrollable`);
      assert.ok(!/(?:^|[},;\s])body\s*\{[^}]*overflow(?:-y)?\s*:\s*hidden/.test(block),
        `${file}: the coarse-pointer gate makes body unscrollable`);
    }
  }
});

test("the phone-first rules out-specify the desktop ones they must beat", () => {
  /*
    D1680 · Both of these were dead. `.responsive-shell>.topbar` and
    `.responsive-shell>.factory-main` are two classes each — the same
    specificity as `.app-shell>.topbar` and `.app-shell>.factory-main` in
    interface-v2.css, which layout.tsx imports AFTER approved-functional.css.
    On a tie the later sheet wins, so neither ever applied.

    Measured on a real 375px touch device with the shipped stylesheet: the
    topbar rendered 288px wide and 812px tall — the whole desktop rail ahead
    of the content — and .factory-main had no padding, so the page ended
    underneath the global bottom bar.

    A specificity rule rather than a comment, because the failure is
    invisible in either file on its own: each rule reads correctly, and only
    the pair plus the import order is wrong.
  */
  const css = strip(read("approved-functional.css"));
  for (const selector of [
    /\.app-shell\.responsive-shell>\.topbar\{display:none\}/,
    /\.app-shell\.responsive-shell>\.factory-main\{padding:16px 16px 96px\}/,
  ]) assert.match(css, selector,
    "the phone-first rule must carry .app-shell too, or the desktop rule wins");

  /* And the rules it has to beat are still there, unchanged, in the file
     that is imported later. */
  const later = strip(read("interface-v2.css"));
  assert.match(later, /\.app-shell > \.topbar \{/);
  assert.match(later, /\.app-shell > \.factory-main \{/);

  /* The import order this depends on. If it ever flips, the specificity fix
     is still correct — but this records why it was needed. */
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.indexOf('import "./approved-functional.css"')
    < layout.indexOf('import "./interface-v2.css"'),
    "interface-v2.css is imported later, which is why the tie mattered");
});

test("the gate still hides the shell only for the surfaces it owns", () => {
  /* The fix must not have loosened the gate itself. */
  const css = strip(read("approved-functional.css"));
  assert.match(css,
    /\.app-shell:not\(\.responsive-shell\)\s*>\s*:not\(\.mobile-gate\)\s*\{\s*display:\s*none\s*!important\s*\}/,
    "the desktop gate must still replace the Listing Factory on a phone");
  assert.match(css, /\.responsive-shell\s*>\s*\.topbar\s*\{\s*display:\s*none\s*\}/);
});

test("the phone-first surfaces leave room for the bar they navigate with", () => {
  const css = strip(read("approved-functional.css"));
  assert.match(css, /\.app-shell\.responsive-shell>\.factory-main\{padding:16px 16px 96px\}/,
    "content must not end underneath the global bottom bar");
});
