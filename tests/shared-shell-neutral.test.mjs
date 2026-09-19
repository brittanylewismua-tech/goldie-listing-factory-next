/* The suite name is chosen. These checks keep the frame unified and prevent
   Listing Factory from drifting back into the role of umbrella identity. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = new URL("../app/", import.meta.url).pathname;
const read = name => readFileSync(join(APP, name), "utf8");

test("every desktop shell renders the one Goldie Suite brand", () => {
  const shell = read("factory-shell.tsx");
  const workflow = read("listing-factory-app.tsx");
  const brand = read("suite-brand.tsx");
  assert.match(shell, /<SuiteBrand\s*\/>/);
  assert.match(workflow, /<SuiteBrand\s*\/>/);
  assert.match(brand, /aria-label="Goldie Suite home"/);
  assert.match(brand, />goldie <em>suite<\/em></);
  assert.equal((shell.match(/<SuiteBrand\s*\/>/g) ?? []).length, 1);
  assert.equal((workflow.match(/<SuiteBrand\s*\/>/g) ?? []).length, 1);
});

test("the command center exposes every member feature from one nav", () => {
  const shell = read("factory-shell.tsx");
  for (const destination of ["Home", "Listing Factory", "Market Watch", "Design Scanner",
    "Shop Map", "Trademark Checker", "Batch History", "Keyword Banks", "Tools & settings"])
    assert.ok(shell.includes(`label: "${destination}"`), `${destination} is missing from the suite navigation`);
  assert.match(shell, /Command center/);
  assert.match(shell, /Library &amp; settings/);
});

test("browser and installed-app identity use the chosen suite name", () => {
  const identity = read("shell-identity.ts");
  assert.match(identity, /NEUTRAL_FALLBACK_TITLE = "Goldie Suite"/);
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Goldie Suite");
  assert.equal(manifest.short_name, "Goldie");
});

test("Listing Factory remains a feature, not the suite identity", () => {
  const brand = read("suite-brand.tsx");
  const shell = read("factory-shell.tsx");
  assert.doesNotMatch(brand, /Listing Factory/i);
  assert.match(shell, /label: "Listing Factory"/);
});
