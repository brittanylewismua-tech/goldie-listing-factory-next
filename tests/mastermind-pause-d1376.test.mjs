import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("D1376: pausing mastermind access keeps everyone's Printify connection", () => {
  /* Turning access off always deleted every tester's saved Printify token.
     That is right when somebody is removed for good and wrong every other
     time — the usual reason to close the door is "not while I am changing
     things", and seven paying members should not each have to reconnect
     Printify when it opens again. Deleting a token cannot be undone from
     here, so it has to be asked for explicitly. */
  const route = read("app/api/mastermind/admin/route.ts");
  assert.match(route, /body\.disconnect === true/);
  assert.match(route, /if \(!body\.active && body\.disconnect === true\)\s*\n?\s*await db\.prepare\("DELETE FROM printify_connections/);
  /* The switch itself still flips regardless. */
  assert.match(route, /INSERT INTO mastermind_settings/);

  const ui = read("app/mastermind-admin/admin-control.tsx");
  assert.match(ui, /async function toggle\(disconnect = false\)/);
  assert.match(ui, /JSON\.stringify\(\{ active:!active, disconnect \}\)/);
  /* Two separate controls, and the safe one is the default. */
  assert.match(ui, /Pause access for everyone/);
  assert.match(ui, /Pause and disconnect Printify/);
  assert.doesNotMatch(ui, /Revoke access for everyone/);
  /* And the note no longer claims pausing deletes tokens, because it does not. */
  assert.doesNotMatch(ui, /Turning access off also removes saved Printify tokens/);
});
