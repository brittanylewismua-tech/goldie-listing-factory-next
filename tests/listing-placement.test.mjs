/*
  D1682 · A member must be able to see WHY a listing sits where it sits, and
  correct it "without duplicated listings, duplicated money, or orphaned
  overrides". These pin the parts of that which are properties of the code
  rather than of the live shop; the reconciliation against the real shop
  covers the arithmetic.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/* ---------------------------------------- the reason shown to the member */

const dir = mkdtempSync(join(tmpdir(), "placement-"));
/* The module is TypeScript; compile it rather than pattern-strip it. */
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/listing-placement.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const mod = await import(join(dir, "listing-placement.js"));
const { reasonIsMemberSafe, describePlacement,
  GENERIC_REASON, CORRECTED_REASON, UNPLACED_REASON } = mod;

test("machinery in a stored reason is replaced, never shown or edited", () => {
  const leaks = [
    "Confidence: high. This is a feminist slogan tee.",
    '{"primary_niche":"Feminist","secondary":""}',
    "The classifier assigned this to Feminist.",
    "Matched the canonical label Feminist with score 0.92.",
    "The model output listed feminist keywords.",
    "GPT read the title and chose Feminist.",
    "primary_niche = Feminist",
    "Feminist",                       /* not a sentence */
    "ok.",                            /* too short */
    "x".repeat(400) + ".",            /* not a sentence a person wrote */
  ];
  for (const leak of leaks) {
    assert.equal(reasonIsMemberSafe(leak), false, `passed through: ${leak.slice(0, 60)}`);
    const shown = describePlacement({ listingId: 1, title: "t", nicheId: "niche:feminist",
      nicheLabel: "Feminist", corrected: false, storedReason: leak }).why;
    assert.equal(shown, GENERIC_REASON,
      "a refused reason must be replaced whole, not trimmed or quoted");
    /* The refused text must not survive in any part of what is shown. */
    assert.ok(!shown.includes(leak.slice(0, 20)), "fragment of a refused reason leaked");
  }
});

test("a reason a shop owner would recognise is shown as written", () => {
  const good = "The title and tags describe feminist slogans, which is what "
    + "the other listings in this niche are.";
  assert.equal(reasonIsMemberSafe(good), true);
  assert.equal(describePlacement({ listingId: 1, title: "t", nicheId: "niche:feminist",
    nicheLabel: "Feminist", corrected: false, storedReason: good }).why, good);
});

test("a member's own correction is described as theirs, not as a judgement", () => {
  const out = describePlacement({ listingId: 1, title: "t", nicheId: "niche:feminist",
    nicheLabel: "Feminist", corrected: true,
    storedReason: "The classifier said Feminist." });
  assert.equal(out.why, CORRECTED_REASON);
  assert.ok(!/classif/i.test(out.why));
});

test("an unplaced listing says so instead of naming a niche", () => {
  const out = describePlacement({ listingId: 1, title: "t", nicheId: "",
    nicheLabel: "", corrected: false, storedReason: "" });
  assert.equal(out.nicheId, "unclassified");
  assert.equal(out.nicheLabel, "Unclassified");
  assert.equal(out.why, UNPLACED_REASON);
});

test("no reason shown to a member carries machinery vocabulary", () => {
  for (const sentence of [GENERIC_REASON, CORRECTED_REASON, UNPLACED_REASON])
    assert.ok(!/classif|confidence|model|prompt|token|label|score|canonical/i.test(sentence),
      `machinery in a shipped sentence: ${sentence}`);
});

/* ------------------------------------- no duplicated listings or money */

test("one override per listing is structural, so a correction cannot duplicate one", () => {
  const schema = src("../app/shop-map-listings.ts");
  const table = schema.slice(schema.indexOf("shop_map_world_overrides"));
  assert.match(table.slice(0, 700), /PRIMARY KEY\s*\(\s*user_id,\s*shop_id,\s*listing_id\s*\)/,
    "without this key a second correction would add a row rather than replace one");
});

test("a correction replaces the previous one rather than adding to it", () => {
  const route = src("../app/api/shop-map/correct/route.ts");
  const move = route.slice(route.indexOf('case "move-listing"'),
    route.indexOf('case "rename-world"'));
  assert.match(move, /ON CONFLICT\(user_id, shop_id, listing_id\) DO UPDATE SET/);
  assert.match(move, /world_ids = excluded\.world_ids/);
});

test("a listing carries its money in exactly one niche", () => {
  const worlds = src("../app/shop-map-worlds.ts");
  /* The type states it; this pins the statement so a later change is seen. */
  assert.match(worlds, /Exactly one, or none\. Everything financial is summed from this\./);
  assert.match(worlds,
    /Carries no orders, revenue, profit or reviews\./,
    "a secondary niche must never be a second home for the same money");
});

test("a correction for a listing this shop does not have is refused", () => {
  const route = src("../app/api/shop-map/correct/route.ts");
  const move = route.slice(route.indexOf('case "move-listing"'),
    route.indexOf('case "rename-world"'));
  const owns = move.indexOf("FROM shop_map_listings");
  const write = move.indexOf("INSERT INTO shop_map_world_overrides");
  assert.ok(owns > -1 && write > owns,
    "the ownership check must run before the write, or an override is created "
    + "for a listing that does not exist — an orphan, reported as success");
  assert.match(move, /status: 404/);
});

/* ---------------------------------------- the lookup cannot drift from the map */

test("placement is answered by the map itself, not by a second pipeline", () => {
  const client = src("../app/shop-map/shop-map-client.tsx");
  assert.match(client, /fetch\(`\/api\/shop-map\/map\?listingId=/,
    "a separate placement endpoint could disagree with the map it explains");
  const map = src("../app/api/shop-map/map/route.ts");
  assert.match(map, /worlds\.find\(row => row\.listingIds\.includes\(asked\)\)/,
    "the niche reported must be read out of the same worlds the page renders");
});

test("a listing not in the shop is reported as absent, not as unclassified", () => {
  const client = src("../app/shop-map/shop-map-client.tsx");
  assert.match(client, /is not in this shop's map/);
  const map = src("../app/api/shop-map/map/route.ts");
  assert.match(map, /return known \? \{ world \} : null;/);
});

test("a classified listing is not described back as the member's correction", () => {
  const map = src("../app/api/shop-map/map/route.ts");
  const captured = map.indexOf("const correctedIds = new Set(overrides.keys())");
  const classifierWrites = map.indexOf("overrides.set(listingId, [`niche:");
  assert.ok(captured > -1 && classifierWrites > captured,
    "correctedIds must be taken before the classifier loop writes into overrides");
});
