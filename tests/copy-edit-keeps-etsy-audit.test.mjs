import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
test('title and tag controls retain reviewed Etsy fields instead of purchasing new analysis',()=>{
  const start=source.indexOf('const derived=tagsFromTitle(design.title)');
  const end=source.indexOf('function descriptionLead(',start);
  assert.ok(start>0&&end>start);
  assert.doesNotMatch(source.slice(start,end),/etsy:undefined/);
  assert.match(source.slice(start,end),/keep\?\{title,etsyError:""\}:\{title,tags:next,etsyError:""\}/);
});
test('batch copy and capitalization preserve Etsy details, while new listings still prepare them',()=>{
  for(const name of ['applyBatchTitle','changeTitleCaps']){
    const start=source.indexOf('function '+name+'('),end=source.indexOf('\n',start);
    assert.ok(start>0);
    assert.doesNotMatch(source.slice(start,end),/etsy:undefined/);
  }
  assert.match(source,/files.filter\(file=>!file.etsy&&file.title.trim\(\)\)/);
  assert.match(source,/file,id:crypto.randomUUID\(\)[^\n]*etsy:undefined/);
});
