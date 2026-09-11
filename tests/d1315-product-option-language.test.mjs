import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { productOptionAxis } from "../app/product-type-utils.ts";
import { draftStageLabel } from "../app/draft-task-stages.ts";
import { printSideSummary, productPrintSideLabel, productPrintSideSummary } from "../app/print-sides.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("apparel keeps size language while non-apparel uses product options", () => {
  assert.deepEqual(productOptionAxis("Unisex Heavy Cotton Tee"), {
    label: "Sizes",
    choice: "size",
    choose: "Choose sizes",
    aria: "Choose sizes for Unisex Heavy Cotton Tee",
  });
  assert.deepEqual(productOptionAxis("Tough Phone Cases"), {
    label: "Product options",
    choice: "option",
    choose: "Choose product options",
    aria: "Choose product options for Tough Phone Cases",
  });
  assert.equal(productOptionAxis("Mug 11oz").label, "Product options");
});

test("the guided stage names non-apparel options truthfully", () => {
  assert.equal(draftStageLabel("design", ["placement", "draft-sizes"]), "Artwork & sizes");
  assert.equal(draftStageLabel("design", ["placement", "draft-sizes"], "product options"), "Artwork & product options");
  assert.equal(draftStageLabel("design", ["placement", "draft-colors", "draft-sizes"], "product options"), "Artwork, colors & product options");
});

test("review rows and blockers share the product-aware wording", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const optionAxis=productOptionAxis\(rowProduct\?\.blueprintTitle\|\|recipe\.name\)/);
  assert.match(app, /\{label:optionAxis\.label,value:rowSizes\.length\?plural\(rowSizes\.length,optionAxis\.choice\):optionAxis\.choose/);
  assert.match(app, /else if\(missingSizes\)issues\.push\(`\$\{optionAxis\.choose\} for this batch\.`\)/);
  assert.doesNotMatch(app, /Choose at least one product size for this batch/);
});

test("pricing exposes each product-option label as one readable phrase", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const optionNounsLabel=`\$\{optionNouns\[0\]\.toUpperCase\(\)\}\$\{optionNouns\.slice\(1\)\}`/);
  assert.match(app, /<p>\{optionNounsLabel\} with the same Printify product cost/);
  assert.doesNotMatch(app, /\{optionNouns\[0\]\.toUpperCase\(\)\}\{optionNouns\.slice\(1\)\}/);
});

test("long option catalogs keep selected choices visible and collapse the rest", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const selectedOptions=sizes\.filter\(size=>selectedSet\.has\(size\.id\)\),availableToAdd=sizes\.filter\(size=>!selectedSet\.has\(size\.id\)\)/);
  assert.match(app, /<details className="size-choice-more" open=\{!selectedOptions\.length\}>/);
  assert.match(app, /<summary>Add more \{axis\.label\.toLowerCase\(\)\}/);
  assert.match(app, /availableToAdd\.map\(size=>/);
});

test("front, back, and multi-side templates are named in review", async () => {
  assert.equal(printSideSummary(["back"]), "Back print");
  assert.equal(printSideSummary(["back", "front"]), "Front + Back prints");
  assert.equal(printSideSummary(["back"], "artwork"), "Back artwork");
  assert.equal(productPrintSideSummary(["front"], "print", "Tough Phone Cases"), "Main print");
  assert.equal(productPrintSideSummary(["front"], "artwork", "Mug 11oz"), "Main artwork");
  assert.equal(productPrintSideSummary(["front"], "print", "Unisex Heavy Cotton Tee"), "Front print");
  assert.equal(productPrintSideLabel("wrap", "Mug 11oz"), "Wrap");
  const app = await read("app/listing-factory-app.tsx");
  const review = await read("app/final-listing-review.tsx");
  assert.match(app, /productPrintSideSummary\(printSides\.length\?printSides:templateDetails\?\.printPositions,"artwork",templateDetails\?\.blueprintTitle/);
  assert.match(review, /detail:productPrintSideSummary\(draft\.artworkSummary\?Object\.keys\(draft\.artworkSummary\):printSides,"print",draft\.productName\|\|productName\)\|\|"Printify draft ready"/);
  assert.match(review, /productPrintSideLabel\(side,draft\.productName\|\|productName\)/);
});
