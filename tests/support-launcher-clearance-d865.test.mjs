import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import postcss from "postcss";

const css = fs.readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
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

test("D865: workflow support controls clear the sticky action bar", () => {
  assert.equal(css.includes(".app-shell ~ .support-root"), false,
    "a sibling selector cannot match SupportChat inside the shell");

  const launcherBottom = desktopDeclarations(
    ".app-shell .support-root .support-launcher", "bottom");
  const videoBottom = desktopDeclarations(
    ".app-shell .support-root .support-video-launcher", "bottom");

  assert.equal(launcherBottom.at(-1), "86px");
  assert.equal(videoBottom.at(-1), "146px");

  const actionBarHeight = 70;
  const requiredGap = 16;
  assert.ok(Number.parseFloat(launcherBottom.at(-1)) >= actionBarHeight + requiredGap,
    "the help launcher must clear the 70px bar by at least 16px");
  assert.ok(Number.parseFloat(videoBottom.at(-1)) > Number.parseFloat(launcherBottom.at(-1)),
    "the video launcher must remain above the help launcher");
});
