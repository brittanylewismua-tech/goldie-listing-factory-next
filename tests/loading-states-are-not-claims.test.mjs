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

test("every interior page says what it is in the tab", () => {
  /*
    D1670 · /shop-map/costs had no title at all, so its tab read "Etsy seller
    tools" — the neutral fallback. That fallback exists for pages which must
    not name a product, not for a page that forgot to say what it is. It is a
    server component, so metadata is all it needed.
  */
  for (const [route, title] of [
    ["shop-map", "Shop Map"],
    ["shop-map/costs", "Production costs"],
    ["market-watch", "Market Watch"],
  ]) {
    const page = read(`${route}/page.tsx`);
    assert.match(page, new RegExp(`title: "${title}"`),
      `${route} has no tab title, so it falls back to the neutral one`);
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

test("the sweep says what it proved, and does not call narrow layout mobile", async () => {
  /*
    An iframe 375 CSS pixels wide makes the width media queries fire. It does
    not make the browser report a touch device, and this product's mobile
    rules need both halves — (max-width:820px) and (pointer:coarse) is what
    hides the Listing Factory shell behind the desktop gate. A sweep that
    satisfies one half proves narrow-width layout and nothing about touch.
  */
  const source = read("sweep-conditions.ts");
  assert.match(source, /export const MOBILE_GATE = "\(max-width: 820px\) and \(pointer: coarse\)"/);
  /* The quoted rule must still be the rule the stylesheet enforces. */
  const css = read("approved-functional.css");
  assert.match(css, /@media\(max-width:820px\) and \(pointer:coarse\)/,
    "the sweep quotes a gate the product no longer uses");

  const { conditionsOf } = await import("../app/sweep-conditions.ts");
  const reading = (over = { }) => ({ state: "x", askedWidth: 375, innerWidth: 375,
    clientWidth: 375, coarsePointer: false, mobileGateMatches: false,
    horizontalOverflow: 0, undersizedTargets: [], problems: [], ...over });

  const narrow = conditionsOf([reading(), reading()]);
  assert.equal(narrow.label, "narrow-layout verified",
    "a fine pointer can never be labelled mobile verification");
  assert.equal(narrow.coarsePointer, false);
  assert.equal(narrow.mobileGateMatched, false);

  const touch = conditionsOf([reading({ coarsePointer: true, mobileGateMatches: true })]);
  assert.equal(touch.label, "mobile verified");

  /* Every fact the reading must carry, so the result cannot be read as more
     than it is. */
  for (const field of ["innerWidth", "clientWidth", "coarsePointer",
    "mobileGateMatches", "horizontalOverflow", "undersizedTargets"])
    assert.ok(source.includes(`${field}:`), `the sweep does not report ${field}`);
});

test("the phone-width sweep is a control, not something done by hand once", () => {
  /*
    Twenty-two states were checked at 375, 390 and 430 by hand — sixty-six
    measurements, all clean — and a sweep done by hand is a sweep done once.
    It is a button now, and it measures the four things that actually go
    wrong at phone width rather than being a screenshot somebody eyeballed.
  */
  const source = read("dev/state-preview/preview-client.tsx");
  assert.match(read("sweep-conditions.ts"), /export const PHONE_WIDTHS = \[375, 390, 430\]/);
  assert.match(source, /scrolls sideways by/);
  assert.match(source, /wider than the screen/);
  assert.match(source, /tap target/);
  /* Each state gets a real CSS viewport, not a scaled screenshot: an iframe
     of that exact width is what makes the media queries fire. */
  assert.match(source, /width:\$\{width\}px/);
  /*
    The sweep opens this same component inside each iframe, so the control
    must not recurse — and `window` cannot be read during render, because
    this page is server-rendered first.
  */
  assert.match(source, /const \[topLevel, setTopLevel\] = useState\(false\)/);
  assert.match(source, /setTopLevel\(window\.self === window\.top\)/);
  assert.ok(!/\{window\.self === window\.top &&/.test(source),
    "reading window during render breaks the server render");
});

test("a subscription status is translated, never shown raw", async () => {
  /*
    Two statuses were translated and every other one fell through to Stripe's
    own identifier, so a member whose card failed read "past_due" on their
    account page. The fourth time this product has put an internal value in
    front of somebody: three database column names, a UTC timestamp, and now
    this.
  */
  const { subscriptionLabel } = await import("../app/account/settings/account-client.tsx")
    .catch(() => ({ subscriptionLabel: null }));
  const source = read("account/settings/account-client.tsx");
  assert.match(source, /const SUBSCRIPTION_LABELS: Record<string, string>/);
  assert.match(source, /subscriptionLabel\(usage\.billing\.subscription\.status\)/);
  for (const raw of ["past_due", "trialing", "unpaid", "incomplete"])
    assert.ok(source.includes(`${raw}:`), `${raw} has no human label`);
  /* An unknown status is made readable rather than leaked or dropped. */
  assert.match(source, /replace\(\/_\/g, " "\)/);
  void subscriptionLabel;
});

test("a readability measurement is kept with the design, not thrown away", () => {
  /*
    The measurement only ran when the request carried image bytes — the first
    scan of a design. Every scan after it is warm and sends no bytes, so a
    member reopening a design they scanned an hour ago was told "this design's
    readability could not be verified" about artwork that had measured clean
    on contrast, sharpness and thumbnail readability.

    Measured on the deployed build: a warm scan of the design from case 17
    returned contrast/sharpness/thumbnailReadable all "unverified", where the
    cold scan of the same hash had returned pass/pass/pass.

    The scan result was cached; the one thing taken from the pixels was not.
    Invisible until the measurement was rendered at all, which is the argument
    for rendering what you measure.
  */
  const route = read("api/design-scanner/scan/route.ts");
  assert.match(route, /const cached = \(upload as \{ imageQuality\?: ImageQuality \}\)\?\.imageQuality/,
    "a warm scan must read the measurement it already has");
  /* D1653 · and only at the version that produced it. */
  assert.match(route, /cached\?\.ruleVersion === QUALITY_RULE_VERSION \? cached : undefined/);
  assert.match(route, /if \(!measured && body\?\.imageDataUrl\)/,
    "the pixels are only measured when there is nothing stored");
  assert.match(route, /UPDATE scan_uploads SET payload_json = \?/,
    "a fresh measurement must be stored with the analysis it belongs to");
  /* And the honest fallback no longer implies a failure that did not happen.
     Comments may quote the old sentence; served strings may not. */
  const served = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/readability could not be verified/.test(served));
  assert.match(route, /has not been measured/);
});

test("a refused Shop Map correction is stated, not swallowed", () => {
  /*
    moveListing did `.catch(() => undefined)` and reloaded, so a member who
    moved a listing and was refused saw it sitting where it had been with no
    error — indistinguishable from a move that saved and was correctly shown.
    Correcting a classification is the one thing on that page a member does TO
    their data, which makes it the worst place for silence.
  */
  const source = read("shop-map/shop-map-client.tsx");
  assert.match(source, /const \[correctionFailed, setCorrectionFailed\] = useState\(""\)/);
  assert.ok(!/body: JSON\.stringify\(\{ action: "move-listing"[\s\S]{0,200}?\.catch\(\(\) => undefined\)/
    .test(source), "the correction must not swallow its own failure");
  assert.match(source, /The listing is where it was/);
  assert.match(source, /role="alert"/);
});

test("an uncertain draft creation is answered, not polled through", () => {
  /*
    The server sets `uncertain` when it cannot tell whether Printify created
    the product — the one status where the truthful answer is "we do not
    know". The poll loop matched succeeded, failed, connection_missing and
    not_found; uncertain fell through all four, so the member waited out 180
    attempts, about fifteen minutes, for a generic sentence about background
    checking that the server could have given on the first poll.
  */
  const source = read("listing-factory-app.tsx");
  const loop = source.slice(source.indexOf("async function recoverDraft"),
    source.indexOf("type DraftPreparation="));
  assert.match(loop, /if\(result\.status==="uncertain"\)throw new Error/,
    "uncertain must end the wait");
  assert.match(loop, /did not confirm whether this product was created/);
  /* And it must not invite the one action that could duplicate a product. */
  assert.ok(!/uncertain[\s\S]{0,400}?try again/i.test(loop),
    "an unknown creation outcome must not be answered with 'try again'");
  assert.match(loop, /a second attempt could duplicate it/);
});

test("a failed connection check does not disconnect the member or move them", () => {
  /*
    The worst instance of this defect in the product. checkPrintifyConnection
    and checkEtsyConnection both set connected=false when the CHECK failed, so
    a 500, a timeout or a dropped request made the whole workflow believe the
    member had no accounts: the step gate read "Not connected yet", the copy
    invited a first-time connection, and the fallback navigation moved them
    back to the connect step — away from the batch they were in the middle of.
  */
  const source = read("listing-factory-app.tsx");
  assert.match(source, /const \[connectionCheckFailed, setConnectionCheckFailed\] = useState\(false\)/);
  assert.match(source, /const \[etsyCheckFailed, setEtsyCheckFailed\] = useState\(false\)/);
  /* Neither catch may assert a disconnection it did not establish. */
  const printify = source.slice(source.indexOf("async function checkPrintifyConnection"),
    source.indexOf("useEffect(()=>{void checkPrintifyConnection()"));
  assert.ok(!/catch\(error\)\{setConnected\(false\)/.test(printify));
  assert.match(printify, /setConnectionCheckFailed\(true\)/);
  const etsy = source.slice(source.indexOf("async function checkEtsyConnection"),
    source.indexOf("async function loadEtsyShippingProfiles"));
  assert.ok(!/catch\(error\)\{setEtsyConnected\(false\)/.test(etsy));
  assert.match(etsy, /setEtsyCheckFailed\(true\)/);
  /* And an unanswered check must never relocate the member. */
  assert.match(source, /if\(connectionCheckFailed\|\|etsyCheckFailed\)return;const fallback=/);
  assert.match(source, /:connectionCheckFailed\|\|etsyCheckFailed\?"Your connections could not be checked"/);
});

test("a plan allowance that could not be read blocks creation rather than being absent", () => {
  /*
    planDraftsRemaining is null both when the allowance has not loaded yet AND
    when reading it failed, and the gate only fired when it was non-null. So a
    failed /api/usage silently removed the plan limit from draft creation,
    while batchDesignLimit fell back to the maximum at the same moment. A
    member whose allowance read had failed could create past their plan — the
    one kind of mistake here that costs real money and cannot be undone.

    Found in the state harness: the sidebar sat on "Loading usage…" while
    everything else had rendered, because the catch swallowed the failure.
  */
  const source = read("listing-factory-app.tsx");
  assert.match(source, /const \[sidebarUsageFailed,setSidebarUsageFailed\]=useState\(false\)/);
  assert.match(source, /\.catch\(\(\)=>setSidebarUsageFailed\(true\)\)/);
  /* The gate must refuse before the comparison that null silently skips. */
  const begin = source.slice(source.indexOf("function beginDraftCreation()"),
    source.indexOf("/** Stage every member"));
  const guard = begin.indexOf("sidebarUsageFailed");
  const compare = begin.indexOf("planDraftsRemaining!==null");
  assert.ok(guard > -1 && guard < compare,
    "the unreadable-allowance refusal must come before the plan comparison");
  assert.match(begin, /could not be read, so this batch was not started/);

  /* And the sidebar says so rather than claiming to still be loading. */
  assert.match(source, /sidebarUsageFailed\?"Allowance unavailable"/);
  const shell = read("factory-shell.tsx");
  assert.match(shell, /usageFailed \? "Allowance unavailable"/);
  assert.match(shell, /if \(!response\.ok\) throw new Error\("usage"\)/);
});

test("the product loader cannot outlive its own request", () => {
  /*
    Seen on the deployed build during the desktop walkthrough: selecting a
    saved product left "Loading product details…" on screen indefinitely,
    with no error, directly above "Connect its Printify template to
    continue" — a spinner and an instruction to act at the same time, and no
    way for the member to tell which was true. Still there minutes later.

    `loadingTemplate` was a plain boolean beside `templateLoadVersion`, and
    every exit from loadTemplateUrl is guarded by
    `requestVersion === templateLoadVersion.current`. That guard is right —
    a superseded request must not clear a newer one's flag — but it means the
    flag has no owner, so any path that bumps the version without starting a
    load leaves it set with nothing left to clear it.
  */
  const source = read("listing-factory-app.tsx");
  assert.match(source,
    /const \[loadingTemplateVersion, setLoadingTemplateVersion\] = useState\(0\)/,
    "the flag must hold the request that set it, not a bare boolean");
  assert.ok(!/setLoadingTemplate\(/.test(source),
    "the desyncable boolean must be gone entirely");
  /* Set to this request's version, and cleared only if it still owns it. */
  assert.match(source, /setLoadingTemplateVersion\(requestVersion\)/);
  assert.match(source,
    /setLoadingTemplateVersion\(current=>current===requestVersion\?0:current\)/);
  /* And it is loading only while that version is still the current one. */
  assert.match(source,
    /loadingTemplate=\{loadingTemplateVersion===templateLoadVersion\.current&&loadingTemplateVersion>0\}/);
});

test("a product whose details could not be read says so, with a way to retry", () => {
  /* The third state this had no room for: not loading, and no details. That
     is a failure, not a quiet finish. */
  const tools = read("factory-tools.tsx");
  assert.match(tools, /could not be read from Printify/);
  assert.match(tools, /Nothing about the product has changed/);
  assert.match(tools, /role="alert"/);
  assert.match(tools, /onVerifyTemplate\(props\.templateUrl\)\}>Try again/);
  /* The spinner and the failure are mutually exclusive branches of one
     expression, so they can never both render. */
  const block = tools.slice(tools.indexOf('activeId&&!bundleForm&&<div className="selected-summary-block"'),
    tools.indexOf('activeId&&!bundleForm&&<div className="selected-summary-block"') + 900);
  assert.match(block, /props\.loadingTemplate\?[\s\S]*?:props\.templateUrl&&!props\.templateVerified\?/);
});
