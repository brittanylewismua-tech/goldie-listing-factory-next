import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const review=fs.readFileSync(new URL('../app/final-listing-review.tsx',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../app/factory-tools.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/lilac-theme.css',import.meta.url),'utf8');

test('the Factory retains exactly Product, Drafts, Listing, Finish',()=>{
  const rail=app.slice(app.indexOf('const RAIL_STAGES'),app.indexOf('const WORKFLOW_HELP'));
  assert.deepEqual([...rail.matchAll(/label:"([^"]+)"/g)].map(match=>match[1]),['Product','Drafts','Listing','Finish']);
  for(const step of [1,2,3,4])assert.ok(app.includes(`STEP ${step} OF 4`));
});

test('created drafts stay in Drafts and restored work preserves its saved place',()=>{
  assert.match(app,/if\(!target\)return canonicalStep\(saved\)/);
  assert.match(app,/if\(!requested\|\|!order.includes\(requested as FinishPhase\)\)return safeSaved/);
  assert.ok((app.match(/setFinishPhase\("details"\);void goToStep\("designs",false,true\)/g)||[]).length===2);
});

test('D1238: listing cards expose exact readiness, price, and direct corrections',()=>{
  for(const text of ['No title yet.','No Etsy tags yet.','Finished cost needs price approval.','No listing photo selected.'])assert.match(review,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(review,/Needs you/);
  assert.match(review,/priceLabel\(draft\)/);
  assert.match(review,/Title & tags/);
  assert.match(review,/Etsy details & personalization/);
  assert.match(review,/Photos & download/);
  assert.match(review,/recipe-product-groups/);
  assert.match(review,/recipe-listing-grid/);
  assert.match(review,/Review prices or shipping/);
  assert.match(review,/No photo selected/);
  assert.match(review,/design\?\.title\|\|`Untitled listing/);
  assert.doesNotMatch(review,/design\?\.title\|\|draft\.title\|\|"Untitled listing"/);
  assert.match(review,/new Map<string,Draft\[\]>\(\)/);
  for(const label of ['Artwork placement','Colors & sizes','Pricing & shipping','Listing photos','Title & tags','Description','Etsy details & personalization'])assert.ok(review.includes(label));
});

test('D1238: product cards identify incomplete recipes and expose Edit product',()=>{
  for(const field of ['defaultProfitTarget','etsyShippingProfileId','printifyImageIndices','description','keywordListId'])assert.match(tools,new RegExp(`recipe\\.${field}`));
  /* D1373 — the card names which of the seven is missing rather than saying
     only "Finish setup", which made a product one field short look identical
     to one never touched. */
  assert.match(tools,/>Finish setup: \{recipeSetupGap\(recipe\)\}</);
  assert.match(tools,/>Edit product</);
  assert.match(css,/recipe-listing-sections/);
});
