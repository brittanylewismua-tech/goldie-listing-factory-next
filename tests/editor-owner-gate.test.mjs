/* D589 - the placement editor is unreleased and must be reachable only by an
   owner account, and only when explicitly asked for.

   Two conditions, and they are not the same kind of thing: the account check is
   the access control, the query flag is only so the control does not appear
   during ordinary owner use. A hidden button is not security, so the endpoints
   check the account for themselves. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("owner status is decided on the server, never from the URL", async () => {
  const account = await read("app/api/account/route.ts");
  assert.match(account, /import \{ isOwner \} from "@\/app\/mastermind\/access"/);
  assert.match(account, /owner: Boolean\(user && isOwner\(user\)\)/);
  // It must be derived from the session, not from anything the caller supplies.
  assert.doesNotMatch(account, /searchParams|request\.url|editorPreview/);
});

test("the editor needs BOTH the owner account and the explicit flag", async () => {
  const mockups = await read("app/integrated-mockups.tsx");
  assert.match(mockups, /editorPreview"\)==="1"/, "the flag must be required");
  assert.match(mockups, /setEditorAllowed\(Boolean\(payload\?\.owner\)\)/, "and the server's answer must decide");
  // The flag alone must never be sufficient.
  assert.doesNotMatch(mockups, /setEditorAllowed\(true\)/, "nothing may enable the editor without the account check");
  assert.match(mockups, /\{editorAllowed&&<button type="button" className="adjustPlacement"/);
  assert.match(mockups, /\{editorAllowed&&editing&&designUrl/, "and the overlay itself is gated too");
});

test("the persistence endpoints refuse anyone who is not an owner", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  const guards = route.match(/if \(!isOwner\(user\)\) return NextResponse\.json/g) || [];
  assert.equal(guards.length, 2, "both GET and PUT must check the account themselves");
  // 404 rather than 403: an unreleased feature should not advertise itself.
  assert.match(route, /\{ error: "Not available\." \}, \{ status: 404 \}/);
});

test("the editor cannot publish, delete or modify anything external", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  const compositor = await read("app/mockups/scene-composite.ts");
  const profile = await read("app/mockups/placement-profile.ts");
  for (const source of [editor, compositor, profile]) {
    assert.ok(!/fetch\s*\(/.test(source), "the editor path makes no network call at all");
  }
  /* And no CODE in it reaches a publishing or mutation endpoint. Comments
     naturally discuss Printify - that is what the placement contract is about -
     so the prose is stripped before checking. */
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const all = code(editor) + code(compositor) + code(profile);
  for (const endpoint of ["printify.com", "etsy.com", "/api/printify", "/api/etsy", "publish", "/drafts"])
    assert.ok(!all.toLowerCase().includes(endpoint.toLowerCase()),
      `the editor must not reference ${endpoint}`);
  for (const verb of ["method: \"DELETE\"", "method:\"DELETE\"", "method: \"POST\"", "method:\"POST\""])
    assert.ok(!all.includes(verb), `the editor must not issue ${verb}`);
});

test("saving a placement writes only mockup-editor records", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  /* D598 - the only tables it may WRITE are the two editor records. It now also
     READS mockup_templates and printify_draft_results, because ownership has to
     be proved against the database rather than taken from the request - but
     nothing outside the editor's own tables is ever modified.

     D599 - listing_batches was dropped from that read set: it holds a different
     kind of batch id than the one the editor sends. */
  const written = [...route.matchAll(/insert\((\w+)\)|update\((\w+)\)/g)].map(m => m[1] || m[2]);
  assert.ok(written.length > 0, "the endpoint does write something");
  for (const table of written)
    assert.ok(["mockupSceneGeometry", "mockupArtworkOverrides"].includes(table),
      `the placement endpoint must not write to ${table}`);
  assert.ok(!/delete\(/.test(route), "it must not delete anything");
  // And the extra reads are exactly the ownership checks.
  for (const readOnly of ["mockupTemplates", "printify_draft_results"])
    assert.ok(route.includes(readOnly), `${readOnly} is consulted for ownership`);
});
