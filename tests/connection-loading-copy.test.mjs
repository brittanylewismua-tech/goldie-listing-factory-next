import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('initial connection checks do not tell an already connected seller to reconnect',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/\[checkingEtsyConnection, setCheckingEtsyConnection\] = useState\(true\)/);
  assert.match(source,/finally\(\(\)=>setCheckingEtsyConnection\(false\)\)/);
  for(const start of ['function progressGateIssues','function requiredForStep']){
    const section=source.slice(source.indexOf(start),source.indexOf(start)+420);
    assert.match(section,/checkingConnection\|\|checkingEtsyConnection/);
    assert.match(section,/Checking saved connections…/);
  }
});
