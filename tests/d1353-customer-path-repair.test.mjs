import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("D1353: a failed automatic title keeps its exact listing-level reason",()=>{
  const app=read("app/listing-factory-app.tsx");
  assert.match(app,/title-listing-error" role="alert">\{design\.titleError\}/);
  assert.match(app,/updateDesign\(item\.design\.id,\{titleError:item\.error,titleWarning:""\}\)/);
  assert.match(app,/Choose a different keyword bank or write the \$\{failed===1\?"affected title":"affected titles"\} below/);
  assert.doesNotMatch(app,/each affected listing explains why below/);
});

test("D1353: changing banks clears stale failure UI and the selection belongs to this batch",()=>{
  const app=read("app/listing-factory-app.tsx");
  assert.match(app,/function chooseAutoTitleBank\(list:KeywordList\|null\)\{setAutoTitleBank\(list\);setAutoTitleBankId\(list\?\.id\|\|""\);setTitleBuildMessage\(""\);setFiles/);
  assert.match(app,/<KeywordBank compact selectionOnly initialId=\{autoTitleBankId\} onSelect=\{chooseAutoTitleBank\}/);
  assert.doesNotMatch(app,/<KeywordBank compact selectionOnly initialId=\{autoTitleBankId\|\|activeRecipe\?\.keywordListId/);
  assert.match(app,/const id=autoTitleBankId;[\s\S]{0,500}\},\[autoTitleBankId\]\);/);
  assert.doesNotMatch(app,/onSelect=\{list=>\{setAutoTitleBank\(list\);setAutoTitleBankId[\s\S]{0,250}establish\(activeRecipe,\{keywordListId/);
});

test("D1353: KeywordBank initialization cannot loop on a new callback identity",()=>{
  const tools=read("app/factory-tools.tsx");
  assert.match(tools,/const onSelectRef=useRef\(onSelect\)/);
  assert.match(tools,/onSelectRef\.current\?\.\(initial\)/);
  assert.match(tools,/\},\[lists,initialId,active\]\);/);
  assert.doesNotMatch(tools,/\[lists,initialId,active,onSelect\]/);
});

test("D1353: resumed Review previews reject placeholders and fall through to Printify images",()=>{
  const review=read("app/final-listing-review.tsx");
  assert.match(review,/\^\(\?:https\?:\\\/\\\/\|blob:\|data:image\\\/\|\\\/\)/);
  assert.match(review,/function ReviewPreviewImage/);
  assert.match(review,/onError=\{\(\)=>setIndex\(current=>current\+1\)\}/);
  assert.match(review,/previewSources\(covers\[draft\.id\|\|""\],draft\.previewUrl,draft\.printifyImages,design\?\.previewUrl\)/);
});

test("D1353: build marker advances",()=>{
  /* PINNED TO A NUMBER, NOT TO ONE RELEASE.

     This asserted the marker still read the exact release it shipped with, so
     every later bump broke four unrelated suites and the fix was to retype the
     number in each. The guarantee that was wanted is "the marker moved past
     this release and never went backwards", which is a comparison, so it is
     written as one and never needs touching again. */
  const shipped = Number(/BUILD_MARKER = "D(\d+)"/.exec(read("app/build-marker.ts"))?.[1]);
  assert.ok(shipped >= 1353, `build marker is D${shipped}, expected D1353 or later`);
});
