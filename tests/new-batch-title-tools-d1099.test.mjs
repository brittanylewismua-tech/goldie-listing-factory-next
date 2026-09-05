import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('D1099: a new batch reopens title tools even if the previous batch collapsed them',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/files.forEach\(file=>URL.revokeObjectURL\(file.previewUrl\)\);\s*setBatchToolsOpen\(true\)/);
});
