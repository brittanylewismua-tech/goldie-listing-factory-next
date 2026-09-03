import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("D1004: runtime fallbacks cannot send customers back to ChatGPT hosting", async () => {
  const files = await Promise.all([
    "../app/billing.ts",
    "../app/api/etsy/client.ts",
    "../app/api/mockups/analyze/route.ts",
    "../app/account/sign-out/route.ts",
    "../app/chatgpt-auth.ts",
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.doesNotMatch(files.join("\n"), /chatgpt\.site/);
  assert.doesNotMatch(files.join("\n"), /signin-with-chatgpt|signout-with-chatgpt/);
  assert.match(files[0], /GOLDIE_SITE_URL is not configured/);
  assert.match(files[1], /ETSY_REDIRECT_URI is not configured/);
  assert.match(files[2], /url\.origin === new URL\(request\.url\)\.origin/);
  assert.match(files[3], /NextResponse\.redirect\(new URL\(returnTo, url\.origin\)\)/);
});

test("D1006: the production domain terminates on the Cloudflare Worker", async () => {
  const config = await readFile(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8");
  assert.match(config, /"pattern": "thegoldiesuite\.com", "custom_domain": true/);
  assert.match(config, /"GOLDIE_SITE_URL": "https:\/\/thegoldiesuite\.com"/);
  assert.match(config, /"ETSY_REDIRECT_URI": "https:\/\/thegoldiesuite\.com\/api\/etsy\/callback"/);
  assert.doesNotMatch(config, /chatgpt\.site/);
});
