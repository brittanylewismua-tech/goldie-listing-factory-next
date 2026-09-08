import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app/listing-factory-app.tsx');
const css=read('app/interface-v2.css');

test('D1229: ready defaults are presented as complete rather than six mandatory reviews',()=>{
 assert.match(app,/Your saved choices are applied\. Fix anything flagged, then continue\./);
 assert.match(app,/Everything required is already set\. Continue to Listing, or open a stage only if you want to review or change it\./);
 assert.match(app,/remaining\?`\$\{remaining\} to finish`:"Ready"/);
 assert.doesNotMatch(app,/>Ready to review</);
});

test('D1229: only the focused or first unfinished section renders as a work surface',()=>{
 assert.match(app,/const effectiveTask=open\?\(activeTask==="__closed"\?"":focusedDraftTask\(rows,activeTask\)\):""/);
 assert.match(app,/if\(grouped&&row\.task!==effectiveTask\)return null/);
 assert.match(app,/className="draft-section-nav"/);
 assert.match(app,/Continue to \{rows\[rowIndex\+1\]\.label\.toLowerCase\(\)\}/);
 assert.doesNotMatch(app,/setActiveTask\(requestedTask\|\|"placement"\)/);
 assert.match(css,/\.draft-product-guidance\.is-ready/);
 assert.match(css,/\.draft-section-nav button\[aria-current=step\]/);
});

test('D1229: existing safety gates still own progression',()=>{
 assert.match(app,/disabled=\{imagesStepIssues\(\)\.length>0\}/);
 assert.match(app,/const nextRequiredRow=requiredRows\.find\(row=>!row\.done&&!row\.pending\)/);
 assert.match(app,/row\.optional/);
});
