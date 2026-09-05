import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync(new URL('../app/product-type-utils.ts',import.meta.url),'utf8'));
const {productFamily}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('phone cases match phone-case profiles and never poster profiles',()=>{
  assert.equal(productFamily('Tough Phone Cases Generic brand'),'phoneCase');
  assert.equal(productFamily('Standard: SPOKE Custom Products, Phone Case'),'phoneCase');
  assert.equal(productFamily('iPhone case'),'phoneCase');
  assert.notEqual(productFamily('Premium Matte vertical posters'),'phoneCase');
  assert.equal(productFamily('Printify ceramic mug'),'mug');
});
test('shipping identity does not append rendering-surface nouns',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('const classifyingProductName = useMemo'),source.indexOf('const [templateError'));
  assert.match(block,/return printifyProductLabel\(templateDetails\)/);
  assert.doesNotMatch(block,/family === "flat"/);
});
test('paper placement cap does not classify Printify branding or back print apparel as paper',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const fn=source.match(/function isRigidPaperProduct\(template:TemplateDetails\|null\)\{([^\n]+)\}/)[1];
  const classify=new Function('template',fn);
  assert.equal(classify({blueprintTitle:'Tough Phone Cases',brand:'Printify'}),false);
  assert.equal(classify({blueprintTitle:'T-shirt back print'}),false);
  assert.equal(classify({blueprintTitle:'Premium Matte Paper Poster'}),true);
});
