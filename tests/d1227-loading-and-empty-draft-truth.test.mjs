import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const support=fs.readFileSync(new URL("../app/support-knowledge.ts",import.meta.url),"utf8");

test("D1227: saved connections never flash a false disconnected state while verification runs",()=>{
  assert.match(app,/const checkingConnections=checkingConnection\|\|checkingEtsyConnection/);
  assert.match(app,/checkingConnections\?"Checking saved connections"/);
  assert.match(app,/checkingConnections\?"Verifying the accounts you already connected…"/);
  assert.match(app,/!checkingConnections&&\(!connected\|\|!etsyConnected\)/);
  assert.match(app,/\{checkingConnections \? \(/);
});

test("D1227: an empty or deleted provider batch cannot look ready for Etsy",()=>{
  assert.match(app,/if\(!created\.length\)issues\.push\("Create at least one Printify draft before saving to Etsy\."\)/);
  assert.match(app,/if\(!blockers\.length\)return "Creates unpublished Etsy drafts\. Nothing goes live\."/);
  assert.match(app,/:handoffBlockerSummary\(\)\}<\/span>/);
  assert.match(app,/label:`\$\{createdDraftCount\} \$\{createdDraftCount===1\?"draft":"drafts"\}`/);
  assert.doesNotMatch(app,/complete\?\{label:`\$\{drafts\.length\} \$\{drafts\.length===1\?"draft":"drafts"\}`/);
});

test("D1227: support describes the current automatic Etsy Drafts handoff",()=>{
  const article=support.split('\n').find(line=>line.includes('id:"draft-location"'))||"";
  assert.match(article,/Save to Etsy Drafts/);
  assert.match(article,/Etsy Shop Manager → Listings → Drafts/);
  assert.match(article,/stay unpublished/);
  assert.doesNotMatch(article,/finish the listing in Printify/);
});
