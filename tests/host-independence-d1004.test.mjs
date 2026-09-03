import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("D1004: runtime fallbacks cannot send customers back to ChatGPT hosting", async () => {
  const files = await Promise.all([
    "../app/billing.ts",
    "../app/api/etsy/client.ts",
    "../app/api/mockups/analyze/route.ts",
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.doesNotMatch(files.join("\n"), /chatgpt\.site/);
  assert.match(files[0], /GOLDIE_SITE_URL is not configured/);
  assert.match(files[1], /ETSY_REDIRECT_URI is not configured/);
  assert.match(files[2], /url\.origin === new URL\(request\.url\)\.origin/);
});
