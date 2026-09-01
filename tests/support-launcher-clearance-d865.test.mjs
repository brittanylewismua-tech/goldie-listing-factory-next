import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import postcss from "postcss";

const css = fs.readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const component = fs.readFileSync(new URL("../app/support-chat.tsx", import.meta.url), "utf8");
const root = postcss.parse(css);

function desktopDeclarations(selector, property) {
  const values = [];
  root.walkRules((rule) => {
    if (!rule.selectors?.includes(selector)) return;
    let parent = rule.parent;
    let applies = true;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media") {
        const query = parent.params.replaceAll(" ", "");
        if (query.includes("max-width:820px")) applies = false;
      }
      parent = parent.parent;
    }
    if (!applies) return;
    rule.walkDecls(property, (decl) => values.push(decl.value));
  });
  return values;
}

test("D867: workflow support controls track the sticky action bar", () => {
  assert.equal(css.includes(".app-shell ~ .support-root"), false,
    "a sibling selector cannot match SupportChat inside the shell");

  const launcherBottom = desktopDeclarations(
    ".app-shell .support-root .support-launcher", "bottom");
  const videoBottom = desktopDeclarations(
    ".app-shell .support-root .support-video-launcher", "bottom");

  assert.equal(launcherBottom.at(-1), "calc(var(--goldie-launcher-lift, 70px) + 16px)");
  assert.equal(videoBottom.at(-1), "calc(var(--goldie-launcher-lift, 70px) + 76px)");

  assert.match(component, /viewportHeight\s*-\s*barTop/,
    "the lift must follow the rendered bar top");
  assert.match(component, /document\.documentElement/,
    "the measurement must be published where the CSS can always inherit it");
  assert.match(component, /setProperty\("--goldie-launcher-lift"/,
    "the effect and stylesheet must share one observable property");
  assert.match(component, /querySelector<HTMLElement>\("\.factory-main"\)/,
    "the listener must attach to the element that actually scrolls");
  assert.match(component, /scroller\?\.addEventListener\("scroll",\s*measure\)/,
    "scrolling the workflow must update the lift synchronously");
  assert.match(component, /addEventListener\("resize",\s*measure\)/,
    "resizing must update the offset");
  assert.match(component, /visibilitychange/,
    "returning to a backgrounded tab must refresh the measurement");
  assert.equal(/requestAnimationFrame\s*\(/.test(component), false,
    "a hidden tab cannot depend on requestAnimationFrame to restore clearance");
});
