/*
  `who_made: "i_did"` ON A PRINT-ON-DEMAND LISTING.

  The delivery path has always forced `someone_else` / `made_to_order` /
  `is_supply: false` and repaired any draft that disagreed. The Listing
  Factory dry run built its own payload and answered `i_did` — the claim that
  the shirt was made by hand in this shop. Both builders were internally
  consistent; they simply never had to agree with each other, and the seven
  blueprint dry run was the first thing to assemble a whole payload and show
  the contradiction.

  This asserts the single source of truth is the only source: nothing in the
  application may spell these three answers itself.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../app/", import.meta.url).pathname;
const SOURCE = join(ROOT, "pod-listing-fields.ts");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

test("the print-on-demand listing fields have one definition", () => {
  const text = readFileSync(SOURCE, "utf8");
  assert.match(text, /who_made: "someone_else"/);
  assert.match(text, /when_made: "made_to_order"/);
  assert.match(text, /is_supply: false/);
});

test("nothing claims the member made a print-on-demand item by hand", () => {
    /*
    ONE EXEMPTION, WRITTEN DOWN RATHER THAN ASSUMED.

    `shop-map/image-id-test` creates a throwaway DIGITAL DOWNLOAD listing to
    prove the image upload endpoint works. It is not a print-on-demand
    product, it is never published, it is deleted immediately, and "i_did" is
    the truthful answer for a file Goldie itself generated.
  */
  const EXEMPT = new Set([
    "api/shop-map/image-id-test/route.ts",
    /* The definition file names the bug in prose so it stays explained. */
    "pod-listing-fields.ts",
  ]);
  const offenders = [];
  for (const file of walk(ROOT)) {
    if (EXEMPT.has(file.slice(ROOT.length))) continue;
    const text = readFileSync(file, "utf8");
    /* Reading a value back off an Etsy response is fine; asserting it is not. */
    if (/who_made\s*[:=]\s*['"]i_did['"]/.test(text))
      offenders.push(file.slice(ROOT.length));
  }
  assert.deepEqual(offenders, [],
    `these build a listing payload claiming "i_did": ${offenders.join(", ")}`);
});

test("the delivery path still forces the same three answers", () => {
  const service = readFileSync(join(ROOT, "api/listing-photos/delivery/service.ts"), "utf8");
  /* If this repair ever changes, the shared constant must change with it. */
  assert.match(service, /who_made:\s*'someone_else'/);
  assert.match(service, /when_made:\s*'made_to_order'/);
  assert.match(service, /is_supply:\s*false/);
});
