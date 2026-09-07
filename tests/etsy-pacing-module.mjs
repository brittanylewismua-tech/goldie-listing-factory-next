import {readFileSync} from 'node:fs';
import ts from 'typescript';
export const pacingModule='data:text/javascript;base64,'+Buffer.from(ts.transpile(readFileSync(new URL('../app/api/etsy/request-pacing.ts',import.meta.url),'utf8'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
