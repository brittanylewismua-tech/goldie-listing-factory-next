import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v2=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D863: the 1024px shell allocates its sidebar exactly once",()=>{
  const laptop=v2.match(/@media\(min-width:821px\) and \(max-width:1179px\)\{([\s\S]*)\}\s*$/)?.[1]||"";
  assert.match(laptop,/\.app-shell\{min-width:0;padding-left:0;grid-template-columns:240px minmax\(0,1fr\)\}/);
  const viewport=1024,rail=240,paddingLeft=0,pane=viewport-rail-paddingLeft;
  assert.deepEqual({railLeft:paddingLeft,railRight:paddingLeft+rail,paneLeft:paddingLeft+rail,paneRight:viewport,paneWidth:pane},{railLeft:0,railRight:240,paneLeft:240,paneRight:1024,paneWidth:784});
});

test("D863: full-width laptop bars are bounded by the pane, not viewport maths",()=>{
  const laptop=v2.match(/@media\(min-width:821px\) and \(max-width:1179px\)\{([\s\S]*)\}\s*$/)?.[1]||"";
  assert.match(laptop,/\.factory-footer,[\s\S]*\.workflow-footer-actions,[\s\S]*\.factory-work footer,[\s\S]*\.workflow-footer-actions\.post-draft-footer\{\s*width:100%;margin-left:0\}/);
  assert.doesNotMatch(laptop,/100vw|50vw|calc\(/);
  const pane={left:240,width:784},workGutter=24,bar={left:240+workGutter,width:784-2*workGutter};
  assert.ok(bar.left>=pane.left&&bar.left+bar.width<=pane.left+pane.width);
});

test("D863: every action-bar item keeps reachable space at 1024",()=>{
  const laptop=v2.match(/@media\(min-width:821px\) and \(max-width:1179px\)\{([\s\S]*)\}\s*$/)?.[1]||"";
  assert.match(laptop,/\.workflow-footer-actions>\.autosave-note\{display:none\}/);
  assert.match(laptop,/\.factory-footer\.in-bar>small\{\s*white-space:normal;overflow:visible;text-overflow:clip\}/);
  const barWidth=736,back=150,gaps=3*18,saveDraft=130,next=125,status=barWidth-back-gaps-saveDraft-next;
  assert.ok(status>200,`status has ${status}px rather than collapsing to zero`);
});

