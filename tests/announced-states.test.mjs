/*
  A STATE NOBODY HEARS IS A STATE THAT DID NOT HAPPEN.

  Every member page tells you what went wrong, what is loading, and what
  succeeded — in writing. A member using a screen reader gets none of that
  unless the region says so. Market Watch had NO live region of any kind, on
  the one page whose content swaps under you when you choose a tab, and Shop
  Map's production costs announced neither the failure nor the progress of
  the single action on the page that touches money.

  This is functional, not presentational, and it survives a reskin only if
  something holds it.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/*
  Comments are stripped before counting. An earlier version of the tab check
  counted the role="tab" inside the comment that explains the rule, reported
  three tabs on a page with two, and sent me looking for a tab that does not
  exist — the same mistake this suite caught once already.
*/
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const read = (p) => strip(readFileSync(new URL(p, import.meta.url), "utf8"));

/* The member-facing clients. Owner and operator surfaces are out of scope. */
const CLIENTS = [
  "../app/market-watch/market-watch-client.tsx",
  "../app/shop-map/shop-map-client.tsx",
  "../app/shop-map/costs/costs-client.tsx",
  "../app/design-scanner/design-scanner-client.tsx",
  "../app/trademark/page.tsx",
  "../app/connections/connections-client.tsx",
  "../app/account/settings/account-client.tsx",
];

test("every member page can announce something", () => {
  const silent = CLIENTS.filter(file => {
    const s = read(file);
    return !/aria-live|role="alert"|role="status"/.test(s);
  });
  assert.deepEqual(silent, [],
    `these pages announce nothing:\n${silent.join("\n")}`);
});

test("every member-facing error is an alert", () => {
  /*
    An error rendered as ordinary text is read only if the member happens to
    navigate to it, which they will not, because they do not know it appeared.
  */
  const offences = [];
  for (const file of CLIENTS) {
    const s = read(file);
    for (const match of s.matchAll(/\{error && <(\w+)([^>]*)>/g))
      if (!/role="alert"/.test(match[2]))
        offences.push(`${file} — <${match[1]}> renders error without role="alert"`);
  }
  assert.deepEqual(offences, [], offences.join("\n"));
});

test("a tab controls a panel, or it is not a tab", () => {
  /*
    Market Watch carried role="tab" and aria-selected with no tabpanel on the
    page at all, so a screen reader announced a tab that governs no region and
    choosing one changed nothing it could report.
  */
  for (const file of CLIENTS) {
    const s = read(file);
    if (!/role="tab"/.test(s)) continue;
    const tabs = [...s.matchAll(/role="tab"/g)].length;
    const controls = [...s.matchAll(/aria-controls=/g)].length;
    assert.ok(controls >= tabs,
      `${file}: ${tabs} tabs but only ${controls} aria-controls`);
    assert.match(s, /role="tabpanel"/, `${file}: tabs with no panel`);
    assert.match(s, /aria-labelledby=/,
      `${file}: the panel must name which tab it belongs to`);
  }
});

test("an action that takes time reports that it is busy", () => {
  /* Disabled alone says "you cannot press this", not "this is working". */
  for (const file of ["../app/shop-map/costs/costs-client.tsx",
    "../app/market-watch/market-watch-client.tsx"]) {
    const s = read(file);
    assert.match(s, /aria-busy=/, `${file}: no busy state reaches assistive tech`);
  }
});
