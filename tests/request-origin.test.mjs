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
import { stripComments } from "./strip-comments.mjs";

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
  const config = stripComments(raw);
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

test("D1716: no route runs work on a GET", () => {
  /*
    The property, stated once: if a handler writes, it must not be the GET.
    A bookmark, a crawler, a prefetch, a copied link and an address-bar
    navigation are all GETs, and none of them should be able to start a job.
  */
  const routes = [];
  const walk = (d) => {
    for (const e of readdirSync(new URL(d, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else if (e.name === "route.ts") routes.push(`${d}/${e.name}`);
    }
  };
  walk("../app/api");

  const strip = stripComments;
  const offences = [];
  for (const file of routes) {
    const s = strip(readFileSync(new URL(file, import.meta.url), "utf8"));
    const at = s.search(/export (?:const|async function) GET\b/);
    if (at < 0) continue;
    /*
      The handler's OWN body, by brace matching. Slicing to the next export
      swallowed every helper declared below it and reported a route that had
      already been fixed — the handler returns 405 for its two destructive
      branches, and the functions those branches used to call still live in
      the file because POST calls them now.
    */
    const open = s.indexOf("{", at);
    let depth = 0, end = open;
    for (let i = open; i < s.length; i += 1) {
      if (s[i] === "{") depth += 1;
      else if (s[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const body = s.slice(open, end + 1);
    if (!/(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\s+\w+/.test(body)) continue;
    /*
      Two stay, and both are reads whose writes are consequences rather than
      purposes:
        etsy/callback   the OAuth redirect; its state row is the credential
                        and is consumed by being used
        printify        "is Printify connected?", called on page load; it
                        deletes the stored token only when Printify itself
                        rejects it, tidying a credential already dead
      connect-sales starts an OAuth flow and records the state it just minted.
    */
    if (/etsy\/callback|api\/printify\/route|connect-sales/.test(file)) continue;
    if (file === "../app/api/shop-watch/listings/route.ts") {
      const writes=[...body.matchAll(/INSERT INTO\s+(\w+)/g)].map(match=>match[1]);
      assert.deepEqual(writes,["shop_watch_listing_display"],"GET may fill only its public listing cache");
      assert.doesNotMatch(body,/DELETE FROM|UPDATE\s+member_/);
      assert.match(body,/crossSiteWrite/);
      continue;
    }
    offences.push(file);
  }
  assert.deepEqual(offences, [],
    `these still do work on a GET:\n${offences.join("\n")}`);
});

test("D1716: a retired GET refuses without doing the work", () => {
  const s = readFileSync(new URL(
    "../app/api/shop-map/override-audit/route.ts", import.meta.url), "utf8");
  const at = s.search(/export async function GET\b/);
  assert.ok(at > -1, "the old verb must still answer, so an old link fails loudly");
  const body = s.slice(at, at + 400);
  assert.match(body, /status: 405/);
  assert.match(body, /Allow: "POST"/);
  assert.match(body, /Nothing was run/);
  assert.ok(!/INSERT INTO|DELETE FROM|UPDATE\s+\w+\s+SET/.test(body),
    "the 405 must not reach any write");
});

test("D1716: the cron posts its jobs", () => {
  const cron = readFileSync(new URL(
    "../scripts/add-scheduled-handler.mjs", import.meta.url), "utf8");
  assert.match(cron, /new Request\(site \+ path, \{ method: "POST" \}\)/,
    "the shared runner must post");
  /* And the two sequenced calls, which are written out longhand. */
  for (const path of ["/api/market/correlate", "/api/market/observe"]) {
    const at = cron.indexOf(path);
    assert.ok(at > -1, `${path} missing from the cron`);
    assert.match(cron.slice(at, at + 90), /method: "POST"/, `${path} still a GET`);
  }
});

test("D1721: the content policy is enforcing, with no unsafe-inline for scripts", () => {
  const raw = readFileSync(new URL("../scripts/add-scheduled-handler.mjs",
    import.meta.url), "utf8");
  const src = stripComments(raw);
  assert.match(src, /const CSP_REPORT_ONLY = false/,
    "report-only was the rollout, not the destination");
  /* Every directive she named must be present. */
  for (const directive of ["default-src", "script-src", "style-src", "img-src",
    "font-src", "connect-src", "frame-ancestors", "object-src", "base-uri",
    "form-action"])
    assert.ok(src.includes(directive), `missing directive: ${directive}`);
  /* The one prohibition that is absolute. */
  const scriptLine = src.split("\n").find(l => l.includes("script-src"));
  assert.ok(!/unsafe-inline|unsafe-eval/.test(scriptLine),
    `script-src must never be inline-permissive: ${scriptLine}`);
  /* And no wildcard that erases the protection. */
  assert.ok(!/script-src[^`]*\*[^.]/.test(scriptLine),
    "a wildcard host in script-src would erase the policy");
  /* The nonce must be per request, not a constant. */
  assert.match(src, /getRandomValues/, "a fixed nonce is not a nonce");
  assert.match(src, /new HTMLRewriter\(\)[\s\S]{0,200}setAttribute\("nonce"/,
    "every delivered script tag must carry it");
});
