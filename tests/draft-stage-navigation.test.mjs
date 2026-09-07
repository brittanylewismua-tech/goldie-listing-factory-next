import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('draft stages remain reachable beside long forms and compact safely on narrow screens',async()=>{
 const [app,css]=await Promise.all([
  readFile(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/interface-v2.css',import.meta.url),'utf8'),
 ]);
 assert.match(app,/className="draft-stage-rail"><nav className="draft-stage-nav" aria-label="Product setup stages"/);
 assert.match(css,/\.draft-stage-rail\{position:sticky;top:76px/);
 assert.match(css,/@media\(min-width:1280px\)[\s\S]*grid-template-columns:minmax\(0,1fr\) 218px[\s\S]*grid-column:2[\s\S]*\.draft-stage-nav\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.draft-stage-nav button>small\{display:none\}/);
 assert.match(css,/scroll-margin-top:200px/);
 assert.match(css,/scroll-margin-top:172px/);
});
