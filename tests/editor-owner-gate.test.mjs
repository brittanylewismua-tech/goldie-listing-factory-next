/* D616 - the placement editor is RELEASED.

   D589 held it behind two conditions: an owner account decided server-side, and
   ?editorPreview=1 in the URL. The acceptance gate passed, so both are gone and
   every seller gets the editor with no query flag.

   What these tests now protect is the distinction that made releasing it safe.
   Removing a release gate is not the same as loosening who owns what: the
   placement endpoints still prove, per request, that the scene, batch, listing
   and design are real, belong to the signed-in seller, and belong to each other.
   That proof must never be removed along with the gate. */
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

test("every seller gets the editor, with no flag and no allowlist", async () => {
  const raw = await read("app/integrated-mockups.tsx");
  /* Comments discuss the flag that was removed - that history is worth keeping.
     Only the CODE is checked. */
  const mockups = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(mockups, /editorPreview/, "no query flag may be required any more");
  assert.doesNotMatch(mockups, /editorAllowed/, "and no owner gate remains in the component");
  assert.match(mockups, /<button type="button" className="adjustPlacement"/, "the control renders for everyone");
});

test("the release removed the allowlist and kept the ownership proof", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  assert.doesNotMatch(route, /isOwner/, "the owner-only allowlist is gone");
  // But every entry point still proves the records belong together, and to this
  // seller, before reading or writing. This is the part that must never go.
  assert.match(route, /if \(!await relationshipsHold\(user\.userId,/, "GET proves ownership");
  const put = route.slice(route.indexOf("async function handlePUT"));
  assert.match(put, /body\.geometry\?\.sceneId && !await relationshipsHold\(user\.userId,/);
  assert.match(put, /body\.override\?\.sceneId && !await relationshipsHold\(user\.userId,/);
  assert.match(route, /\{ error: "Not available\." \}, \{ status: 404 \}/, "and a stranger still gets 404");
  // Signing in is still required.
  assert.match(route, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in/);
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
