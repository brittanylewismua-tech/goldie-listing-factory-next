import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import postcss from "postcss";

const sheets=["globals.css","factory-navigation.css","theme.css","lilac-theme.css","approved-functional.css","management-aesthetic.css","clarity-pass.css","interface-v2.css"];

function mediaApplies(node,width){
  for(let parent=node.parent;parent;parent=parent.parent){
    if(parent.type!=="atrule"||parent.name!=="media")continue;
    const min=parent.params.match(/min-width\s*:\s*(\d+)px/)?.[1];
    const max=parent.params.match(/max-width\s*:\s*(\d+)px/)?.[1];
    if(min&&width<Number(min))return false;
    if(max&&width>Number(max))return false;
  }
  return true;
}

function resolvedDisplay(width){
  const candidates=[];
  for(const [sheetIndex,name] of sheets.entries()){
    const root=postcss.parse(fs.readFileSync(new URL(`../app/${name}`,import.meta.url),"utf8"));
    let order=0;
    root.walkRules(rule=>{
      order++;
      if(!mediaApplies(rule,width)||!rule.selectors?.some(selector=>selector.trim()===".app-shell .workflow-footer-actions>.autosave-note"))return;
      rule.walkDecls("display",decl=>candidates.push({value:decl.value,important:decl.important,sheetIndex,order}));
    });
  }
  return candidates.sort((a,b)=>Number(a.important)-Number(b.important)||a.sheetIndex-b.sheetIndex||a.order-b.order).at(-1);
}

test("D868: the redundant autosave label cannot overlap action-bar status copy",()=>{
  assert.equal(resolvedDisplay(1024)?.value,"none");
  assert.equal(resolvedDisplay(1440)?.value,"none");
});
