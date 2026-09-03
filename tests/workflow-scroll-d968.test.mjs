import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D968: every committed workflow screen resets the real workflow scroller",()=>{
  assert.match(source,/function scrollFactoryToTop\(\)[\s\S]*?querySelector<HTMLElement>\("\.factory-main"\)[\s\S]*?pane\.scrollTop=0/);
  assert.match(source,/useLayoutEffect\(\(\)=>\{[\s\S]*?const reset=scrollFactoryToTop\(\);[\s\S]*?requestAnimationFrame\(reset\)[\s\S]*?\},\[workflowStep,finishPhase,complete\]\)/);
});

test("D968: browser history navigation uses the same top reset",()=>{
  const popstate=source.match(/useEffect\(\(\)=>\{const read=\(\)=>\{[\s\S]*?addEventListener\("popstate",read\)[\s\S]*?\},\[\]\);/)?.[0]||"";
  assert.match(popstate,/scrollFactoryToTop\(\)/);
});
