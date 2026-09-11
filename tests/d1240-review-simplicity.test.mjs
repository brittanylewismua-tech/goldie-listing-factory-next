import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const review=fs.readFileSync(new URL('../app/final-listing-review.tsx',import.meta.url),'utf8');
const handoff=fs.readFileSync(new URL('../app/photo-delivery-handoff.tsx',import.meta.url),'utf8');
const deliveryRead=fs.readFileSync(new URL('../app/delivery-status-read.ts',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/lilac-theme.css',import.meta.url),'utf8');

test('D1240: Review has one instruction and one primary outcome',()=>{
  assert.match(app,/title: "Review your listings", copy: etsyDraftTransferState==="complete"\?"Your Etsy drafts were created and verified\."/);
  assert.match(app,/etsyDraftTransferState==="working"\?"Your Etsy drafts are being created and checked\.":handoffBlockers\(\)\.length\?"Fix the missing items shown on the listing cards\.":"Everything is ready\. Save the batch to Etsy Drafts\."/);
  assert.doesNotMatch(app,/Choose where to keep these listings/);
  assert.doesNotMatch(app,/<dl className="publish-box-reports">/);
  assert.match(app,/>Open drafts in Printify ↗<\/a>/);
  assert.doesNotMatch(app,/<summary>Other options<\/summary>/);
  assert.match(app,/className="review-etsy-draft-button"/);
  assert.doesNotMatch(app,/FactoryFooter status=\{handoffBlockers/);
  assert.match(app,/workflowStep!=="connect"&&!\(workflowStep==="finish"&&finishPhase==="final"\)/);
});

test('D1251: each listing carries a concise completion map with direct edits',()=>{
  const branch=review.slice(review.indexOf('if(handoffOnly)'),review.indexOf('return <section className={`final-listing-review'));
  assert.match(branch,/<article className=\{`recipe-listing-card/);
  assert.match(branch,/<nav className="recipe-listing-sections" aria-label=/);
  assert.match(branch,/sections\.map\(section=><button type="button"/);
  assert.match(branch,/onRetry\?\.\(draft\.clientId\)/);
  assert.doesNotMatch(branch,/recipe-listing-actions|View in Printify/);
  assert.match(css,/\.recipe-listing-sections>button:focus-visible/);
});

test('D1240: per-listing Etsy controls stay hidden until progress or recovery exists',()=>{
  assert.doesNotMatch(handoff,/Create Etsy draft/);
  assert.match(handoff,/showResults\|\|!statusKnown\|\|busy\?'':'is-empty'/);
  assert.match(handoff,/<details className=\{`draft-handoff-details/);
  assert.match(css,/\.photo-delivery-handoff\.is-empty\{display:none\}/);
  assert.doesNotMatch(deliveryRead,/Sign in to Goldie/);
});
