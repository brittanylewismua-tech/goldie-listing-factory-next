import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PRINTIFY_MAX_ENABLED_VARIANTS,printifyVariantLimitMessage} from "../app/printify-variant-limit.ts";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const update=await readFile(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8");
const create=await readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
const execute=await readFile(new URL("../app/api/printify/drafts/execute-job.ts",import.meta.url),"utf8");

test("Printify's 100-variant ceiling is explained in plain language",()=>{
  assert.equal(PRINTIFY_MAX_ENABLED_VARIANTS,100);
  assert.equal(printifyVariantLimitMessage(100),"");
  assert.equal(printifyVariantLimitMessage(104),"Printify allows up to 100 color and size combinations on one product. You selected 104. Remove one color or size to continue.");
});

test("the browser rejects an oversized choice before changing or saving it",()=>{
  const sync=app.slice(app.indexOf("function syncDraftVariantChoices"),app.indexOf("async function updateDraftColorArtwork"));
  assert.match(sync,/printifyVariantLimitMessage\(selectedVariants\.length\)/);
  assert.ok(sync.indexOf("if(limitError)")<sync.indexOf("setSelectedColorIds(nextColors)"));
  assert.match(app,/draftVariantLimitError\)issues\.push\(draftVariantLimitError\)/);
});

test("creation and updates reject oversized selections before Printify writes",()=>{
  assert.match(update,/const limitError=printifyVariantLimitMessage\(chosenCount\);[\s\S]*if\(limitError\)return NextResponse\.json/);
  assert.match(create,/printifyVariantLimitMessage\(new Set\(body\.selectedVariantIds\|\|\[\]\)\.size\)/);
  assert.match(execute,/const variantLimitError=printifyVariantLimitMessage\(new Set\(body\.selectedVariantIds\|\|\[\]\)\.size\);[\s\S]*if\(variantLimitError\)throw Error/);
});
