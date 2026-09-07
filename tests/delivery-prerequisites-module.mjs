import ts from 'typescript';import {readFileSync} from 'node:fs';
export const prerequisitesModule='data:text/javascript;base64,'+Buffer.from(ts.transpile(readFileSync('app/api/listing-photos/delivery/prerequisites.ts','utf8'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
