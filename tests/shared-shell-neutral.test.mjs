/*
  THE SHARED SHELL CARRIES NO PRODUCT NAME.

  The umbrella product has not been named. Until it is, the chrome every
  feature wears carries no name, no wordmark and no mark — and no placeholder
  standing in for one, because a placeholder in a rail, a tab title or a
  home-screen tile is exactly how a temporary name becomes the real one.

  Features may name themselves: Listing Factory, Design Scanner, Market Watch,
  Shop Watch, Shop Map, Trademark Checker. The Listing Factory's wordmark is a
  FEATURE's mark and belongs on its own pages only.

  Infrastructure is deliberately out of scope: event names, storage keys,
  bucket bindings, User-Agent strings and the domain are not what a member
  reads, and churning them would be risk without benefit.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = new URL("../app/", import.meta.url).pathname;
const read = name => readFileSync(join(APP, name), "utf8");

/* Files a member reads from, rather than the whole tree. */
const MEMBER_SURFACES = [
  "data-lifecycle.ts", "capability-registry.ts", "suite-plans.ts",
  "signup/signup-client.tsx", "connections/connections-client.tsx",
  "usage/page.tsx", "returning-command-center.tsx", "wait-progress.tsx",
  "market-update.ts", "niche-candidates.ts", "finance-periods.ts",
  "shop-map-monthly.ts", "design-compare.ts", "plan-limits.ts",
  "factory-shell.tsx", "mobile-gate.tsx", "mobile-shell.tsx", "layout.tsx",
  "home/page.tsx", "more/page.tsx",
  "market-watch/market-watch-client.tsx", "shop-map/shop-map-client.tsx",
  "shop-map/costs/costs-client.tsx", "design-scanner/design-scanner-client.tsx",
  "trademark/page.tsx", "production-cost.ts", "deletion-plan.ts",
  /*
    D1663 · THE BIGGEST MEMBER-FACING FILE IN THE PRODUCT WAS NOT ON THIS LIST.

    listing-factory-app.tsx renders the workflow a member spends nearly all
    their time in, and it shipped a footer reading "GOLDIE LISTING FACTORY"
    through the whole branding pass. Found by reading the deployed page, not
    by any check. These were missing too.
  */
  "listing-factory-app.tsx", "mastermind/code-gate.tsx", "mastermind/page.tsx",
  "trial-reminder.ts", "support-chat.tsx", "batches/page.tsx",
  "keywords/page.tsx", "account/settings/account-client.tsx",
];

/*
  WHAT COUNTS AS BRANDING, AND WHAT IS JUST A NAME IN THE CODE.

  An allowlist of identifiers grew unmanageably and kept needing new entries
  for things no member will ever read — a Stripe plan key, CSS class names, a
  component, a User-Agent string. The distinction that actually matters is
  whether the word appears as PROSE: a sentence a member reads, rather than a
  token a program uses.

  So the check looks for the word used as a word — followed by a space and an
  ordinary word, or ending a sentence — which is how it reads in copy, and not
  how it appears in `PLANS.goldie`, `goldie-wait-card` or `GoldieButton`.

  Deliberately out of scope either way: storage keys, event names, bucket
  bindings, the domain, and the asset files themselves.
*/

/*
  THE WORD USED AS A NAME, IN ANY CASE — NOT JUST IN A LOWERCASE SENTENCE.

  The first version required the name to be followed by a space and a
  LOWERCASE word, an apostrophe, or sentence punctuation. That catches
  "Goldie found three listings" and misses the loudest use there is: a
  wordmark. "GOLDIE LISTING FACTORY" is all caps and followed by a capital,
  so it matched nothing — and sat in the workflow footer, on the signup hero,
  on the beta gate and in a trial reminder email, right through a pass whose
  whole purpose was removing it.

  So the match is the word standing alone, case-insensitively, and the
  distinction between copy and code is drawn where it actually lies: an
  identifier runs the word into adjacent letters (GoldieStatus, goldieHosts,
  goldie-g.png), a name does not. The few remaining non-copy uses are named
  individually with a reason, because each one is a real thing a member never
  reads rather than a hole in the rule.
*/
const NOT_COPY = [
  /* A User-Agent this worker sends to the USPTO. Seen by their servers. */
  /"Goldie\/[\d.]+/,
  /* Real addresses. A domain and a mailbox are not a product name. */
  /goldie@beawolfbiz\.com/,
  /thegoldiesuite\.com/,
  /* A DOM event name, shared across chunks by construction. */
  /"goldie:[a-z-]+"/,
  /* A window property used to hold the install prompt. */
  /goldie(?:Install|Hosts)[A-Za-z]*/,
  /* The Stripe plan key, which is data in an account row. */
  /PLANS\[?\.?["']?goldie/,
  /* A history event the shell listens for. */
  /"goldie-history-loaded"/,
  /*
    A SENTINEL THAT MUST NOT BE RENAMED.

    The image-id test route refuses to delete anything whose title does not
    start with "GOLDIE INTERNAL". That prefix is the guard which, earlier in
    this project, refused to delete a real customer product — the ID had come
    from a batch thumbnail and turned out to be the live source template.

    Test drafts already sitting in the shop carry that exact title, so
    changing the prefix would stop the guard recognising them and turn a
    safety catch into a no-op. It is never published and no member ever reads
    it. This is the case the branding instruction reserves: a legacy internal
    identifier where renaming creates risk.
  */
  /"GOLDIE INTERNAL/,
  /startsWith\("GOLDIE INTERNAL"\)/,
];

function brandingProse(source) {
  const text = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const found = [];
  /*
    The word standing alone. Identifier punctuation on either side means code,
    and it means code in every form this repo actually uses: module paths
    ("./goldie-ui"), event names ("goldie-publish-selection"), storage keys
    (`goldie-colors-${id}`), query params (goldie_retry), domains, mailboxes
    and version strings. One rule instead of an allowlist that kept growing.
  */
  for (const match of text.matchAll(/(?<![A-Za-z0-9_\-./@:])goldie(?![A-Za-z0-9_\-./@:])/gi)) {
    const context = text.slice(Math.max(0, match.index - 60), match.index + 60);
    if (NOT_COPY.some(pattern => pattern.test(context))) continue;
    /*
      A quoted string that is EXACTLY the lowercase word is a key, not copy:
      the Stripe plan key, the PlanKey union, the comparisons against it. A
      quoted string containing the word among OTHER words is copy — which is
      what keeps "GOLDIE LISTING FACTORY" caught while `"goldie"` is not.
    */
    const before = text[match.index - 1];
    const after = text[match.index + match[0].length];
    const quote = ch => ch === '"' || ch === "'" || ch === "`";
    if (quote(before) && quote(after) && match[0] === "goldie") continue;
    found.push(text.slice(Math.max(0, match.index - 20), match.index + 30).trim());
  }
  return found;
}

test("no member-facing surface names the old product", () => {
  const offenders = [];
  for (const file of MEMBER_SURFACES) {
    let source;
    try { source = read(file); } catch { continue; }
    const found = brandingProse(source);
    if (found.length) offenders.push(`${file} (${found.length})`);
  }
  assert.deepEqual(offenders, [],
    `these still show the old product name: ${offenders.join(", ")}`);
});

test("the rail's wordmark is the Listing Factory's, and only on its pages", () => {
  const identity = read("shell-identity.ts");
  const shell = read("factory-shell.tsx");
  /* Home is the way in to everything, so it is NOT a Listing Factory page. */
  assert.match(identity, /new Set<ShellSection>\(\["factory", "batches", "keywords"\]\)/,
    "Home is the way in to everything and is not a Listing Factory page");
  assert.match(shell, /showsListingFactoryWordmark\(active\) && \(/,
    "the wordmark must be conditional, not always rendered");
  /* And nothing stands in for it elsewhere. */
  const rail = shell.slice(shell.indexOf("<header className=\"topbar\">"),
    shell.indexOf("<div className=\"factory-main\">"));
  assert.doesNotMatch(rail, /suite|Suite/,
    "the shared rail must not name an umbrella product");
});

test("no page title, manifest or install prompt names a product", () => {
  const layout = read("layout.tsx");
  assert.match(layout, /NEUTRAL_FALLBACK_TITLE/);
  assert.doesNotMatch(layout, /goldie-g\.png|apple-touch-icon/i,
    "a favicon is a mark in the place a member looks most often");
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  for (const field of ["name", "short_name", "description"])
    assert.doesNotMatch(String(manifest[field] ?? ""), /goldie|suite/i);
});

test("the neutral fallback is a description, not a coined name", () => {
  const identity = read("shell-identity.ts");
  const match = /NEUTRAL_FALLBACK_TITLE = "([^"]+)"/.exec(identity);
  assert.ok(match, "there must be exactly one place to change when the name exists");
  const title = match[1];
  assert.ok(title.split(" ").length >= 2,
    "a single word reads as a product name rather than a description");
  assert.doesNotMatch(title, /goldie|suite/i);
});

test("each feature names itself in its own tab title", () => {
  const identity = read("shell-identity.ts");
  for (const name of ["Listing Factory", "Design Scanner", "Market Watch",
    "Shop Map", "Trademark Checker"])
    assert.ok(identity.includes(`"${name}"`), `${name} has no tab title`);
  /* No suffix: a suffix is where a suite name would go. */
  assert.doesNotMatch(identity, /\$\{.*\} · |" · "/,
    "a title suffix is a product name waiting to happen");
});


test("nothing anywhere in the app writes the old product name as prose", () => {
  /*
    The listed surfaces above are the ones a member is certain to read. This
    is the wider net: any file in the application that uses the word as a
    word, wherever it lives. A string only has to reach a screen once.

    Code identifiers are not prose and are not flagged — `PLANS.goldie`,
    `goldie-wait-card`, `GoldieButton`, the User-Agent and the Stripe plan key
    all pass, because none of them is a sentence anybody reads.
  */
  const offenders = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        const found = brandingProse(readFileSync(full, "utf8"));
        if (found.length) offenders.push(full.slice(APP.length));
      }
    }
  };
  walk(APP);
  assert.deepEqual(offenders, [],
    `these write the old product name as prose: ${offenders.join(", ")}`);
});
