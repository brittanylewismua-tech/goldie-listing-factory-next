import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const appUrl=new URL("../app/listing-factory-app.tsx",import.meta.url);
const cssUrl=new URL("../app/interface-v2.css",import.meta.url);

test("D1347: automatic title creation uses inline truthful progress",async()=>{
  const [app,css]=await Promise.all([readFile(appUrl,"utf8"),readFile(cssUrl,"utf8")]);
  const titles=app.slice(app.indexOf("function titlesLead()"),app.indexOf("function titlesRows",app.indexOf("function titlesLead()")));
  assert.match(titles,/titleBuilding&&<div className={`title-generation-progress/);
  assert.match(titles,/titleBuildProgress\.completed} of {titleBuildProgress\.total}/);
  assert.match(titles,/role="progressbar"/);
  assert.match(titles,/aria-valuenow={titleBuildProgress\.completed}/);
  assert.match(titles,/titleBuildProgress\.completed===0\?"Starting…"/);
  assert.match(css,/\.title-generation-progress\.is-starting \.title-generation-progress-track::after/);
});

test("D1347: title creation no longer opens the global wait popup",async()=>{
  const app=await readFile(appUrl,"utf8");
  const wait=app.slice(app.indexOf("<WaitProgress observeTools"),app.indexOf("{/* D721 · Top bar",app.indexOf("<WaitProgress observeTools")));
  assert.doesNotMatch(wait,/titleBuilding\|\|applyingBankToBundle/);
  assert.match(wait,/observeTools=\{!\(running\|\|Boolean\(bundleRun\)\|\|titleBuilding\)\}/);
  assert.match(wait,/applyingBankToBundle\?{title:"Applying your keyword bank"/);
});
