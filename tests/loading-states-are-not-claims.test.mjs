/*
  AN EMPTY STATE IS A CLAIM. IT MAY ONLY BE MADE ONCE THERE IS AN ANSWER.

  Measured on the deployed build: /connections rendered "No Etsy shop connected
  yet" and "Not connected" for about six seconds — on an account where both
  ARE connected and the Listing Factory was publishing to that very shop. The
  page had no loading state, so "we have not asked yet" and "the answer is
  none" were the same screen.

  That is worse than an unstyled spinner. A member reading it would reasonably
  go and reconnect a shop that was never disconnected.

  Four pages shared the shallower version of the same defect — a single
  sentence as the whole loading state, on pages that wait on Etsy, Printify or
  billing: Shop Map, Batch History, Connections and Usage.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");

test("connections never claims a shop is disconnected before it has looked", () => {
  const source = read("connections/connections-client.tsx");
  assert.match(source, /const \[loaded, setLoaded\] = useState\(false\)/,
    "the page must be able to tell 'not asked yet' from 'the answer is none'");
  assert.match(source, /finally \{ setLoaded\(true\); \}/,
    "loaded must be set even when the request fails, or the page waits forever");
  /* The empty state is gated on having an answer. */
  assert.match(source, /\{loaded && !failed && shops\.length === 0 && \(/);
  assert.match(source, /\{!loaded && \(/);
  /* And the Printify block too — it made the same claim. */
  assert.match(source, /\{loaded && !failed && <div className="shop">/);
  /*
    A FAILED LOAD IS NOT AN EMPTY ONE.

    Found with the state preview on `connections-api-error`: with both
    endpoints failing, `loaded` became true while `shops` was still empty, so
    the page showed the error AND "No Etsy shop connected yet" beneath it —
    the same false claim reached through the other door.
  */
  assert.match(source, /const \[failed, setFailed\] = useState\(false\)/);
  assert.match(source, /setFailed\(true\)/);
});

test("a failed load says nothing changed, rather than showing an empty shop", () => {
  const source = read("connections/connections-client.tsx");
  assert.match(source, /Nothing has changed — /,
    "a member who sees an error about their connections needs to know their "
    + "shop was not altered by it");
});

test("pages that wait on a provider draw the shape of what is coming", () => {
  /* A sentence gives the member nothing to look at and makes the page jump
     when the answer lands. */
  for (const [file, what] of [
    ["shop-map/shop-map-client.tsx", "Shop Map"],
    ["batches/page.tsx", "Batch History"],
    ["connections/connections-client.tsx", "Connections"],
    ["usage/page.tsx", "Plan and limits"],
  ]) {
    const source = read(file);
    assert.match(source, /p-skeleton/, `${what} still uses a bare loading sentence`);
    assert.match(source, /role="status"/, `${what}'s loading state is not announced`);
  }
});

test("client-component pages carry a route layout so the tab has a name", () => {
  /* `export const metadata` is silently ignored in a "use client" page, so
     these fell through to the neutral fallback and every tab read the same. */
  for (const [route, title] of [
    ["usage", "Plan and limits"],
    ["connections", "Connections"],
    ["trademark", "Trademark Checker"],
    ["batches", "Batch History"],
    ["keywords", "Keyword Banks"],
  ]) {
    const layout = read(`${route}/layout.tsx`);
    assert.match(layout, new RegExp(`title: "${title}"`),
      `${route} has no route layout, so its tab has no name`);
  }
});

test("the account page never shows a raw field name to a member", () => {
  /*
    The data counts rendered straight from the API: "designAnalyses",
    "capturedArtwork", "etsyShops" — internal identifiers, in camelCase, on an
    account page. Styled database output, not an interface.
  */
  const source = read("account/settings/account-client.tsx");
  assert.match(source, /const COUNT_LABELS: Record<string, string>/);
  assert.match(source, /labelFor\(name\)/, "counts must be rendered through the label map");
  /* An unknown key is humanised rather than dropped, so a count added to the
     API later appears as words instead of vanishing. */
  assert.match(source, /replace\(\/\(\[a-z\]\)\(\[A-Z\]\)\/g, "\$1 \$2"\)/);
  for (const raw of ["designAnalyses", "capturedArtwork", "etsyShops"])
    assert.ok(source.includes(`${raw}:`), `${raw} has no human label`);
});

test("access is read from the plan, not from the subscription", () => {
  /*
    A first version keyed the access line on `billing.active` and told an
    account with full access that it had "No active plan" — its plan was
    "Owner testing", which needs no subscription. Billing describes a
    subscription; the plan describes what the member can do.
  */
  const source = read("account/settings/account-client.tsx");
  const accessLine = source.slice(source.indexOf("<span>Access</span>"),
    source.indexOf("<span>Subscription</span>"));
  assert.match(accessLine, /usage\?\.plan\?\.name/);
  assert.ok(!accessLine.includes("billing?.active"),
    "access must not be decided by whether Stripe has an active subscription");
});

test("deletion is a real flow, with no sentence apologising for itself", () => {
  /*
    This used to assert the OPPOSITE: that no delete control existed, because
    execution was withheld during the beta and the page carried a sentence
    saying so. The backend path is proven now — scoped plan, append-only audit,
    idempotent retry, exercised against a seeded store and a disposable
    identity — so the control is wired and the apology is gone.
  */
  const source = read("account/settings/account-client.tsx");
  assert.match(source, /Delete my data/);
  assert.match(source, /DELETE MY DATA/, "the exact phrase must be required");
  assert.match(source, /phrase\.trim\(\) !== "DELETE MY DATA"/,
    "the confirm control stays disabled until the phrase matches exactly");
  assert.match(source, /This cannot be undone/);
  /* Success states the counts rather than reassuring. */
  assert.match(source, /done\.removed\.map/);
  /*
    AND NO PERMANENT NOTE EXPLAINING THAT THE FEATURE IS UNFINISHED —
    ANYWHERE A MEMBER CAN READ IT.

    This checked the client only. The sentence lived in the API: the account
    data route served "deletion is carried out by hand … ask and it will be
    done" to every member long after the route that does it was built and
    wired. A guard aimed at one of the two places a string can live is a
    guard that reports success while the string is still on screen.
  */
  for (const file of ["account/settings/account-client.tsx",
    "api/account/data/route.ts", "api/account/delete/route.ts"]) {
    const text = read(file);
    /* Comments explain history; served strings must not. */
    const served = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/carried out by hand/.test(served),
      `${file} still tells members deletion is done by hand`);
    assert.ok(!/private beta|during the beta/i.test(served),
      `${file} dates a member-facing sentence to a phase that is ending`);
  }
});

test("market watch tells waiting, broken and genuinely empty apart", () => {
  /*
    The third page in this product to ship the Connections defect. Both
    loaders did `if (!response.ok) return;` and swallowed a thrown request,
    leaving the list at its initial `[]` — so a member whose watches failed to
    load was shown the new-member invitation, and that same invitation flashed
    on every load before the data arrived.
  */
  const source = read("market-watch/market-watch-client.tsx");
  assert.match(source, /type Load<T> = \{ status: "loading" \| "ready" \| "failed"; data: T \}/);
  /* No loader may return without recording which of the three happened. */
  assert.ok(!/if \(!response\.ok\) return;/.test(source),
    "a failed response must set the failed state, not fall through to empty");
  /* The empty sentence is reachable only through the state machine. */
  assert.match(source, /function WatchList\(/);
  assert.match(source, /load\.data\.length === 0 \? <p className="empty">\{empty\}<\/p> : children/);
  assert.match(source, /load\.status === "loading" && load\.data\.length === 0/);
  assert.match(source, /load\.status === "failed" && load\.data\.length === 0/);
  /* A failed refresh over data already on screen keeps the data. */
  assert.match(source, /Showing what was loaded before/);
  assert.match(source, /p-skeleton/, "the wait must draw the shape of what is coming");
});

test("a shop card's sections sit under the shop, not beside it", () => {
  /* The shop name and every section heading were both <h3>, so nothing in the
     document structure said which shop a section belonged to. */
  const source = read("market-watch/market-watch-client.tsx");
  assert.match(source, /<h2 className="shop-name">\{shop\.shopName\}<\/h2>/);
  assert.match(source, /<h3 className="section-name">\{name\}<\/h3>/);
});

test("every state fixture answers the endpoints its surface actually calls", () => {
  /*
    BOTH MARKET WATCH FIXTURES NAMED A PATH THE PAGE NEVER CALLS.

    They answered `/api/market/shop-watch` — the worker's refresh route —
    while the client fetches `/api/shop-watch/brief`. The interceptor refuses
    anything unfixtured, so the shops request threw in every preview and the
    page swallowed it into an empty list: the fixture demonstrated the very
    defect it existed to catch, and agreed with it.

    So the fixtures are checked against the client's own fetch calls rather
    than against somebody's memory of them.
  */
  const fixtures = read("state-fixtures.ts");
  const surfaces = {
    "connections": "connections/connections-client.tsx",
    "market-watch": "market-watch/market-watch-client.tsx",
    "shop-map": "shop-map/shop-map-client.tsx",
    "account": "account/settings/account-client.tsx",
  };
  for (const [surface, file] of Object.entries(surfaces)) {
    const client = read(file);
    const called = new Set();
    for (const [, path] of client.matchAll(/fetch\(\s*[`"'](\/api\/[^`"'?${\s]+)/g))
      called.add(path);
    assert.ok(called.size > 0, `${surface}: no fetch calls found — the guard would pass blindly`);

    /* Every reply path declared for this surface, across all its fixtures. */
    const answered = new Set();
    for (const block of fixtures.split(/\{ key: "/).slice(1)) {
      if (!block.includes(`surface: "${surface}"`)) continue;
      for (const [, path] of block.matchAll(/path: "(\/api\/[^"]+)"/g)) answered.add(path);
    }

    for (const path of answered)
      assert.ok([...called].some(one => one.startsWith(path) || path.startsWith(one)),
        `${surface} fixtures answer ${path}, which the page never calls`);
  }
});

test("a fixture can answer a write without breaking the read beside it", async () => {
  /*
    One path could only have one answer, so the fixture for "the niche you
    tried to add was refused" (POST → 400) also answered the GET that loads
    the saved list. The preview showed a broken list instead of the refusal,
    which means no write state could be previewed at all.
  */
  const { replyFor, fixtureFor } = await import("../app/state-fixtures.ts");
  const refused = fixtureFor("market-watch-unsupported");
  assert.ok(refused, "the refusal fixture is missing");
  assert.equal(replyFor(refused, "/api/market-watch/niches", "GET").status, 200,
    "the saved list must still load while a refusal is being shown");
  assert.equal(replyFor(refused, "/api/market-watch/niches", "POST").status, 400);
  /* Defaulting to GET keeps every fixture written before this unchanged. */
  assert.equal(replyFor(refused, "/api/market-watch/niches").status, 200);
});

test("a fixture that lives in a sub-view opens in that sub-view", async () => {
  /*
    Two Market Watch fixtures described Shop Watch states and rendered the
    niche tab, because the preview always mounted the component at its
    default. Both read as verified. A state one click away from what is on
    screen has not been looked at.
  */
  const { stateFixtures } = await import("../app/state-fixtures.ts");
  const shopStates = stateFixtures().filter(one =>
    one.surface === "market-watch" && one.key.includes("shop"));
  assert.ok(shopStates.length >= 2, "the shop fixtures are missing");
  for (const one of shopStates)
    assert.equal(one.at, "shops", `${one.key} would open on the wrong tab`);

  const preview = read("dev/state-preview/preview-client.tsx");
  assert.match(preview, /<Surface key=\{key\} at=\{fixture\?\.at\}/,
    "the preview must pass the sub-view through, and remount when it changes");

  /* And the tab is a real address, not only a preview hook. */
  const client = read("market-watch/market-watch-client.tsx");
  assert.match(client, /const tabFromUrl = /);
  assert.match(client, /url\.searchParams\.set\("tab", "shops"\)/);
});

test("the scanner shows what it measured about the artwork", () => {
  /*
    contrast, sharpness and thumbnail survival were measured on every scan,
    returned by the API, and rendered NOWHERE. A member was told how their
    design compares with what is moving and nothing about whether it is
    legible at the size a buyer first sees it — the measurement existed,
    was unit tested, and never reached a screen.
  */
  const source = read("design-scanner/design-scanner-client.tsx");
  assert.match(source, /function ImageQuality\(/);
  assert.match(source, /imageQuality\?: \{/, "the result type must carry the measurement");
  /* Rendered on BOTH branches: a refused comparison still measured the art. */
  const uses = source.match(/<ImageQuality quality=\{result\.imageQuality\} \/>/g) ?? [];
  assert.equal(uses.length, 2, "the measurement must survive a refused comparison");
  /* Every note is its own line — one measurement never explains the other. */
  assert.match(source, /notes\.map\(note => <li key=\{note\}>\{note\}<\/li>\)/);
  /* And a clean scan says nothing rather than ticking every box. */
  assert.match(source, /if \(!notes\.length && !unverified\) return null;/);
});

test("the scanner's saved list tells a failed load from an empty one", () => {
  const source = read("design-scanner/design-scanner-client.tsx");
  assert.match(source, /const \[historyFailed, setHistoryFailed\] = useState\(false\)/);
  /* Scoped to the history loader: the saved-niche dropdown beside it is a
     convenience with a working fallback — the field still accepts anything
     typed — so its failure is allowed to be quiet. The saved scans are not. */
  const loader = source.slice(source.indexOf("const loadHistory"),
    source.indexOf("useEffect(() => { void loadHistory"));
  assert.ok(!/return;\s*\}\s*$/m.test(loader.split("setHistoryFailed(true); return;")[0]
    .split("if (!response.ok)")[1] ?? ""), "the history loader must record a failure");
  assert.match(loader, /if \(!response\.ok\) \{ setHistoryFailed\(true\); return; \}/);
  assert.match(source, /None of them have been changed/);
});

test("the readability fixtures prove contrast and softness stay independent", async () => {
  /*
    The defect this guards was a correction that did not match the problem:
    a blurred design was told its contrast was wrong. These three states are
    the proof that each measurement speaks for itself, and that when both
    fail the member is told both.
  */
  const { fixtureFor } = await import("../app/state-fixtures.ts");
  const faint = fixtureFor("scanner-quality-faint");
  const soft = fixtureFor("scanner-quality-soft");
  const both = fixtureFor("scanner-quality-both");
  const notesOf = one => one.replies
    .find(reply => reply.method === "POST").body.imageQuality.notes;

  assert.equal(notesOf(faint).length, 1);
  assert.match(notesOf(faint)[0], /too close together/);
  assert.ok(!/edges/.test(notesOf(faint)[0]), "a faint design is not told it is blurred");

  assert.equal(notesOf(soft).length, 1);
  assert.match(notesOf(soft)[0], /edges/);
  assert.ok(!/close together/.test(notesOf(soft)[0]), "a blurred design is not told it is faint");

  assert.equal(notesOf(both).length, 2, "when both fail, say both");
});

test("no page component refuses by returning a Response", () => {
  /*
    app/dev/state-preview/page.tsx returned NextResponse.json({error:"Not
    found."}) cast `as never`. A page must return JSX or throw a navigation
    signal, so every signed-out request to that route answered 500 and
    rendered the crash boundary rather than a 404 — visible only from a
    signed-out browser, which is why it survived.
  */
  const root = new URL("../app/", import.meta.url);
  const pages = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
      else if (entry.name === "page.tsx") pages.push(new URL(entry.name, dir));
    }
  };
  walk(root);
  assert.ok(pages.length > 5, "no pages found — the guard would pass blindly");
  for (const file of pages) {
    /* Comments may name it; code may not. */
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/NextResponse/.test(source),
      `${file.pathname} returns a Response from a page component, which throws at render`);
  }
});

test("the observation sample is taken after the work it measures", () => {
  /*
    correlate and observe were two separate waitUntil calls on the same cron
    firing, so they ran concurrently and whichever won decided what the gate
    recorded. Backlog read 338, then 0, then 109, then 122 — an instrument
    reading its own race, not work piling up. Measured while diagnosing it:
    pastEarliest 122, one pass correlated all 122 in 908ms with zero Etsy
    calls, pastEarliest 0 immediately after; coverage 1 across the segment
    and nothing expired, so no evidence was ever lost.

    A gate that fails on an artifact of its own measurement teaches the
    operator to ignore the number.
  */
  const entry = readFileSync(new URL("../scripts/add-scheduled-handler.mjs", import.meta.url),
    "utf8");
  const tick = entry.slice(entry.indexOf('if (event.cron === "*/10'),
    entry.indexOf("SCHEMA FIRST"));
  assert.ok(!/run\("\/api\/market\/observe"\)/.test(tick),
    "observe must not be fired beside the work it measures");
  const sequenced = tick.slice(tick.indexOf("ctx.waitUntil((async"));
  assert.ok(sequenced.indexOf("/api/market/correlate") < sequenced.indexOf("/api/market/observe"),
    "the sample must be taken after the correlator has run");
  assert.match(sequenced, /await app\.fetch\(new Request\(site \+ "\/api\/market\/correlate"\)/);
});
