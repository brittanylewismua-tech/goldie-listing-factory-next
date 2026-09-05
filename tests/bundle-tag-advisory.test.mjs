import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('optional 13-tag advice never changes the required at-least-one-tag gate',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/tagged:designs\.filter\(design=>\(design.tags\|\|\[\]\)\.length>0\)\.length/);
  assert.match(source,/const fullyTagged=\(bundleMembers\[recipe.id\]\?\.designs\|\|\[\]\)\.filter\(design=>\(design.tags\|\|\[\]\)\.length>=13\)\.length/);
  assert.match(source,/if\(fullyTagged<summary.designs\)return \{label:`\$\{summary.designs-fullyTagged\} could use all 13 tags`,tone:"advice"\}/);
});
