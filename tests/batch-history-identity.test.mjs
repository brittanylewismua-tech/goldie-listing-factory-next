import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const source=await readFile(new URL("../app/batch-history-identity.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {bundleHistoryIdentity}=await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("a multi-product batch is named by its bundle, never one member",()=>{
  const result=bundleHistoryIdentity({
    activeBundle:{name:"Hoodie + Tee + Crewneck"},
    activeRecipe:{name:"Gildan Tee"},
    bundleIndex:1,
    bundleRecipes:[{id:"hoodie"},{id:"tee"},{id:"crewneck"}],
  });
  assert.deepEqual(result,{displayName:"Hoodie + Tee + Crewneck",productTitle:"Gildan Tee · product 2 of 3"});
});

test("an older bundle snapshot without its bundle name stays truthful",()=>{
  const result=bundleHistoryIdentity({
    activeRecipe:{name:"Gildan Tee"},
    bundleRecipes:[{id:"hoodie"},{id:"tee"},{id:"crewneck"}],
  });
  assert.deepEqual(result,{displayName:"3-product bundle",productTitle:"Gildan Tee · product 1 of 3"});
});

test("a single-product batch keeps the existing naming path",()=>{
  assert.equal(bundleHistoryIdentity({activeRecipe:{name:"Gildan Tee"},bundleRecipes:[{id:"tee"}]}),null);
});
