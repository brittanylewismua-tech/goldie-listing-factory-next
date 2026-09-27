import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

test("saved research can be deleted, and the delete respects the update lease", () => {
  /*
    D1864 · The insert refuses an eleventh project, and nothing removed one.
    Ten saved niches was therefore permanent: the next niche a seller wanted
    could not be created, and a project started by mistake stayed on Home.
  */
  const route = read("api/niche-research/route.ts");
  assert.match(route, /body\?\.action==='delete'/);
  /* A running pass must not write the project back after it is gone. */
  assert.match(route, /claimResearch\(user,id\)/);
  assert.match(route, /DELETE FROM niche_research_projects WHERE user_id=\? AND id=\? AND lease=\?/);
  assert.match(route, /DELETE FROM niche_research_evidence WHERE user_id=\? AND project_id=\?/);
});

test("deleting research asks first and says what goes", () => {
  const client = read("market-watch/research/research-client.tsx");
  assert.match(client, /confirmAction\(\{eyebrow:'RESEARCH'/);
  assert.match(client, /destructive:true/);
  /* It must be clear what is not affected, or nobody will use it. */
  assert.match(client, /Your keyword banks and tracked shops are not affected/);
  assert.match(client, /Delete this research/);
});
