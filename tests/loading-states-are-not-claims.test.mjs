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
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");

test("connections never claims a shop is disconnected before it has looked", () => {
  const source = read("connections/connections-client.tsx");
  assert.match(source, /const \[loaded, setLoaded\] = useState\(false\)/,
    "the page must be able to tell 'not asked yet' from 'the answer is none'");
  assert.match(source, /finally \{ setLoaded\(true\); \}/,
    "loaded must be set even when the request fails, or the page waits forever");
  /* The empty state is gated on having an answer. */
  assert.match(source, /\{loaded && shops\.length === 0 && \(/);
  assert.match(source, /\{!loaded && \(/);
  /* And the Printify block too — it made the same claim. */
  assert.match(source, /\{loaded && <div className="shop">/);
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
