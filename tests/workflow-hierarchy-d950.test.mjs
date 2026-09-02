import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D950: the workflow rail is the only repeated step indicator",()=>{
  assert.match(app,/stepCount=\{workflowStep==="connect"\?<p className="hero-step-count">Account setup · before you start<\/p>:undefined\}/);
  assert.doesNotMatch(app,/stepCount=\{<p className="hero-step-count">`Step/);
});

test("D952: help and management surfaces use the same visual language",()=>{
  const interfaceCss=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
  const managementCss=readFileSync(new URL("../app/management-aesthetic.css",import.meta.url),"utf8");
  const helpLock=interfaceCss.slice(interfaceCss.indexOf("/* D952"));
  const managementLock=managementCss.slice(managementCss.indexOf("/* D951"));
  assert.match(helpLock,/\.context-help-dialog h2\{[\s\S]*?font:750 26px\/1\.15 Inter/);
  assert.match(managementLock,/\.usage-page \.plan-banner\{[\s\S]*?background:#0d0b0c!important/);
  assert.match(managementLock,/\.usage-page \.plan-banner :is\(h2,p,span\)\{color:#fff!important\}/);
});

test("D950: every workflow hero states only the immediate task",()=>{
  for(const copy of [
    "Complete each section from top to bottom.",
    "Review the plan, then create the private drafts.",
    "Finish each listing’s title, tags, and description.",
    "Finish the Etsy details.",
    "Review the batch, then open it in Printify.",
  ]) assert.ok(app.includes(copy),`missing concise workflow copy: ${copy}`);
  assert.doesNotMatch(app,/Confirm colors, sizes, placement, pricing, shipping, and listing photos/);
});
