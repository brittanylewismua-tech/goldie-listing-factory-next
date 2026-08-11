import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the branded Listing Factory", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Goldie Listing Factory/);
  assert.match(html, /Your Printify account/);
  assert.match(html, /Choose your Printify product template/);
  assert.match(html, /Add your finished designs/);
  assert.match(html, /Choose individual images/);
  assert.match(html, /already be upscaled/);
  assert.match(html, /transparent-background PNG/);
  assert.match(html, /Create Printify drafts/);
  assert.match(html, /20 finished designs/);
  assert.match(html, /75 MB/);
  assert.match(html, /500 MB/);
  assert.match(html, /Listings remain unpublished/);
  assert.doesNotMatch(html, /pink-dorm-collage|rich-man-poster|cowgirl-disco|newest batch will open/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("uses individual shop-aware Printify editor buttons", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Edit in Printify/);
  assert.match(page, /openedDrafts/);
  assert.match(page, /\/app\/store\/\$\{draft\.shopId\}\/products\/1/);
  assert.doesNotMatch(page, /openLatestBatch|Open .* drafts in Printify/);
  assert.match(route, /shopId: shop\.id/);
  assert.match(page, /MAX_BATCH_FILES = 20/);
  assert.match(page, /MAX_FILE_BYTES = 75 \* 1024 \* 1024/);
  assert.match(page, /MAX_BATCH_BYTES = 500 \* 1024 \* 1024/);
  assert.match(page, /4\.5 \* 1024 \* 1024/);
  assert.match(route, /response\.status === 429/);
});

test("ships official brand assets and removes the starter", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /goldie-wordmark\.webp/);
  assert.match(layout, /Goldie Listing Factory/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/goldie-logo.png", import.meta.url));
  await assert.rejects(access(new URL("../app\/_sites-preview\/SkeletonPreview.tsx", import.meta.url)));
});
