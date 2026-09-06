import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const line=source.split('\n').find(line=>line.startsWith('function personalizationProblem('));
const code=ts.transpile('export '+line,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {personalizationProblem}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('personalization reports the specific invalid question and recovers after correction',()=>{
 const q={question:'Choose a name',type:'dropdown',options:['a'.repeat(21),'Second']};
 const details={personalization:{enabled:true,questions:[{...q,options:['First','Second']},q]}};
 assert.equal(personalizationProblem(details),'Every dropdown choice in personalization question 2 must be 20 characters or fewer.');
 q.options=['First','Second'];assert.equal(personalizationProblem(details),'');
 q.options=['Only'];assert.match(personalizationProblem(details),/question 2 needs at least two/);
 details.personalization.enabled=false;assert.equal(personalizationProblem(details),'');
});
