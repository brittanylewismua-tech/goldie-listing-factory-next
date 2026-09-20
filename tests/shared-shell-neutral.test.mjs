/* The suite name is chosen. These checks keep the frame unified and prevent
   Listing Factory from drifting back into the role of umbrella identity. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = new URL("../app/", import.meta.url).pathname;
const read = name => readFileSync(join(APP, name), "utf8");

/* Comments record what a string used to be; only what renders is the test. */
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("every desktop shell renders the one home link, and it names no product", () => {
  const shell = read("factory-shell.tsx");
  const workflow = read("listing-factory-app.tsx");
  const brand = read("suite-brand.tsx");
  assert.match(shell, /<SuiteBrand\s*\/>/);
  assert.match(workflow, /<SuiteBrand\s*\/>/);
  /* Goldie is not this product's name. The lockup is the way back to Home and
     carries no wordmark at all — a placeholder is how a stand-in becomes
     permanent, and "seller command center" was printed here, in the rail's
     first group heading, and on the home page's eyebrow all at once. */
  assert.match(brand, /aria-label="Home"/);
  assert.doesNotMatch(strip(brand), /goldie|suite<|command center/i);
  assert.equal((shell.match(/<SuiteBrand\s*\/>/g) ?? []).length, 1);
  assert.equal((workflow.match(/<SuiteBrand\s*\/>/g) ?? []).length, 1);
});

test("one nav exposes every member feature", () => {
  const shell = read("factory-shell.tsx");
  for (const destination of ["Home", "Listing Factory", "Market Watch", "Design Scanner",
    "Shop Map", "Trademark Checker", "Batch History", "Keyword Banks"])
    assert.ok(shell.includes(`label: "${destination}"`), `${destination} is missing from the suite navigation`);
  const nav = read("suite-sidebar-nav.tsx");
  assert.match(nav, />Command Center</);
  assert.match(nav, /aria-expanded=\{factoryOpen\}/);
  assert.match(nav, /Join the membership to access \{lockedTool\}/);
  assert.match(nav, /\$47\/month membership/);
  assert.match(nav, /commandCenterAccess === false/);
  const access = read("api/access/status/route.ts");
  assert.match(access, /gate\(user, "marketWatch"\)/,
    "the sidebar lock must come from the Full Suite entitlement gate");
});

test("browser and installed-app identity name no product that does not exist", () => {
  const identity = read("shell-identity.ts");
  /* The file's own instruction was a plain description rather than a name;
     the value was "Goldie Suite" anyway. */
  assert.doesNotMatch(strip(identity), /Goldie/i);
  assert.match(identity, /NEUTRAL_FALLBACK_TITLE = "[^"]+"/);
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  for (const value of [manifest.name, manifest.short_name, manifest.description])
    assert.doesNotMatch(String(value), /goldie/i);
  /* Etsy's API terms: the app may not present itself as Etsy's. */
  assert.match(String(manifest.description), /Not endorsed or certified by Etsy/);
});

test("Listing Factory remains a feature, not the suite identity", () => {
  const brand = read("suite-brand.tsx");
  const shell = read("factory-shell.tsx");
  assert.doesNotMatch(brand, /Listing Factory/i);
  assert.match(shell, /label: "Listing Factory"/);
});
