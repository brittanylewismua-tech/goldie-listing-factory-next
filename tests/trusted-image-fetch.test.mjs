/*
  FETCHING AN IMAGE SOMEBODY ELSE IS HOSTING.

  Behavioural: these call the real guard and the real reader with a stubbed
  network, so what is proven is what the code does, not what it says.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { trustedImageUrl, fetchTrustedImage, limitedImageBody,
  UntrustedImageUrl, ImageTooLarge } from "../app/trusted-image-fetch.ts";

const refused = async (fn) => {
  await assert.rejects(fn, (e) => e instanceof UntrustedImageUrl);
};

test("only https, and no credentials smuggled into the address", () => {
  assert.throws(() => trustedImageUrl("http://i.etsystatic.com/a.jpg"), UntrustedImageUrl);
  assert.throws(() => trustedImageUrl("ftp://i.etsystatic.com/a.jpg"), UntrustedImageUrl);
  /* user:pass@host would send credentials we never meant to send. */
  assert.throws(() => trustedImageUrl("https://u:p@i.etsystatic.com/a.jpg"), UntrustedImageUrl);
  assert.equal(trustedImageUrl("https://i.etsystatic.com/a.jpg"),
    "https://i.etsystatic.com/a.jpg");
});

test("an unknown host is refused, not quietly fetched", () => {
  for (const bad of ["https://evil.test/a.jpg",
    "https://i.etsystatic.com.evil.test/a.jpg",
    "https://localhost/a.jpg", "https://169.254.169.254/latest/meta-data"])
    assert.throws(() => trustedImageUrl(bad), UntrustedImageUrl, `accepted ${bad}`);
});

test("a redirect cannot leave the host it started on", async () => {
  const hops = [];
  globalThis.fetch = async (url) => {
    hops.push(String(url));
    return new Response(null, { status: 302,
      headers: { location: "https://evil.test/steal.jpg" } });
  };
  await refused(() => fetchTrustedImage("https://i.etsystatic.com/a.jpg"));
  assert.equal(hops.length, 1, "it must refuse before following the redirect");
});

test("a same-host redirect is followed", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 302,
      headers: { location: "https://i.etsystatic.com/b.jpg" } });
    return new Response(new Uint8Array([1, 2, 3]),
      { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  const out = await fetchTrustedImage("https://i.etsystatic.com/a.jpg");
  assert.equal(calls, 2);
  assert.equal(out.type, "image/jpeg");
  assert.equal(out.bytes.length, 3);
});

test("a redirect loop ends rather than spinning", async () => {
  globalThis.fetch = async () => new Response(null, { status: 302,
    headers: { location: "https://i.etsystatic.com/again.jpg" } });
  await refused(() => fetchTrustedImage("https://i.etsystatic.com/a.jpg"));
});

test("something that is not an image is refused by what it IS, not what it is called", async () => {
  /* The name says .jpg; the response says otherwise. */
  globalThis.fetch = async () => new Response("<html>hi</html>",
    { status: 200, headers: { "content-type": "text/html" } });
  await refused(() => fetchTrustedImage("https://i.etsystatic.com/looks-like.jpg"));
});

test("an oversized body is abandoned mid-stream, not buffered then judged", async () => {
  let cancelled = false;
  let produced = 0;
  const body = new ReadableStream({
    pull(controller) {
      produced += 1;
      /* Far more than the cap, one megabyte at a time. */
      controller.enqueue(new Uint8Array(1024 * 1024));
      if (produced > 200) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const response = new Response(body, { headers: { "content-type": "image/png" } });
  await assert.rejects(() => limitedImageBody(response, 5 * 1024 * 1024),
    (e) => e instanceof ImageTooLarge);
  assert.ok(cancelled, "the stream must be cancelled, not read to the end");
  assert.ok(produced < 200,
    `read ${produced}MB before stopping — the cap must abort the download`);
});

test("too large is reported as its own outcome", async () => {
  const body = new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() {},
  });
  await assert.rejects(
    () => limitedImageBody(new Response(body, { headers: { "content-type": "image/png" } }), 1024),
    (e) => e instanceof ImageTooLarge && typeof e.bytes === "number");
});
