import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

test('noopener tab requests do not mistake null handles for blocked popups', () => {
  const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function requestDraftTabs('), source.indexOf('/* D726'));
  let message = '', requests = [];
  const compiled = ts.transpileModule(body, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const run = new Function('window', 'setOpenAllMessage', `${compiled}; return requestDraftTabs;`)({open:(...args)=>{requests.push(args);return null;}}, value=>{message=value;});
  run([{id:'one',editorUrl:'https://printify.com/app/editor/one'},{id:'two',editorUrl:'https://printify.com/app/editor/two'}]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(args=>args[2]==='noopener,noreferrer'));
  assert.doesNotMatch(message, /opened 0|opened 2|blocked/i);
  assert.match(message, /If any did not open/);
});
