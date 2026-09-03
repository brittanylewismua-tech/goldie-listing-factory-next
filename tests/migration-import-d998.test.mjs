import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../app/api/mastermind/migration-import/route.ts",import.meta.url),"utf8");
test("D998 importer is secret protected, allowlisted, and parameterized",()=>{assert.match(source,/TABLES\.has\(body\.name\)/);assert.match(source,/x-goldie-migration-secret/);assert.match(source,/\.bind\(\.\.\.columns\.map\(column=>row\[column\]\)\)/);assert.doesNotMatch(source,/body\.sql/)});
