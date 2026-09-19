/*
  THE BOUNDARIES, HELD BY SOMETHING OTHER THAN MY WORD.

  A security pass that lives in a report is true on the day it was written.
  These are the four properties the pass actually established, written so a
  later change has to break a test rather than a promise.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const routes = [];
const walk = (dir) => {
  for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isDirectory()) walk(`${dir}/${e.name}`);
    else if (e.name === "route.ts") routes.push(`${dir}/${e.name}`);
  }
};
walk("../app/api");
const pathOf = (f) => "/" + f.replace("../app/", "").replace("/route.ts", "");

/*
  Two routes are reachable without a signed-in user, and both must be, because
  the caller is another company's server. Each carries its own proof instead.
*/
const UNAUTHENTICATED = {
  "/api/etsy/callback":
    "Etsy redirects the browser here. The `state` row is the credential: it "
    + "expires, carries the PKCE verifier and the user it belongs to, and is "
    + "deleted on lookup so it cannot be replayed.",
  "/api/printify/staged/[id]":
    "Printify's servers fetch the artwork. An HMAC over (id, expires) signed "
    + "with a server secret is the credential, checked before storage is "
    + "touched.",
};

test("every route has a gate, or a documented reason it cannot", () => {
  const ungated = [];
  for (const file of routes) {
    const s = read(file);
    const route = pathOf(file);
    const gated = /getChatGPTUser|isOwner|requireFeatureApi|cf-connecting-ip/.test(s)
      || /webhook/.test(file)
      || ["/api/version", "/api/trademark", "/api/client-errors",
        "/api/csp-report"].includes(route);
    if (!gated && !UNAUTHENTICATED[route]) ungated.push(route);
  }
  assert.deepEqual(ungated, [],
    `routes reachable with no gate and no documented reason:\n${ungated.join("\n")}`);
});

test("the OAuth callback cannot be replayed or forged", () => {
  const s = read("../app/api/etsy/callback/route.ts");
  assert.match(s, /expires_at>unixepoch\(\)/,
    "an unexpiring state is a permanent forgery token");
  assert.match(s, /code_verifier/, "PKCE verifier must come from the stored state");
  assert.match(s, /DELETE FROM etsy_oauth_states WHERE state=\?/,
    "the state must be single use");
  /* And the user is taken from the state row, never from the request. */
  assert.match(s, /SELECT user_id,code_verifier/);
});

test("the staged artwork URL is signed, time-boxed, and gives no oracle", () => {
  const route = read("../app/api/printify/staged/[id]/route.ts");
  const signer = read("../app/api/printify/staged-url.ts");
  assert.match(route, /if \(!await validSignature\(/,
    "the signature must be checked before storage is touched");
  assert.match(signer, /Number\(expires\) < nowSeconds/, "expired links must fail");
  assert.match(signer, /Number\(expires\) > nowSeconds \+ 30 \* 60/,
    "a far-future expiry would outlive the secret's blast radius");
  assert.match(signer, /crypto\.subtle\.verify\("HMAC"/);
  /* Bad signature and missing object answer identically. */
  const notFound = [...route.matchAll(/new Response\("Not found", \{ status: 404 \}\)/g)];
  assert.ok(notFound.length >= 3,
    "a different answer for 'wrong signature' and 'no such object' tells an "
    + "attacker which ids exist");
});

test("nothing interpolated into SQL is request-derived", () => {
  /*
    Placeholder lists and identifiers the code chose itself are fine. What
    must never appear is a value that came from the request.

    The first version of this test kept an allowlist of variable names, which
    is the wrong shape: it passed by knowing the answers rather than by
    checking anything, and a new safe name would fail it while a new unsafe
    one with a familiar name would not. It now traces provenance — is this
    variable ever assigned from the request in this file?
  */
  const files = [];
  const walkAll = (dir) => {
    for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      if (e.isDirectory()) walkAll(`${dir}/${e.name}`);
      else if (/\.tsx?$/.test(e.name)) files.push(`${dir}/${e.name}`);
    }
  };
  walkAll("../app");

  const REQUEST = /\b(?:body|params|query)\b|searchParams|request\.|req\./;
  const offences = [];
  for (const file of files) {
    const s = read(file);
    for (const m of s.matchAll(/\.prepare\(\s*`([^`]*\$\{[^`]*)`/gs))
      for (const [, expr] of m[1].matchAll(/\$\{([^}]+)\}/g)) {
        const v = expr.trim();
        /* Generated placeholder lists never carry a value. */
        if (/\.map\(\(\)\s*=>\s*["'`]/.test(v)) continue;
        if (/^[A-Z_][A-Z0-9_]*$/.test(v)) continue;              /* a constant */
        const root = (v.match(/^[A-Za-z_$][\w$]*/) || [""])[0];
        if (!root) continue;
        /* Where does this identifier get its value in this file? */
        const assigns = [...s.matchAll(
          new RegExp(`(?:const|let|var)\\s+${root}\\b[^\\n]*`, "g"))].map(a => a[0]);
        const fromRequest = assigns.some(a => REQUEST.test(a));
        /* A bare loop variable counts as its source too. */
        const loops = [...s.matchAll(new RegExp(`for\\s*\\([^)]*\\b${root}\\b[^)]*\\)`, "g"))]
          .map(a => a[0]);
        if (fromRequest || loops.some(a => REQUEST.test(a)))
          offences.push(`${file} — \${${v}} is request-derived`);
      }
  }
  assert.deepEqual(offences, [],
    `a request value reaches SQL as text:\n${offences.join("\n")}`);
});

test("a secret is only ever reported as present, never returned", () => {
  const offences = [];
  for (const file of routes) {
    const s = read(file);
    for (const m of s.matchAll(/NextResponse\.json\(\s*(\{[\s\S]{0,700}?\})\s*[,)]/g)) {
      const body = m[1];
      /* Boolean(secret) and a bare env-var NAME in a message are both fine. */
      const stripped = body
        .replace(/Boolean\([^)]*\)/g, "")
        .replace(/key\(\)\s*\?/g, "")
        .replace(/"[^"]*(?:FAL_KEY|ANTHROPIC_API_KEY|USPTO)[^"]*"/g, '""');
      if (/\b(access_token|refresh_token|encrypted_access_token|code_verifier|password|ADMIN_SECRET|PRINTIFY_TOKEN_KEY)\b/.test(stripped))
        offences.push(`${pathOf(file)} — ${body.split("\n")[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(offences, [], `a secret reaches a response:\n${offences.join("\n")}`);
});

test("every member-facing read of an owned table is scoped to its owner", () => {
  const OWNED = ["scan_history", "scan_uploads", "shop_map_listings",
    "shop_map_classifications", "shop_map_world_overrides", "shop_map_world_labels",
    "shop_map_cost_rules", "etsy_connections", "finance_receipts", "finance_ledger",
    "finance_production", "finance_rollups", "keyword_lists", "product_recipes",
    "printify_draft_results", "etsy_publish_items", "watched_shops",
    "billing_customers", "artwork_capture_jobs", "artwork_provenance"];
  const matrix = read("../app/access-matrix.ts");
  const ownerBlock = matrix.slice(matrix.indexOf("OWNER_PREFIXES"));
  const offences = [];
  for (const file of routes) {
    const route = pathOf(file);
    const s = read(file);
    if (ownerBlock.includes(`"${route}"`)) continue;
    if (/^\/api\/(operations|mastermind|market|dev)/.test(route)) continue;
    if (/cf-connecting-ip/.test(s)) continue;
    if (/isOwner/.test(s) && !/requireFeatureApi/.test(s)) continue;
    for (const m of s.matchAll(/`([^`]{0,900}?(?:SELECT|UPDATE|DELETE)[^`]{0,900}?)`/gs)) {
      const sql = m[1];
      for (const t of OWNED)
        if (new RegExp(`\\b${t}\\b`).test(sql) && !/user_id/.test(sql))
          offences.push(`${route} — ${t} — ${sql.split("\n")[0].trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(offences, [],
    `one member could read another's rows:\n${offences.join("\n")}`);
});
