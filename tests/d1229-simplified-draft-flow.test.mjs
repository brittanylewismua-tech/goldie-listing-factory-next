import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app/listing-factory-app.tsx');
const css=read('app/interface-v2.css');

test('D1229: ready defaults are presented as complete rather than six mandatory reviews',()=>{
 assert.match(app,/Everything your saved product already answers has been applied\./);
 assert.match(app,/Only listings that need you are flagged\./);
 assert.doesNotMatch(app,/The exact section you need|Your other saved choices|Everything required is already set|unfinished section is still clearly marked/);
 assert.match(app,/remaining\?`\$\{remaining\} to finish`:"Ready"/);
 assert.doesNotMatch(app,/>Ready to review</);
});

test('D1229: only the focused or first unfinished section renders as a work surface',()=>{
 assert.match(app,/const effectiveTask=open\?\(activeTask==="__closed"\?"":focusedDraftTask\(rows,activeTask\)\):""/);
 assert.match(app,/if\(grouped&&row\.task!==effectiveTask\)return null/);
 assert.match(app,/className="draft-section-nav"/);
 assert.match(app,/Continue to \{rows\[rowIndex\+1\]\.label\.toLowerCase\(\)\}/);
 assert.doesNotMatch(app,/setActiveTask\(requestedTask\|\|"placement"\)/);
 assert.doesNotMatch(app,/className=\{`draft-product-guidance/);
 assert.doesNotMatch(app,/\$\{showingNextRequired\?"Next":"Still needed"\}/);
 assert.match(css,/\.draft-section-nav button\[aria-current=step\]/);
});

test('D1229: existing safety gates still own progression',()=>{
 assert.match(app,/disabled=\{imagesStepIssues\(\)\.length>0\}/);
 assert.match(app,/row\.optional/);
});
