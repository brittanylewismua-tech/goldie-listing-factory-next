import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const history=await readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8");
const factory=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("partial Etsy publication is counted instead of presented as complete",()=>{
  assert.match(history,/const fullyPublished=\(batch:Batch\)=>\{const expected=expectedListings\(batch\);return expected>0&&batch\.published_count>=expected\}/);
  assert.match(history,/`\$\{batch\.published_count\} OF \$\{expected\} PUBLISHED TO ETSY`/);
  assert.match(history,/fullyPublished\(batch\)\?"Open published bundle":"Resume bundle"/);
  assert.match(history,/fullyPublished\(batch\) \? "Open published batch" : "Resume batch"/);
  assert.match(history,/`\$\{member\.published\} of \$\{batch\.design_count\} published`/);
});

test("a bundle member is complete only after every expected listing is published",()=>{
  assert.match(route,/const expected=Math\.max\(Number\(child\.design_count\)\|\|0,drafts\.length\)/);
  assert.match(route,/done:expected>0&&published>=expected/);
  assert.doesNotMatch(route,/done:published>0/);
});

test("opening a partial bundle resumes the first product with listings left",()=>{
  assert.match(route,/expected:Math\.max\(Number\(child\.design_count\)\|\|0,drafts\.length\)/);
  assert.match(factory,/byOrder\.find\(child=>child\.published<Math\.max\(child\.expected,child\.drafts\)\)/);
  assert.doesNotMatch(factory,/byOrder\.find\(child=>child\.published===0\)/);
});
