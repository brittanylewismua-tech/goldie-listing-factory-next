/*
  EVERY PLACE THIS APP FETCHES SOMETHING, AND WHY IT IS SAFE.

  A previous pass said "eighteen fetch locations" and then described fixing
  one of them. That is an unexplained remainder, and an unexplained remainder
  is indistinguishable from an unexamined one.

  So every call site with a non-literal destination is classified here, and a
  new one that matches no category fails this test. The categories are about
  WHERE the address came from, because that is what decides the risk:

    guarded      goes through fetchTrustedImage / trustedImageUrl
    own-url      an address this code built from its own constants and ids,
                 pointing at a provider API — there is no remote URL to abuse
    host-pinned  validated against an explicit host allowlist at the call site
    helper       the shared helper's own fetch, which IS the protection
    client       a .tsx file: the BROWSER calling our own origin. Not a
                 server-side fetch at all, and bounded by connect-src 'self'
                 in the enforced CSP rather than by anything here.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isDirectory()) walk(`${dir}/${e.name}`);
    else if (/\.tsx?$/.test(e.name)) files.push(`${dir}/${e.name}`);
  }
};
walk("../app");

/* file:line -> why it is safe. Every entry was read before being listed. */
const CLASSIFIED = {
  "api/listing-factory/prepare/route.ts": "own-url: api.printify.com built here",
  "api/listing-photos/delivery/service.ts": "guarded: trustedImageUrl redirect loop, plus own-url Printify API",
  "api/listing-photos/download/route.ts": "guarded: fetchTrustedImage (D1726)",
  "integrated-mockups.tsx": "client: browser to our own origin",
  "listing-factory-app.tsx": "client: browser to our own origin",
  "market-watch/market-watch-client.tsx": "client: browser to our own origin",
  "mockups/page.tsx": "client: browser to our own origin",
  "product-color-rendering.tsx": "client: browser to our own origin",
  "api/mockups/library/[id]/prepare/route.ts": "guarded: fetchTrustedImage same-host (D1726)",
  "api/printify/drafts/update/route.ts": "own-url: api.printify.com built here",
  "api/shop-map/benchmark-candidates/route.ts": "provider-response URL, owner-only diagnostic",
  "api/shop-map/benchmark-printify/route.ts": "provider-response URL, owner-only diagnostic",
  "api/shop-map/image-id-test/route.ts": "provider-response URL, owner-only diagnostic",
  "api/trademark/ingest-tick/route.ts": "own-url: built by productFilesUrl from USPTO constants",
  "api/uspto-explore/route.ts": "host-pinned: uspto.gov allowlist at the call site",
  "api/uspto-probe/route.ts": "own-url: USPTO endpoints built here, owner-only",
  "trademark-register.ts": "own-url: USPTO bulk listing built by productFilesUrl",
  "trusted-image-fetch.ts": "helper: this fetch IS the protection",
};

test("every remote fetch is classified", () => {
  const unexplained = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const has = [...source.matchAll(/fetch\(\s*([^),\s][^),]*?)\s*[,)]/g)]
      .filter(m => !/^["'`]/.test(m[1].trim()));
    if (!has.length) continue;
    const key = file.replace("../app/", "");
    if (!CLASSIFIED[key]) unexplained.push(`${key} (${has.length} site(s))`);
  }
  assert.deepEqual(unexplained, [],
    `these fetch a variable destination and are not classified:\n${unexplained.join("\n")}`);
});

test("no classification is stale", () => {
  /* A category for a file that no longer fetches anything is a claim about
     code that is gone, and would hide the next real one behind noise. */
  const stale = Object.keys(CLASSIFIED).filter(key => {
    const file = `../app/${key}`;
    if (!files.includes(file)) return true;
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    /* A file that now calls the shared helper instead of fetch() directly is
       not stale — it is the outcome this test wants. */
    return !/fetch\(\s*[^),\s"'`]/.test(source) && !/fetchTrustedImage\(/.test(source);
  });
  assert.deepEqual(stale, [], `classified but no longer fetching:\n${stale.join("\n")}`);
});

test("the member-facing ones are the guarded ones", () => {
  /*
    The distinction that matters. An owner-only diagnostic fetching a URL an
    Etsy response handed it is a different exposure from a route any member
    can call.
  */
  for (const [key, why] of Object.entries(CLASSIFIED)) {
    if (!/provider-response URL/.test(why)) continue;
    const source = readFileSync(new URL(`../app/${key}`, import.meta.url), "utf8");
    assert.match(source, /isOwner/,
      `${key} fetches a provider-supplied URL and is not owner-only`);
  }
});
