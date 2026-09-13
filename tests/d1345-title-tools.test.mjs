import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=["interface-v2.css","lilac-theme.css"].map(name=>readFileSync(new URL(`../app/${name}`,import.meta.url),"utf8")).join("\n");
const marker=readFileSync(new URL("../app/build-marker.ts",import.meta.url),"utf8");

test("title options stay visible above the keyword bank",()=>{
  const lead=app.slice(app.indexOf("function titlesLead()"),app.indexOf("function titlesRows("));
  assert.match(lead,/className="title-options-row"><b>Title options<\/b>\{titleFormatControls\(\)\}/);
  assert.ok(lead.indexOf('className="title-options-row"')<lead.indexOf("<KeywordBank compact selectionOnly"));
  assert.doesNotMatch(lead,/<details className="title-builder-options">/);
});

test("the keyword-bank label cannot collapse or clip",()=>{
  assert.match(css,/\.keyword-workspace\.compact-keywords\{\s*grid-template-columns:max-content minmax\(0,1fr\)!important/);
  assert.match(css,/\.keyword-workspace-heading\{\s*min-width:82px;overflow:visible/);
  assert.match(css,/\.title-options-row\{[\s\S]*?display:flex[\s\S]*?flex-wrap:nowrap/);
  assert.match(css,/\.title-options-row \.title-style-toggle>span\{display:none\}/);
  assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.title-options-row\{[^}]*flex-direction:column;flex-wrap:wrap/);
  /* PINNED TO A NUMBER, NOT TO ONE RELEASE.

     This asserted the marker still read the exact release it shipped with, so
     every later bump broke four unrelated suites and the fix was to retype the
     number in each. The guarantee that was wanted is "the marker moved past
     this release and never went backwards", which is a comparison, so it is
     written as one and never needs touching again. */
  const shipped = Number(/BUILD_MARKER = "D(\d+)"/.exec(marker)?.[1]);
  assert.ok(shipped >= 1345, `build marker is D${shipped}, expected D1345 or later`);
});

test("the optional title editor names the task and keeps its chevron beside the label",()=>{
  assert.match(app,/\{titleSetsReady\?"Edit titles and tags":"Create missing titles and tags"\}/);
  assert.match(css,/\.shared-description-settings>summary::after\{content:"";width:7px;height:7px;margin-left:9px/);
  assert.doesNotMatch(css,/\.shared-description-settings>summary::after\{[^}]*margin-left:auto/);
});
