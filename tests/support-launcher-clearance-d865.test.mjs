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

test("D866: workflow support controls track the sticky action bar", () => {
  assert.equal(css.includes(".app-shell ~ .support-root"), false,
    "a sibling selector cannot match SupportChat inside the shell");

  const launcherBottom = desktopDeclarations(
    ".app-shell .support-root .support-launcher", "bottom");
  const videoBottom = desktopDeclarations(
    ".app-shell .support-root .support-video-launcher", "bottom");

  assert.equal(launcherBottom.at(-1), "var(--support-launcher-bottom,86px)");
  assert.equal(videoBottom.at(-1), "var(--support-video-bottom,146px)");

  assert.match(component, /viewportHeight\s*-\s*barTop\s*\+\s*16/,
    "the offset must follow the rendered bar top with a 16px gap");
  assert.match(component, /--support-video-bottom",\s*`\$\{bottom \+ 60\}px`/,
    "the video control must track above the measured help control");
  assert.match(component, /addEventListener\("scroll",\s*measure,\s*true\)/,
    "scrolling any workflow container must update the offset");
  assert.match(component, /addEventListener\("resize",\s*measure\)/,
    "resizing must update the offset");
  assert.match(component, /visibilitychange/,
    "returning to a backgrounded tab must refresh the measurement");
  assert.equal(/requestAnimationFrame\s*\(/.test(component), false,
    "a hidden tab cannot depend on requestAnimationFrame to restore clearance");
});
