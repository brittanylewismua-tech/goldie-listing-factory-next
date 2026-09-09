import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const wait=await readFile(new URL('../app/wait-progress.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('../app/interface-v2.css',import.meta.url),'utf8');

test('D1218 draft creation only says the tab may close after background admission',()=>{
  assert.match(app,/Preparing every listing for background creation\. Keep this page open\./);
  assert.match(app,/result\.accepted!==requests\.length[\s\S]*setDraftsAdmitted\(true\)/);
  assert.match(app,/Printify is creating the drafts\. You can leave this page and check Batch History anytime\./);
  assert.match(app,/background:draftsAdmitted/);
  assert.match(wait,/background\?:boolean/);
  assert.match(wait,/submitted drafts continue in the background/);
  assert.match(wait,/if\(!active\|\|active\.background\|\|helpOpen/);
});

test('new draft creation begins with artwork while ready product switches stay compact and Listing resets to product one',()=>{
  assert.match(app,/setActiveTask\("placement"\)/);
  assert.match(app,/setActiveTask\(requestedTask\|\|""\)/);
  assert.match(app,/async function enterListingDetails\(\)/);
  assert.match(app,/bundleIndex!==0\)await openBundleProduct\(0\)/);
  assert.match(app,/setActiveDesign\(files\[0\]\?\.id\|\|""\)/);
  assert.match(app,/setBatchToolsOpen\(true\)/);
});

test('D1218 mockup cards have separate large select and enlarge controls',()=>{
  assert.match(app,/className="printify-photo-select" aria-pressed=\{selected\}/);
  assert.match(app,/className="printify-photo-expand"/);
  assert.match(app,/className="printify-photo-selector" aria-hidden="true">\{selected\?<svg/);
  assert.match(css,/\.printify-photo-select\{[^}]*width:100%/);
  assert.match(css,/\.printify-image-option>\.printify-photo-expand\{[^}]*width:36px/);
});

test('D1218 product-wide photo apply is reversible',()=>{
  assert.match(app,/const undoApplyAll=useRef<null\|\(\(\)=>void\)>\(null\)/);
  assert.match(app,/Undo apply to product/);
  assert.match(app,/previousSelections=Object\.fromEntries/);
  assert.match(app,/setPrintifyImageSelections\(previousSelections\)/);
});

test('D1218 one product-wide title action creates validated fallback tags',()=>{
  assert.match(app,/function fallbackTagsFromKeywords/);
  assert.match(app,/completedGeneratedTags\(payload\.tags\|\|\[\],payload\.keywords\|\|\[\],keywords\)/);
  assert.doesNotMatch(app,/function titlesRows[\s\S]{0,5000}<IndividualAutoTitle design=\{design\}/);
  assert.match(app,/Create titles and tags for this product/);
});

test('D1218 listing hierarchy and preparation stay clear and inline',()=>{
  assert.match(app,/className="description-product-heading"/);
  assert.match(app,/className="description-chevron"/);
  assert.match(app,/Preparing Etsy details automatically…/);
  assert.doesNotMatch(app,/data-inline-progress="true"/);
  assert.doesNotMatch(app,/preparingEtsy\?\{title:"Preparing listing details"/);
  assert.match(css,/\.description-product-heading\{[^}]*font-size:18px/);
  assert.match(css,/\.mockup-angle-controls\{[^}]*background:#f7f7f8/);
});
