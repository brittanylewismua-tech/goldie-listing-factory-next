import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../app/factory-tools.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/lilac-theme.css',import.meta.url),'utf8');

test('D1241: missing titles open on one batch-wide action',()=>{
  const start=app.indexOf('function titlesLead()');
  const branch=app.slice(start,app.indexOf('function titlesRows',start));
  assert.match(branch,/<h3>Create titles and tags<\/h3>/);
  assert.match(branch,/Create all titles and tags/);
  assert.match(branch,/<KeywordBank compact selectionOnly/);
  assert.doesNotMatch(branch,/title-builder-choice|How do you want to create batch titles|Review every generated title/);
});

test('D1241: optional title decisions and the shared description start collapsed',()=>{
  assert.match(app,/<details className="title-builder-options"><summary>Title options<\/summary>/);
  assert.match(app,/<button type="button" className="title-mode-switch" onClick=\{\(\)=>setTitleBuilderMode\("manual"\)\}>Build titles manually<\/button>/);
  assert.match(app,/descriptionLead\(true\)/);
  assert.match(app,/<details className="shared-description-settings"><summary>Product description<\/summary>/);
  assert.match(css,/\.compact-title-tools \.keyword-workspace\.compact-keywords/);
  assert.match(css,/@media\(max-width:760px\)\{\.app-shell \.compact-title-tools \.keyword-workspace\.compact-keywords\{grid-template-columns:1fr\}/);
});

test('D1241: empty helper copy does not render an empty line',()=>{
  assert.match(tools,/\{copy&&<span>\{copy\}<\/span>\}/);
});
