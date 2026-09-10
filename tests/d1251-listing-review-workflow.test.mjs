import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const theme=readFileSync(new URL("../app/lilac-theme.css",import.meta.url),"utf8");
const interfaceCss=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1251: Review reports readiness from saved listing data",()=>{
  assert.match(review,/etsyIssue=etsyDetailsIssue\?\.\(draft\)\?\?/);
  assert.match(review,/Boolean\(design\?\.etsy\?\.category\?\.trim\(\)\)/);
  assert.match(review,/etsyReady=!etsyIssue/);
  assert.match(review,/descriptionReady=Boolean\(String\(design\?\.descriptionOverride\?\?draft\.description/);
  assert.match(review,/variants=Number\(draft\.selectedVariantIds\?\.length\|\|draft\.costReview\?\.variants\.filter/);
  assert.match(review,/section\.ready\?"✓":"×"/);
  assert.match(review,/pricingAndShippingReady\?\.\(draft\)/);
});

test("D1251: all Review rows route directly into the matching editor",()=>{
  for(const pair of [["artwork","Artwork placement"],["variants","Colors & sizes"],["pricing","Pricing & shipping"],["photos","Listing photos"]]){
    assert.ok(review.includes(`label:"${pair[1]}"`));
    assert.ok(review.includes(`onEditProduct?.("${pair[0]}",draft)`));
  }
  for(const pair of [["title","Title & tags"],["description","Description"],["etsy","Etsy details & personalization"]]){
    assert.ok(review.includes(`label:"${pair[1]}"`));
    assert.ok(review.includes(`onEdit("${pair[0]}",draft)`));
  }
});

test("D1251: the listing editor keeps every section and Review return visible",()=>{
  for(const label of ["Artwork placement","Colors & sizes","Pricing & shipping","Listing photos","Title & tags","Description","Etsy details & personalization"]){
    assert.ok(app.includes(`label:"${label}"`));
  }
  assert.match(app,/className="review-listing-editor-nav"/);
  assert.match(app,/Back to Review<\/button>/);
  assert.match(app,/if\(reviewEditing\)\{setReviewEditing\(null\);openFinishedReview\(false\);return\}/);
  assert.match(app,/window\.setTimeout\(scrollFactoryToTop,300\)/);
  assert.match(app,/target\.phase==="description"\|\|target\.phase==="etsy"\|\|target\.phase==="title"/);
  assert.match(app,/visibleListings=reviewEditing\?listings\.filter/);
  assert.match(app,/position:reviewEditing\?\{index:listings\.findIndex/);
  assert.match(readFileSync(new URL("..\/app\/listing-rows.tsx",import.meta.url),"utf8"),/position=row\.position\|\|\{index:index\+1,total:rows\.length\}/);
});

test("D1258: Etsy handoff readiness checks every listing, independent of retired publish selection",()=>{
  const handoff=app.slice(app.indexOf("function handoffBlockers()"),app.indexOf("function suggestedBatchName()"));
  assert.match(handoff,/for\(const draft of drafts\)/);
  assert.match(handoff,/if\(draft\.status!=="Created"\|\|!draft\.id\)/);
  assert.match(handoff,/issues\.push\(\.\.\.handoffListingProblems\(draft\)\)/);
  assert.doesNotMatch(handoff,/publishBlockers\(\)/);
  for(const check of ["needs a title","needs Etsy tags","needs a description","needs its Etsy category and required details","needs its personalization settings completed"]){
    assert.ok(handoff.includes(check),`missing handoff check: ${check}`);
  }
  assert.match(app,/handoffReadyCount\(\)\} of \$\{bundlePublishDrafts\(\)\.length\} listings ready/);
});

test("D1258: incomplete Review rows are requirements, not empty checkboxes or duplicate card warnings",()=>{
  const branch=review.slice(review.indexOf("if(handoffOnly)"),review.indexOf("return <section className={`final-listing-review"));
  assert.match(branch,/sections\.find\(section=>!section\.ready\)\?\.detail/);
  assert.match(branch,/section\.ready\?"is-complete":"is-incomplete"/);
  assert.match(branch,/section\.ready\?"✓":"×"/);
  assert.match(branch,/\{!issue&&<strong className="ready">✓ Ready<\/strong>\}/);
  assert.doesNotMatch(branch,/<strong className=\{issue\?"needs-attention":"ready"\}>/);
  assert.match(theme,/\.recipe-listing-sections>button>span\.is-incomplete\{color:#a52f3b;background:#fff\}/);
});

test("post-draft size editing names its listing scope truthfully",()=>{
  assert.match(app,/scope\?:"product"\|"listing"/);
  assert.match(app,/scope==="listing"\?"Changes apply only to this listing\."/);
  assert.match(app,/scope==="listing"\?\(remembering\?"Saving listing…":"✓ Saved to this listing"\)/);
  assert.match(app,/inCard scope="listing"/);
});

test("Review uses singular variant grammar for one-option products",()=>{
  const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
  assert.match(review,/variants===1\?"variant":"variants"/);
});

test("Review editing identifies the current listing instead of repeating the overview",()=>{
  assert.match(app,/editingAllListingDetails\?`\$\{files\.length\} \$\{files\.length===1\?"listing":"listings"\}`:`Listing \$\{Math\.max\(1,files\.findIndex/);
  assert.match(app,/reviewEditing\?\.section==="title"[\s\S]*?title:"Edit titles and tags"/);
  assert.match(app,/reviewEditing\?\.section==="description"[\s\S]*?title:"Edit descriptions"/);
  assert.match(app,/title:"Edit this listing",copy:"Update any section below, then return to Review\."/);
  assert.match(app,/finish: finishPhase==="details" \? reviewEditorHero/);
  assert.match(app,/>Continue to listing details <span/);
  assert.match(app,/reviewEditing\?<button className="workflow-back"[^>]+onClick=\{\(\)=>openFinishedReview\(false\)\}/);
  assert.match(app,/complete && workflowStep==="designs" && <div className="workflow-footer-actions post-draft-footer">\{reviewEditing\?<button/);
  assert.match(app,/if\(reviewEditing\)\{setReviewEditing\(null\);openFinishedReview\(false\);return\}/);
});

test("Review editors expose one unambiguous return and truthful save state",()=>{
  assert.equal((app.match(/Back to Review<\/button>/g)||[]).length,2);
  assert.match(app,/const grouped=workflowStep==="designs"&&!reviewEditing/);
  assert.match(app,/reviewEditing\.section==="variants"\?\["draft-colors","draft-sizes"\]/);
  assert.match(app,/reviewEditing\.section==="pricing"\?\["draft-pricing","draft-shipping"\]/);
  assert.match(app,/if\(reviewTasks&&\(!row\.task\|\|!reviewTasks\.has\(row\.task\)\)\)return null/);
  assert.match(app,/reviewTasks\?reviewTasks\.has\(row\.task\):grouped\?row\.task===effectiveTask/);
  assert.match(app,/footerActions=\{rowOpen&&workflowStep==="designs"&&!reviewEditing/);
  assert.match(app,/onToggle=\{row\.report\|\|reviewEditing\?undefined:/);
  assert.match(app,/\{!reviewEditing&&<FactoryFooter status=\{imagesStepIssues\(\)\.length/);
  assert.match(app,/batchAuthenticationRequired\?"Sign in to save":batchSaveConflict\?"Saving paused":batchHeldByAnotherTab\?"Saving paused in this tab":"Saved automatically"/);
});

test("Etsy and personalization rows cannot show ready while personalization blocks handoff",()=>{
  const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
  assert.match(review,/etsyDetailsIssue\?:\(draft:Draft\)=>string/);
  assert.match(review,/etsyIssue=etsyDetailsIssue\?\.\(draft\)/);
  assert.match(review,/detail:etsyReady\?"Etsy details ready":etsyIssue/);
  assert.match(app,/etsyDetailsIssue=\{draft=>/);
  assert.match(app,/return personalizationProblem\(design\?\.etsy\)/);
});

test("Etsy readiness requires a category as well as required property values",()=>{
  assert.match(app,/if\(!etsy\?\.category\?\.trim\(\)\)return false/);
  assert.match(app,/!etsy\.category\?\.trim\(\)\?\["Etsy category"\]/);
  assert.match(app,/if\(!etsyRequiredComplete\(design\?\.etsy\)\)issues\.push\(`/);
});

test("Review uses exact section names and exposes Printify drafts without a vague disclosure",()=>{
  assert.match(app,/\{key:"etsy",label:"Etsy details & personalization",done:/);
  assert.match(app,/>Open drafts in Printify ↗<\/a>/);
  assert.doesNotMatch(app,/<summary>Other options<\/summary>/);
  assert.match(app,/label\.startsWith\("Etsy "\)\?rows\[rowIndex\+1\]\.label/);
});

test("D1251: the completion map and sticky editor navigation remain usable on narrow screens",()=>{
  assert.match(theme,/\.recipe-listing-sections>button:focus-visible/);
  assert.match(theme,/@media\(max-width:560px\)[\s\S]*?\.recipe-listing-sections>button/);
  assert.match(interfaceCss,/\.review-listing-editor-nav\{position:sticky/);
  assert.match(interfaceCss,/@media\(max-width:620px\)[\s\S]*?\.review-section-switcher\{grid-template-columns:1fr 1fr\}/);
});

test("D1252: Review color and size edits target the selected listing",()=>{
  assert.match(app,/function syncDraftVariantChoices\(nextColors:number\[\],nextSizes:number\[\],targetDraft\?:DraftResult\)/);
  assert.match(app,/const created=targetDraft\?\.id\?\[targetDraft\]:drafts\.filter/);
  assert.match(app,/shown=focused\?\[focused\]:drafts\.filter/);
  assert.match(app,/onChange=\{\(draft,ids\)=>void syncDraftVariantChoices\(ids,draftVariantAxes\(draft\)\.sizes,draft\)\}/);
  assert.match(app,/onChange=\{ids=>void syncDraftVariantChoices\(axes\.colors,ids,focused\)\}/);
  assert.doesNotMatch(app,/A choice applies to every design draft/);
});

test("D1253: a listing editor request survives switching bundle products",()=>{
  assert.match(app,/setReviewEdit\(\{phase:stage,id:target\.id,clientId:target\.clientId\}\)/);
  assert.match(app,/if\(index>=0&&index!==bundleIndex\)openBundleProduct\(index\)/);
  assert.match(app,/else if\(target\.phase==="variants"\)\{setActiveTask\("draft-colors"\);goToStep\("designs",false,true\)\}/);
  assert.match(app,/else if\(target\.phase==="artwork"\)\{setActiveTask\("placement"\);goToStep\("designs",false,true\)\}/);
});
