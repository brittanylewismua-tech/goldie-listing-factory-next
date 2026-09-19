/*
  A LINK SOMEBODY ELSE WROTE MUST NOT CHANGE ANYTHING HERE.

  Behavioural: these call the real guard with the headers a browser actually
  sends, rather than reading its source.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "origin-"));
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/same-site-only.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const { crossSiteWrite } = await import(join(dir, "same-site-only.js"));

const asked = (site) => new Request("https://thegoldiesuite.com/api/x",
  site === null ? {} : { headers: { "sec-fetch-site": site } });

test("a link on another site cannot reach a write", () => {
  /*
    SameSite=Lax is routinely described as blocking CSRF. It blocks the
    cross-site POST and cookies on subresource GETs. It does NOT block a
    top-level navigation, so a clicked link arrives with the session.
  */
  assert.equal(crossSiteWrite(asked("cross-site")), true);
});

test("a sibling subdomain is refused too", () => {
  /* The difference between same-site and same-origin is exactly the attack
     path, and nothing here calls the API from another subdomain. */
  assert.equal(crossSiteWrite(asked("same-site")), true);
});

test("our own pages and the address bar still work", () => {
  assert.equal(crossSiteWrite(asked("same-origin")), false);
  assert.equal(crossSiteWrite(asked("none")), false,
    "typing the address or opening a bookmark is a deliberate act");
});

test("a caller that is not a browser is not blocked by a missing header", () => {
  /* The cron has its own gate; refusing a header it never sends would break
     it while defending nothing. */
  assert.equal(crossSiteWrite(asked(null)), false);
});

test("every state-changing GET carries the guard", () => {
  /*
    The property, not the prose: if a GET handler writes, the guard must run
    inside it. Counted from the handler body so a new mutating GET fails here.
  */
  const routes = [];
  const walk = (d) => {
    for (const e of readdirSync(new URL(d, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else if (e.name === "route.ts") routes.push(`${d}/${e.name}`);
    }
  };
  walk("../app/api");
  const unguarded = [];
  for (const file of routes) {
    const s = readFileSync(new URL(file, import.meta.url), "utf8");
    const at = s.search(/export (?:const|async function) GET\b/);
    if (at < 0) continue;
    const after = s.slice(at);
    const next = after.search(/\nexport (?:const|async function) (?:POST|PUT|PATCH|DELETE)\b/);
    const body = next > 0 ? after.slice(0, next) : after;
    const writes = /(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\s+\w+/.test(body);
    if (!writes) continue;
    /* Exempt: the OAuth callback, whose state row is its credential, and
       anything reachable only from inside the worker. */
    if (/etsy\/callback|connect-sales/.test(file)) continue;
    if (/cf-connecting-ip/.test(s)) continue;
    if (!/crossSiteWrite\(/.test(body)) unguarded.push(file);
  }
  assert.deepEqual(unguarded, [],
    `state-changing GETs a link could fire:\n${unguarded.join("\n")}`);
});

test("the deployed headers are configured, and script-src is not faked", () => {
  /*
    Comments stripped first. The un-stripped version of this test matched the
    words "script-src" and "unsafe-inline" inside the comment that explains
    why script-src is deliberately absent — the third time tonight a guard has
    tripped on its own explanation. Any test that greps source must strip
    comments; the reasons live in comments and the reasons quote the rules.
  */
  const raw = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const config = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  for (const h of ["Content-Security-Policy", "X-Frame-Options",
    "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy",
    "Strict-Transport-Security"])
    assert.ok(config.includes(h), `missing header: ${h}`);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /base-uri 'self'/);
  /* A script-src with unsafe-inline is a header that looks like a CSP and
     defends nothing. Better absent and named as outstanding. */
  assert.ok(!/script-src[^"]*unsafe-inline/.test(config),
    "unsafe-inline would make the CSP decorative");
});
