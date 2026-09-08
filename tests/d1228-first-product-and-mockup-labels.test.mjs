import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../app/listing-factory-app.tsx", import.meta.url);

test("D1228: entering Listing from the progress rail opens the first bundle product", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /if\(index===5\|\|index===6\)return enterListingDetails\(\)/);
  assert.match(app, /async function enterListingDetails\(\)\{\s*if\(activeBundle&&bundleRecipes\.length>1&&bundleIndex!==0\)await openBundleProduct\(0\)/);
  assert.match(app, /async function goBackOneStep\(\)[\s\S]*?await enterListingDetails\(\);/);
});

test("D1228: every mockup tile names its color and view to keyboard and screen-reader users", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /const accessibleName=caption\|\|printifyViewName\(src\)\|\|`Printify photo \$\{index\+1\}`/);
  assert.match(app, /aria-label=\{`\$\{selected\?"Deselect":"Select"\} \$\{accessibleName\}`\}/);
  assert.match(app, /aria-label=\{`View \$\{accessibleName\} larger`\}/);
});

test("D1228: a deleted saved keyword bank cannot leave an impossible bundle action", async () => {
  const [app, tools] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(tools, /if\(active&&!current\)\{setActive\(""\);onSelect\?\.\(null\);return\}/);
  assert.match(app, /activeBundle&&bundleRecipes\.length>1&&autoTitleBank&&bundleRecipes\.some/);
  assert.doesNotMatch(app, /activeBundle&&bundleRecipes\.length>1&&autoTitleBankId&&bundleRecipes\.some/);
});

test("D1228: keyword research phrases are not rejected by Etsy's shorter tag limit", async () => {
  const { phrasesFromErank, tagsFromTitle } = await import("../app/seo-utils.ts");
  const phrase = "a descriptive phrase longer than sixty characters that still belongs in an Etsy title";
  assert.deepEqual(phrasesFromErank(phrase), [phrase]);
  assert.deepEqual(tagsFromTitle(phrase), []);
});
