import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const source=await readFile(new URL("../app/product-color-options.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl=`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const {groupProductColors,canonicalProductColorIds}=await import(moduleUrl);

test("duplicate Printify names render once without losing either variant id",()=>{
  const colors=groupProductColors([
    {id:1,title:"Ash",colors:["#eee"]},
    {id:2,title:" ash ",colors:["#eee"]},
    {id:3,title:"Black",colors:["#111"]},
  ],new Set([1,2,3]),new Set([2,3]));
  assert.deepEqual(colors.map(color=>color.title),["Ash","Black"]);
  assert.deepEqual(colors[0],{id:1,ids:[1,2],title:"Ash",swatch:"#eee",available:true,templateEnabled:true});
  assert.deepEqual([...canonicalProductColorIds(colors).entries()],[[1,1],[2,1],[3,3]]);
});

test("a duplicate that owns the only available variants keeps the visible color available",()=>{
  const [ash]=groupProductColors([{id:10,title:"Ash"},{id:11,title:"Ash"}],new Set([11]),new Set());
  assert.equal(ash.available,true);
  assert.deepEqual(ash.ids,[10,11]);
});

test("the picker selects visible colors, not Printify's duplicate ids",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/onChange\(available\.map\(color=>color\.id\)\)/);
  assert.match(app,/normalizeColorIds\(result\.product,rememberedColorIds\)/);
  assert.match(app,/normalizeColorIds\(details,colorIds\)/);
});

test("product is chosen first, but color decisions wait until artwork exists",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/workflowStep==="designs"&&files\.length>0&&templateDetails&&productSelected/);
  assert.match(app,/workflowStep==="designs"&&files\.length>0&&<div id="batch-preferences-after-designs"/);
  assert.doesNotMatch(app,/function productStepBlocker\(\)\{\s*if\(templateDetails\?\.colorOptions/);
  assert.match(app,/if\(\["review","finish"\]\.includes\(step\)\)\{const missingColors=/);
  assert.match(app,/title: "Add your designs", copy: ""/);
  assert.match(app,/\(workflowStep==="designs"&&!complete\)\|\|\(workflowStep==="setup"&&Boolean\(templateDetails\)&&productSelected&&!failedBundleNames\(\)\.length&&!bundleCreationMode\)\?"active-panel":"hidden-panel"/);
  assert.doesNotMatch(app,/className="workflow-next setup-forward"/);
});
